import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { QueueService } from '../src/infrastructure/queue.service'
import { CatalogStatsSyncService } from '../src/modules/catalog/catalog-stats-sync.service'
import type { SyncJobService } from '../src/modules/import/sync-job.service'

const syncJob = {
  id: '88',
  jobType: 'catalog_stats_sync',
  sourceId: 'catalog_stats',
  status: 'pending' as const,
  totalCount: 0,
  successCount: 0,
  failedCount: 0,
  errorMessage: null,
  metadata: { limit: 100, missingOnly: true },
  startedAt: null,
  finishedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('CatalogStatsSyncService', () => {
  it('creates and enqueues an all-missing catalog stats sync job', async () => {
    const syncJobs = {
      createCatalogStatsSync: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueCatalogStatsSync: vi.fn().mockResolvedValue(undefined) }
    const service = new CatalogStatsSyncService(
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    await expect(service.create({ all: true, missingOnly: true })).resolves.toEqual(syncJob)
    expect(syncJobs.createCatalogStatsSync).toHaveBeenCalledWith({
      limit: null,
      missingOnly: true,
      all: true,
    })
    expect(queue.enqueueCatalogStatsSync).toHaveBeenCalledWith({
      syncJobId: '88',
      limit: null,
      missingOnly: true,
      all: true,
    })
  })

  it('rejects unsafe limits', async () => {
    const service = new CatalogStatsSyncService({} as SyncJobService, {} as QueueService)
    await expect(service.create({ limit: 50_000 })).rejects.toBeInstanceOf(BadRequestException)
  })
})
