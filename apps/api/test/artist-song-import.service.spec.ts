import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import type { QueueService } from '../src/infrastructure/queue.service'
import { ArtistSongImportService } from '../src/modules/import/artist-song-import.service'
import type { SyncJobService } from '../src/modules/import/sync-job.service'

const syncJob = {
  id: '51',
  jobType: 'artist_song_import',
  sourceId: 'artist:7:netease:123',
  status: 'pending' as const,
  totalCount: 0,
  successCount: 0,
  failedCount: 0,
  errorMessage: null,
  metadata: {},
  startedAt: null,
  finishedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('ArtistSongImportService', () => {
  it('enqueues a bounded import for a confirmed Japanese artist', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{ artist_id: '7', netease_artist_id: '123', artist_name: 'Aimer' }],
      }),
    }
    const syncJobs = {
      createArtistSongImport: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueArtistSongImport: vi.fn().mockResolvedValue(undefined) }
    const service = new ArtistSongImportService(
      database as unknown as DatabaseService,
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    await expect(service.createForArtist('7', { maxSongs: 300 })).resolves.toEqual(syncJob)
    expect(queue.enqueueArtistSongImport).toHaveBeenCalledWith({
      syncJobId: '51',
      artistId: '7',
      neteaseArtistId: '123',
      artistName: 'Aimer',
      maxSongs: 300,
      offset: 0,
    })
  })

  it('rejects unconfirmed artists and unsafe limits', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const service = new ArtistSongImportService(
      database as unknown as DatabaseService,
      {} as SyncJobService,
      {} as QueueService,
    )
    await expect(service.createForArtist('7', {})).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.createForArtist('7', { maxSongs: 20_000 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
