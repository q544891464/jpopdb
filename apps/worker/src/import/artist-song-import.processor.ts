import type { Job } from 'bullmq'

import { NeteaseApiError } from '../netease/netease.client'
import type { NeteaseClient } from '../netease/netease.client'
import type { NeteaseSong, NeteaseWikiTag } from '../netease/netease.types'
import type { PlaylistImportRepository } from './playlist-import.repository'

export const ARTIST_SONG_IMPORT_JOB = 'artist-song-import'

export type ArtistSongImportJobData = {
  syncJobId: string
  artistId: string
  neteaseArtistId: string
  artistName: string
  maxSongs: number
  offset?: number
}

export class ArtistSongImportProcessor {
  constructor(
    private readonly netease: NeteaseClient,
    private readonly repository: PlaylistImportRepository,
  ) {}

  async process(job: Job<ArtistSongImportJobData>): Promise<void> {
    const { syncJobId, neteaseArtistId, artistName, maxSongs, offset = 0 } = job.data
    try {
      await this.repository.markRunning(syncJobId)
      const result = await this.netease.getArtistSongs(neteaseArtistId, maxSongs, offset)
      await this.repository.setTotal(syncJobId, result.songs.length)

      let successCount = 0
      let failedCount = 0
      const errors: string[] = []
      for (const [index, song] of result.songs.entries()) {
        if (await this.persistOne(song, artistName, errors, syncJobId)) {
          successCount += 1
        } else {
          failedCount += 1
        }
        if ((index + 1) % 10 === 0 || index === result.songs.length - 1) {
          await this.repository.updateProgress(syncJobId, successCount, failedCount)
          await job.updateProgress({ successCount, failedCount })
        }
      }

      const truncationMessage = result.truncated
        ? `网易云共返回 ${result.total} 首关联歌曲，本次按安全上限导入 ${result.songs.length} 首`
        : null
      await this.repository.updateJobMetadata(syncJobId, {
        offset,
        maxSongs,
        totalAvailable: result.total,
        truncated: result.truncated,
        importedSongCount: result.songs.length,
        nextOffset: offset + result.songs.length,
      })
      const status = failedCount === 0 ? 'success' : successCount > 0 ? 'partial_success' : 'failed'
      await this.repository.markFinished(
        syncJobId,
        status,
        successCount,
        failedCount,
        [...errors.slice(0, 5), ...(truncationMessage ? [truncationMessage] : [])].join('; ') || null,
      )
    } catch (error) {
      const message = this.describeError(error)
      const maxAttempts = job.opts.attempts ?? 1
      const isRecoverable =
        !(error instanceof NeteaseApiError) ||
        ['network_error', 'timeout', 'rate_limited'].includes(error.category)
      const isRetrying = isRecoverable && job.attemptsMade + 1 < maxAttempts
      if (isRetrying) {
        await this.repository.markRetry(
          syncJobId,
          `${message}，任务将自动重试（${job.attemptsMade + 1}/${maxAttempts}）`,
        )
      } else {
        await this.repository.markFinished(syncJobId, 'failed', 0, 0, message)
      }
      if (!isRecoverable) job.discard()
      throw error
    }
  }

  private async persistOne(
    song: NeteaseSong,
    artistName: string,
    errors: string[],
    syncJobId: string,
  ): Promise<boolean> {
    try {
      const wikiTags = await this.fetchWikiTags(song)
      const songId = await this.repository.persistArtistSong(song, artistName, wikiTags)
      await this.repository.recordSongJobItem(syncJobId, {
        songId,
        neteaseSongId: String(song.id),
        songName: song.name,
        artistNames: song.ar.map((artist) => artist.name),
        status: 'success',
        message: wikiTags
          ? `已从确认艺人 ${artistName} 导入，保存 ${wikiTags.length} 个网易云百科标签`
          : `已从确认艺人 ${artistName} 导入`,
        raw: song,
      })
      return true
    } catch (error) {
      const message = `歌曲 ${song.id} 保存失败: ${this.describeError(error)}`
      errors.push(message)
      await this.repository.recordSongJobItem(syncJobId, {
        songId: null,
        neteaseSongId: String(song.id),
        songName: song.name,
        artistNames: song.ar.map((artist) => artist.name),
        status: 'failed',
        message,
      })
      return false
    }
  }

  private async fetchWikiTags(song: NeteaseSong): Promise<NeteaseWikiTag[] | undefined> {
    try {
      return (await this.netease.getSongWikiSummary(String(song.id))).tags
    } catch {
      return undefined
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof NeteaseApiError) {
      return `${error.message} [${error.category}]`
    }
    return error instanceof Error ? error.message : '未知艺人歌曲导入错误'
  }
}
