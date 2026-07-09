import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { QueueService } from '../../infrastructure/queue.service'
import type { SyncJobResponse } from '../import/sync-job.types'
import { SyncJobService } from '../import/sync-job.service'

@Injectable()
export class CatalogStatsSyncService {
  constructor(
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
    @Inject(QueueService) private readonly queue: QueueService,
  ) {}

  async create(body: unknown): Promise<SyncJobResponse> {
    const all = this.readBoolean(body, 'all', false)
    const limit = all ? null : this.readPositiveInteger(body, 'limit', 1_000, 10_000)
    const missingOnly = this.readBoolean(body, 'missingOnly', true)
    const job = await this.syncJobs.createCatalogStatsSync({ limit, missingOnly, all })

    try {
      await this.queue.enqueueCatalogStatsSync({ syncJobId: job.id, limit, missingOnly, all })
    } catch {
      await this.syncJobs.markQueueFailure(job.id, '任务队列暂不可用')
      throw new ServiceUnavailableException('任务队列暂不可用，请稍后重试')
    }

    return job
  }

  private readPositiveInteger(
    body: unknown,
    field: string,
    defaultValue: number,
    maximum: number,
  ): number {
    if (typeof body !== 'object' || body === null || !(field in body)) return defaultValue
    const value = (body as Record<string, unknown>)[field]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
      throw new BadRequestException(`${field} 必须是 1 到 ${maximum} 之间的整数`)
    }
    return value
  }

  private readBoolean(body: unknown, field: string, defaultValue: boolean): boolean {
    if (typeof body !== 'object' || body === null || !(field in body)) return defaultValue
    const value = (body as Record<string, unknown>)[field]
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} 必须是布尔值`)
    }
    return value
  }
}
