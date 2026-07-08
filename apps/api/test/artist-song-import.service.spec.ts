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

const secondSyncJob = {
  ...syncJob,
  id: '52',
  sourceId: 'artist:8:netease:456',
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

  it('manually confirms a Netease artist and enqueues song import', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{ artist_id: '8', netease_artist_id: '456', artist_name: 'YOASOBI' }],
      }),
    }
    const syncJobs = {
      createArtistSongImport: vi.fn().mockResolvedValue(secondSyncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueArtistSongImport: vi.fn().mockResolvedValue(undefined) }
    const service = new ArtistSongImportService(
      database as unknown as DatabaseService,
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    await expect(service.createManualArtistImport({
      neteaseArtistId: '456',
      artistName: 'YOASOBI',
      maxSongs: 500,
    })).resolves.toEqual(secondSyncJob)

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('upserted_identity'), [
      '456',
      'YOASOBI',
      JSON.stringify({
        manual_import: true,
        neteaseArtistId: '456',
        artistName: 'YOASOBI',
      }),
    ])
    expect(queue.enqueueArtistSongImport).toHaveBeenCalledWith({
      syncJobId: '52',
      artistId: '8',
      neteaseArtistId: '456',
      artistName: 'YOASOBI',
      maxSongs: 500,
      offset: 0,
    })
  })

  it('continues truncated artist imports from the next offset', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          artist_id: '8',
          netease_artist_id: '456',
          artist_name: 'YOASOBI',
          metadata: { nextOffset: 500, totalAvailable: 1200, truncated: true },
        }],
      }),
    }
    const syncJobs = {
      createArtistSongImport: vi.fn().mockResolvedValue(secondSyncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueArtistSongImport: vi.fn().mockResolvedValue(undefined) }
    const service = new ArtistSongImportService(
      database as unknown as DatabaseService,
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    const result = await service.continueTruncatedImports({ maxArtists: 5, maxSongsPerArtist: 500 })

    expect(result.queuedCount).toBe(1)
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), [5, 500])
    expect(queue.enqueueArtistSongImport).toHaveBeenCalledWith({
      syncJobId: '52',
      artistId: '8',
      neteaseArtistId: '456',
      artistName: 'YOASOBI',
      maxSongs: 500,
      offset: 500,
    })
  })

  it('continues legacy capped artist imports from the imported count', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          artist_id: '8',
          netease_artist_id: '456',
          artist_name: 'YOASOBI',
          metadata: {},
          legacy_offset: 500,
        }],
      }),
    }
    const syncJobs = {
      createArtistSongImport: vi.fn().mockResolvedValue(secondSyncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueArtistSongImport: vi.fn().mockResolvedValue(undefined) }
    const service = new ArtistSongImportService(
      database as unknown as DatabaseService,
      syncJobs as unknown as SyncJobService,
      queue as unknown as QueueService,
    )

    const result = await service.continueTruncatedImports({ maxArtists: 5, maxSongsPerArtist: 500 })

    expect(result.queuedCount).toBe(1)
    expect(queue.enqueueArtistSongImport).toHaveBeenCalledWith({
      syncJobId: '52',
      artistId: '8',
      neteaseArtistId: '456',
      artistName: 'YOASOBI',
      maxSongs: 500,
      offset: 500,
    })
  })
})
