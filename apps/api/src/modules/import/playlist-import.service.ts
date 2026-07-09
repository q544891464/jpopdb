import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { QueueService } from '../../infrastructure/queue.service'
import type { SyncJobResponse } from './sync-job.types'
import { SyncJobService } from './sync-job.service'

@Injectable()
export class PlaylistImportService {
  constructor(
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
    @Inject(QueueService) private readonly queue: QueueService,
  ) {}

  async create(body: unknown): Promise<SyncJobResponse> {
    const playlistId = this.readPlaylistId(body)
    const syncJob = await this.syncJobs.createPlaylistImport(playlistId)

    try {
      await this.queue.enqueuePlaylistImport({ syncJobId: syncJob.id, playlistId })
    } catch {
      await this.syncJobs.markQueueFailure(syncJob.id, '任务队列暂不可用')
      throw new ServiceUnavailableException('任务队列暂不可用，请稍后重试')
    }

    return syncJob
  }

  private readPlaylistId(body: unknown): string {
    if (typeof body !== 'object' || body === null || !('playlistId' in body)) {
      throw new BadRequestException('playlistId 是必填项')
    }
    const value = (body as { playlistId?: unknown }).playlistId
    const playlistId = typeof value === 'number' ? String(value) : value

    if (typeof playlistId !== 'string') {
      throw new BadRequestException('playlistId 必须是网易云歌单数字 ID 或分享链接')
    }
    const parsed = this.extractPlaylistId(playlistId)
    if (!parsed) {
      throw new BadRequestException('playlistId 必须是网易云歌单数字 ID 或包含 id 的分享链接')
    }
    return parsed
  }

  private extractPlaylistId(value: string): string | null {
    const trimmed = value.trim()
    if (/^\d{1,20}$/u.test(trimmed)) return trimmed
    const idParam = trimmed.match(/[?&#]id=(\d{1,20})(?:\D|$)/iu)
    if (idParam?.[1]) return idParam[1]
    const pathId = trimmed.match(/\/playlist\/(\d{1,20})(?:\D|$)/iu)
    return pathId?.[1] ?? null
  }
}
