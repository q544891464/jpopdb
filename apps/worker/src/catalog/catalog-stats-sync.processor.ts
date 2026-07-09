import type { Job } from 'bullmq'

import type { NeteaseClient } from '../netease/netease.client'
import { NeteaseApiError } from '../netease/netease.client'
import type { CatalogStatsSyncRepository } from './catalog-stats-sync.repository'

export const CATALOG_STATS_SYNC_JOB = 'catalog-stats-sync'

export type CatalogStatsSyncJobData = {
  syncJobId: string
  limit: number | null
  missingOnly: boolean
  all: boolean
}

export class CatalogStatsSyncProcessor {
  constructor(
    private readonly netease: NeteaseClient,
    private readonly repository: CatalogStatsSyncRepository,
  ) {}

  async process(job: Job<CatalogStatsSyncJobData>): Promise<void> {
    const { syncJobId, limit, missingOnly, all } = job.data
    try {
      await this.repository.markRunning(syncJobId)
      const targets = await this.repository.findTargets(all ? null : limit, missingOnly)
      await this.repository.setTotal(syncJobId, targets.length)
      await this.repository.updateJobMetadata(syncJobId, {
        limit,
        missingOnly,
        all,
        matchedSongCount: targets.length,
      })

      let successCount = 0
      let failedCount = 0
      const errors: string[] = []

      for (const [index, target] of targets.entries()) {
        try {
          const stats = await this.netease.getCatalogStats(
            target.neteaseSongId,
            target.neteaseAlbumId,
          )
          await this.repository.updateStats(target, stats)
          await this.repository.recordSongItem(syncJobId, {
            songId: target.songId,
            neteaseSongId: target.neteaseSongId,
            songName: target.songName,
            artistNames: target.artistNames,
            status: 'success',
            message: this.describeStats(stats),
            raw: {
              popularity: stats.popularity,
              redCount: stats.redCount,
              commentCount: stats.commentCount,
              publishTime: stats.publishTime?.toISOString() ?? null,
            },
          })
          successCount += 1
        } catch (error) {
          const message = this.describeError(error)
          failedCount += 1
          errors.push(`歌曲 ${target.neteaseSongId} 同步失败: ${message}`)
          await this.repository.recordSongItem(syncJobId, {
            songId: target.songId,
            neteaseSongId: target.neteaseSongId,
            songName: target.songName,
            artistNames: target.artistNames,
            status: 'failed',
            message,
          })
        }

        if ((index + 1) % 5 === 0 || index === targets.length - 1) {
          await this.repository.updateProgress(syncJobId, successCount, failedCount)
          await job.updateProgress({ successCount, failedCount })
        }
      }

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
      if (!isRecoverable) job.discard()
      throw error
    }
  }

  private describeStats(stats: {
    popularity: number | null
    redCount: number | null
    commentCount: number | null
    publishTime: Date | null
  }): string {
    return [
      `热度 ${stats.popularity ?? '未知'}`,
      `红心 ${stats.redCount ?? '未知'}`,
      `评论 ${stats.commentCount ?? '未知'}`,
      stats.publishTime ? `发行 ${stats.publishTime.toISOString().slice(0, 10)}` : null,
    ].filter((item): item is string => item !== null).join(' · ')
  }

  private describeError(error: unknown): string {
    if (error instanceof NeteaseApiError) {
      return `${error.message} [${error.category}]`
    }
    return error instanceof Error ? error.message : '未知网易云统计同步错误'
  }
}
