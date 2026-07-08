import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import type { QueueService } from '../src/infrastructure/queue.service'
import { ArtistIdentityService } from '../src/modules/artists/artist-identity.service'
import type { ArtistSongImportService } from '../src/modules/import/artist-song-import.service'
import type { SyncJobService } from '../src/modules/import/sync-job.service'

describe('ArtistIdentityService', () => {
  it('manually confirms a Japanese artist identity', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              artist_id: '1',
              netease_artist_id: '123',
              artist_name: 'Aimer',
              song_count: 3,
              is_japanese: null,
              country: null,
              confidence: null,
              status: null,
              source_summary: {},
              reviewed_by: null,
              reviewed_at: null,
              updated_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ song_count: 3 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              artist_id: '1',
              netease_artist_id: '123',
              artist_name: 'Aimer',
              song_count: 3,
              is_japanese: true,
              country: 'JP',
              confidence: '100',
              status: 'confirmed_by_manual',
              source_summary: { manual_review: { isJapanese: true } },
              reviewed_by: 'admin',
              reviewed_at: new Date('2026-06-16T00:00:00Z'),
              updated_at: new Date('2026-06-16T00:00:00Z'),
            },
          ],
        }),
    }
    const queue = { enqueueSongScreening: vi.fn().mockResolvedValue(undefined) }
    const syncJob = {
      id: '9',
      jobType: 'song_screening',
      sourceId: 'artist:1',
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
      createSongScreening: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const artistSongImports = {
      createForArtist: vi.fn().mockResolvedValue({
        ...syncJob,
        id: '10',
        jobType: 'artist_song_import',
      }),
    }
    const service = new ArtistIdentityService(
      database as unknown as DatabaseService,
      queue as unknown as QueueService,
      syncJobs as unknown as SyncJobService,
      artistSongImports as unknown as ArtistSongImportService,
    )

    const result = await service.reviewIdentity('1', {
      isJapanese: true,
      reviewer: 'admin',
      reason: 'known Japanese artist',
      rescreenSongs: true,
    })

    expect(result.status).toBe('confirmed_by_manual')
    expect(result.isJapanese).toBe(true)
    expect(result.rescreenJob).toEqual(syncJob)
    expect(result.rescreenSongCount).toBe(3)
    expect(result.importJob?.jobType).toBe('artist_song_import')
    expect(syncJobs.createSongScreening).toHaveBeenCalledWith('artist:1')
    expect(queue.enqueueSongScreening).toHaveBeenCalledWith({
      syncJobId: '9',
      artistId: '1',
      limit: 3,
    })
    expect(database.query).toHaveBeenCalledTimes(5)
  })

  it('rejects an invalid artist review payload', async () => {
    const service = new ArtistIdentityService(
      {} as DatabaseService,
      {} as QueueService,
      {} as SyncJobService,
      {} as ArtistSongImportService,
    )
    await expect(service.reviewIdentity('1', { isJapanese: 'yes' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
