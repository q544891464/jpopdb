import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import type { QueueService } from '../src/infrastructure/queue.service'
import type { SyncJobService } from '../src/modules/import/sync-job.service'
import { ScreeningService } from '../src/modules/screening/screening.service'

describe('ScreeningService', () => {
  it('creates and enqueues a song screening job', async () => {
    const syncJob = {
      id: '7',
      jobType: 'song_screening',
      sourceId: 'pending:20',
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
    const queue = { enqueueSongScreening: vi.fn().mockResolvedValue(undefined) }
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      queue as unknown as QueueService,
      syncJobs as unknown as SyncJobService,
    )

    await expect(service.createScreeningJob({ status: 'pending', limit: 20 })).resolves.toEqual(syncJob)
    expect(queue.enqueueSongScreening).toHaveBeenCalledWith({
      syncJobId: '7',
      status: 'pending',
      limit: 20,
    })
  })

  it('rejects an invalid screening limit', async () => {
    const service = new ScreeningService({} as DatabaseService, {} as QueueService, {} as SyncJobService)
    await expect(service.createScreeningJob({ status: 'pending', limit: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('returns artist identity summaries with candidate songs', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            song_id: '10',
            netease_song_id: '60198',
            song_name: 'Test Song',
            artist_names: ['DECO*27'],
            artist_identities: [
              {
                artistId: '960',
                artistName: 'DECO*27',
                neteaseArtistId: '14001',
                isJapanese: true,
                country: 'JP',
                confidence: 100,
                status: 'confirmed_by_manual',
                reviewedBy: 'admin',
                reviewedAt: '2026-06-16T00:00:00.000Z',
              },
            ],
            album_name: 'Test Album',
            playlist_names: ['Vocaloid'],
            score: '90.00',
            status: 'accepted',
            is_japanese_candidate: true,
            reason: {},
            reviewed_by: null,
            reviewed_at: null,
            updated_at: new Date('2026-06-16T00:00:00Z'),
          },
        ],
      }),
    }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      {} as QueueService,
      {} as SyncJobService,
    )

    await expect(service.findCandidates('accepted', 5, 'manual_artist')).resolves.toEqual({
      items: [
        expect.objectContaining({
          songId: '10',
          artistIdentities: [
            expect.objectContaining({
              artistId: '960',
              status: 'confirmed_by_manual',
              reviewedAt: '2026-06-16T00:00:00.000Z',
            }),
          ],
        }),
      ],
    })
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('filter_identity.reviewed_at IS NOT NULL'), [
      'accepted',
      5,
    ])
  })

  it('returns screening workspace stats', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            total_songs: 100,
            accepted_songs: 20,
            pending_songs: 30,
            rejected_songs: 50,
            unscreened_songs: 14,
            manually_reviewed_songs: 12,
            manual_artist_songs: 8,
            needs_artist_review_songs: 18,
            manual_artist_pending_songs: 3,
            high_score_pending_songs: 4,
            lyric_fallback_songs: 2,
            confirmed_artists: 10,
            manual_confirmed_artists: 6,
          },
        ],
      }),
    }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      {} as QueueService,
      {} as SyncJobService,
    )

    await expect(service.getStats()).resolves.toEqual({
      totalSongs: 100,
      acceptedSongs: 20,
      pendingSongs: 30,
      rejectedSongs: 50,
      unscreenedSongs: 14,
      manuallyReviewedSongs: 12,
      manualArtistSongs: 8,
      needsArtistReviewSongs: 18,
      manualArtistPendingSongs: 3,
      highScorePendingSongs: 4,
      lyricFallbackSongs: 2,
      confirmedArtists: 10,
      manualConfirmedArtists: 6,
      lastfmConfigured: Boolean(process.env.LASTFM_API_KEY),
    })
    expect(String(database.query.mock.calls[0]?.[0])).toContain('WITH estimates AS')
    expect(String(database.query.mock.calls[0]?.[0])).toContain('reltuples::int')
    expect(String(database.query.mock.calls[0]?.[0])).toContain('song_artist_review_flags')
  })

  it('records the previous status when manually reviewing a song', async () => {
    const updatedAt = new Date('2026-06-16T00:00:00Z')
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [{ id: '1', status: 'accepted' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              song_id: '20',
              netease_song_id: '12345',
              song_name: 'Reviewed Song',
              artist_names: ['Aimer'],
              artist_identities: [],
              album_name: 'Album',
              playlist_names: [],
              score: '80.00',
              status: 'accepted',
              is_japanese_candidate: true,
              reason: { manual_review: { status: 'accepted' } },
              reviewed_by: 'admin',
              reviewed_at: updatedAt,
              updated_at: updatedAt,
            },
          ],
        }),
    }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      {} as QueueService,
      {} as SyncJobService,
    )

    const result = await service.reviewSong('20', {
      status: 'accepted',
      reviewer: 'admin',
      reason: 'confirmed manually',
    })

    expect(result.status).toBe('accepted')
    expect(database.query.mock.calls[2]?.[1]).toEqual([
      '20',
      'pending',
      'accepted',
      'confirmed manually',
      'admin',
    ])
  })

  it('filters candidates by lyric fallback evidence', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            song_id: '20',
            netease_song_id: '12345',
            song_name: 'Fallback Song',
            artist_names: ['Unknown Producer'],
            artist_identities: [],
            album_name: null,
            playlist_names: [],
            score: '60.00',
            status: 'pending',
            is_japanese_candidate: false,
            reason: {
              fallback: {
                lyric_checked: true,
                passed: true,
                kana_count: 80,
                kana_ratio: 0.42,
                source: 'netease_lyric',
              },
            },
            reviewed_by: null,
            reviewed_at: null,
            updated_at: new Date('2026-06-16T00:00:00Z'),
          },
        ],
      }),
    }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      {} as QueueService,
      {} as SyncJobService,
    )

    await expect(service.findCandidates('pending', 10, 'lyric_fallback')).resolves.toEqual({
      items: [
        expect.objectContaining({
          songId: '20',
          reason: expect.objectContaining({
            fallback: expect.objectContaining({ passed: true }),
          }),
        }),
      ],
    })
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("screening.reason->'fallback'->>'passed' = 'true'"),
      ['pending', 10],
    )
  })

  it('creates and enqueues a single-song rescreening job', async () => {
    const syncJob = {
      id: '8',
      jobType: 'song_screening',
      sourceId: 'song:10',
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
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              song_id: '10',
              netease_song_id: '60198',
              song_name: 'Test Song',
              artist_names: ['DECO*27'],
              artist_identities: [],
              album_name: 'Test Album',
              playlist_names: [],
              score: '0.00',
              status: 'pending',
              is_japanese_candidate: false,
              reason: {},
              reviewed_by: null,
              reviewed_at: null,
              updated_at: new Date('2026-06-16T00:00:00Z'),
            },
          ],
        }),
    }
    const syncJobs = {
      createSongScreening: vi.fn().mockResolvedValue(syncJob),
      markQueueFailure: vi.fn(),
    }
    const queue = { enqueueSongScreening: vi.fn().mockResolvedValue(undefined) }
    const service = new ScreeningService(
      database as unknown as DatabaseService,
      queue as unknown as QueueService,
      syncJobs as unknown as SyncJobService,
    )

    await expect(service.createSongRescreenJob('10')).resolves.toEqual(syncJob)
    expect(syncJobs.createSongScreening).toHaveBeenCalledWith('song:10')
    expect(queue.enqueueSongScreening).toHaveBeenCalledWith({
      syncJobId: '8',
      songId: '10',
      limit: 1,
    })
  })
})
