import type { Job } from 'bullmq'

import { NeteaseApiError } from '../netease/netease.client'
import type { NeteaseClient } from '../netease/netease.client'
import type { NeteaseSong, NeteaseWikiTag } from '../netease/netease.types'
import type { PlaylistImportRepository } from './playlist-import.repository'

export const PLAYLIST_IMPORT_JOB = 'playlist-import'

export type PlaylistImportJobData = {
  syncJobId: string
  playlistId: string
}

export class PlaylistImportProcessor {
  constructor(
    private readonly netease: NeteaseClient,
    private readonly repository: PlaylistImportRepository,
  ) {}

  async process(job: Job<PlaylistImportJobData>): Promise<void> {
    const { syncJobId, playlistId } = job.data
    try {
      await this.repository.markRunning(syncJobId)
      const playlistResult = await this.netease.getPlaylistDetail(playlistId)
      const songResults = await this.netease.getSongDetails(playlistResult.trackIds)
      const songs = songResults.flatMap((result) => result.songs)
      const songsById = new Map(songs.map((song) => [String(song.id), song]))
      const localPlaylistId = await this.repository.upsertPlaylist(
        playlistResult.playlist,
        playlistResult.raw,
      )

      await this.repository.setTotal(syncJobId, playlistResult.trackIds.length)
      let successCount = 0
      let failedCount = 0
      const errors: string[] = []

      for (const [position, songId] of playlistResult.trackIds.entries()) {
        const song = songsById.get(songId)
        if (!song) {
          failedCount += 1
          const message = `歌曲 ${songId} 无法获取详情`
          errors.push(message)
          await this.repository.recordSongJobItem(syncJobId, {
            songId: null,
            neteaseSongId: songId,
            songName: `网易云歌曲 ${songId}`,
            artistNames: [],
            status: 'failed',
            message,
          })
        } else {
          const succeeded = await this.persistOne(localPlaylistId, song, position, errors, syncJobId)
          if (succeeded) {
            successCount += 1
          } else {
            failedCount += 1
          }
        }

        if ((position + 1) % 10 === 0 || position === playlistResult.trackIds.length - 1) {
          await this.repository.updateProgress(syncJobId, successCount, failedCount)
          await job.updateProgress({ successCount, failedCount })
        }
      }

      await this.repository.prunePlaylistSongs(localPlaylistId, playlistResult.trackIds)

      const status = failedCount === 0 ? 'success' : successCount > 0 ? 'partial_success' : 'failed'
      await this.repository.markFinished(
        syncJobId,
        status,
        successCount,
        failedCount,
        errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
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
      if (!isRecoverable) {
        job.discard()
      }
      throw error
    }
  }

  private async persistOne(
    playlistId: string,
    song: NeteaseSong,
    position: number,
    errors: string[],
    syncJobId: string,
  ): Promise<boolean> {
    try {
      const wikiTags = await this.fetchWikiTags(song)
      const songId = await this.repository.persistSong(playlistId, song, position, wikiTags)
      await this.repository.recordSongJobItem(syncJobId, {
        songId,
        neteaseSongId: String(song.id),
        songName: song.name,
        artistNames: song.ar.map((artist) => artist.name),
        status: 'success',
        message: wikiTags ? `已导入，保存 ${wikiTags.length} 个网易云百科标签` : '已导入',
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
    return error instanceof Error ? error.message : '未知导入错误'
  }
}
