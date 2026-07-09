import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { QueueService } from '../src/infrastructure/queue.service'
import { PlaylistImportService } from '../src/modules/import/playlist-import.service'
import type { SyncJobService } from '../src/modules/import/sync-job.service'

describe('PlaylistImportService', () => {
  it('creates and enqueues a playlist import', async () => {
    const syncJob = {
      id: '1',
      jobType: 'playlist_import',
      sourceId: '60198',
      status: 'pending' as const,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const syncJobs = {
      createPlaylistImport: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueuePlaylistImport: vi.fn().mockResolvedValue(undefined) }
    const service = new PlaylistImportService(
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    await expect(service.create({ playlistId: '60198' })).resolves.toEqual(syncJob)
    expect(queue.enqueuePlaylistImport).toHaveBeenCalledWith({
      syncJobId: '1',
      playlistId: '60198',
    })
  })

  it('extracts a playlist id from a Netease share url', async () => {
    const syncJob = {
      id: '2',
      jobType: 'playlist_import',
      sourceId: '60198',
      status: 'pending' as const,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const syncJobs = {
      createPlaylistImport: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueuePlaylistImport: vi.fn().mockResolvedValue(undefined) }
    const service = new PlaylistImportService(
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    await expect(service.create({
      playlistId: 'https://music.163.com/#/playlist?id=60198&userid=1',
    })).resolves.toEqual(syncJob)
    expect(syncJobs.createPlaylistImport).toHaveBeenCalledWith('60198')
    expect(queue.enqueuePlaylistImport).toHaveBeenCalledWith({
      syncJobId: '2',
      playlistId: '60198',
    })
  })

  it('rejects a value without a playlist id', async () => {
    const service = new PlaylistImportService({} as SyncJobService, {} as QueueService)
    await expect(service.create({ playlistId: 'abc' })).rejects.toBeInstanceOf(BadRequestException)
  })
})
