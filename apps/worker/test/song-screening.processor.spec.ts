import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'

import { SongScreeningProcessor } from '../src/screening/song-screening.processor'
import type { ScreeningRepository } from '../src/screening/screening.repository'
import type { ArtistIdentity, ScreeningCandidate, SongScreeningJobData } from '../src/screening/screening.types'

function createRepository(identity: ArtistIdentity | null, overrides: Partial<ScreeningCandidate> = {}): ScreeningRepository {
  const artistId = identity?.artistId ?? '960'
  const candidate: ScreeningCandidate = {
    songId: '10',
    neteaseSongId: '10010',
    songName: 'Test Song',
    albumName: 'Test Album',
    artists: [
      {
        artistId,
        artistName: identity?.artistName ?? 'DECO*27',
        identity,
      },
    ],
    playlistNames: [],
    reviewedAt: null,
    ...overrides,
  }
  return {
    markRunning: vi.fn().mockResolvedValue(undefined),
    setTotal: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    markFinished: vi.fn().mockResolvedValue(undefined),
    findCandidates: vi.fn().mockResolvedValue([candidate]),
    findCandidateBySongId: vi.fn().mockResolvedValue(candidate),
    findCandidatesByArtistId: vi.fn().mockResolvedValue([candidate]),
    getArtistIdentity: vi.fn().mockResolvedValue(identity),
    upsertArtistIdentity: vi.fn().mockResolvedValue(undefined),
    saveExternalMatch: vi.fn().mockResolvedValue(undefined),
    getLyricsCache: vi.fn().mockResolvedValue(null),
    saveLyricsCache: vi.fn().mockResolvedValue(undefined),
    saveScreening: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScreeningRepository
}

function createProcessor(
  repository: ScreeningRepository,
  options: {
    musicBrainz?: Record<string, unknown>
    wikidata?: Record<string, unknown>
    netease?: Record<string, unknown>
  } = {},
): SongScreeningProcessor {
  return new SongScreeningProcessor(
    repository,
    { searchArtist: vi.fn().mockResolvedValue(null), ...options.musicBrainz } as never,
    {
      findArtistByName: vi.fn().mockResolvedValue(null),
      findArtistByMusicBrainzId: vi.fn().mockResolvedValue(null),
      getArtistCountry: vi.fn().mockResolvedValue(null),
      ...options.wikidata,
    } as never,
    {
      isConfigured: vi.fn().mockReturnValue(false),
      getArtistTopTags: vi.fn(),
      getTrackTopTags: vi.fn(),
    } as never,
    {
      getLyric: vi.fn().mockResolvedValue({ rawLrc: null, translatedLrc: null, raw: {} }),
      ...options.netease,
    } as never,
  )
}

function createJob(): Job<SongScreeningJobData> {
  return {
    data: { syncJobId: '99', status: 'pending', limit: 1 },
    opts: { attempts: 1 },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SongScreeningJobData>
}

function createSingleSongJob(): Job<SongScreeningJobData> {
  return {
    data: { syncJobId: '100', songId: '10', limit: 1 },
    opts: { attempts: 1 },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SongScreeningJobData>
}

function createArtistSongJob(): Job<SongScreeningJobData> {
  return {
    data: { syncJobId: '101', artistId: '960', limit: 10 },
    opts: { attempts: 1 },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SongScreeningJobData>
}

describe('SongScreeningProcessor', () => {
  it('uses manually confirmed Japanese artist identity to accept a song', async () => {
    const repository = createRepository({
      artistId: '960',
      isJapanese: true,
      country: 'JP',
      confidence: 100,
      status: 'confirmed_by_manual',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    })
    const processor = createProcessor(repository)

    await processor.process(createJob())

    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      90,
      'accepted',
      expect.objectContaining({
        artist_identity: expect.objectContaining({
          artistId: '960',
          manual: true,
          status: 'confirmed_by_manual',
        }),
        positive: [expect.objectContaining({ source: 'manual_artist_identity', score: 90 })],
      }),
    )
  })

  it('uses manually rejected artist identity to reject a song', async () => {
    const repository = createRepository({
      artistId: '44',
      isJapanese: false,
      country: null,
      confidence: 100,
      status: 'rejected',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    })
    const processor = createProcessor(repository)

    await processor.process(createJob())

    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      0,
      'rejected',
      expect.objectContaining({
        artist_identity: expect.objectContaining({
          artistId: '44',
          manual: true,
          status: 'rejected',
        }),
        negative: [expect.objectContaining({ source: 'manual_artist_identity', score: -80 })],
      }),
    )
  })

  it('accepts a collaboration when any linked artist is confirmed Japanese', async () => {
    const japaneseIdentity: ArtistIdentity = {
      artistId: '960',
      artistName: 'DECO*27',
      isJapanese: true,
      country: 'JP',
      confidence: 100,
      status: 'confirmed_by_manual',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    }
    const rejectedIdentity: ArtistIdentity = {
      artistId: '44',
      artistName: 'Guest Artist',
      isJapanese: false,
      country: null,
      confidence: 100,
      status: 'rejected',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    }
    const repository = createRepository(null, {
      artists: [
        { artistId: '960', artistName: 'DECO*27', identity: japaneseIdentity },
        { artistId: '44', artistName: 'Guest Artist', identity: rejectedIdentity },
      ],
    })
    const processor = createProcessor(repository)

    await processor.process(createJob())

    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      90,
      'accepted',
      expect.objectContaining({
        artist_identity: expect.objectContaining({ artistId: '960' }),
        artist_identities: expect.arrayContaining([
          expect.objectContaining({ artistId: '960', status: 'confirmed_by_manual' }),
          expect.objectContaining({ artistId: '44', status: 'rejected' }),
        ]),
        negative: [],
      }),
    )
  })

  it('rejects a song when all linked artist identities are rejected', async () => {
    const firstIdentity: ArtistIdentity = {
      artistId: '44',
      artistName: 'Guest Artist',
      isJapanese: false,
      country: null,
      confidence: 100,
      status: 'rejected',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    }
    const secondIdentity: ArtistIdentity = {
      artistId: '45',
      artistName: 'Another Guest',
      isJapanese: false,
      country: null,
      confidence: 100,
      status: 'rejected',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    }
    const repository = createRepository(null, {
      artists: [
        { artistId: '44', artistName: 'Guest Artist', identity: firstIdentity },
        { artistId: '45', artistName: 'Another Guest', identity: secondIdentity },
      ],
    })
    const processor = createProcessor(repository)

    await processor.process(createJob())

    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      0,
      'rejected',
      expect.objectContaining({
        negative: [
          expect.objectContaining({ artistId: '44', score: -80 }),
          expect.objectContaining({ artistId: '45', score: -80 }),
        ],
      }),
    )
  })

  it('handles many unknown artists without querying more than five external identities', async () => {
    const repository = createRepository(null, {
      artists: Array.from({ length: 6 }, (_, index) => ({
        artistId: String(100 + index),
        artistName: `Unknown Artist ${index + 1}`,
        identity: null,
      })),
    })
    const processor = createProcessor(repository)

    await processor.process(createJob())

    expect(repository.upsertArtistIdentity).toHaveBeenCalledTimes(5)
    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      0,
      'rejected',
      expect.objectContaining({
        external: expect.objectContaining({
          skipped: expect.arrayContaining([
            expect.stringContaining('per-song limit is 5'),
          ]),
        }),
      }),
    )
  })

  it('loads a single song when the screening job carries songId', async () => {
    const repository = createRepository({
      artistId: '960',
      isJapanese: true,
      country: 'JP',
      confidence: 100,
      status: 'confirmed_by_manual',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    })
    const processor = createProcessor(repository)

    await processor.process(createSingleSongJob())

    expect(repository.findCandidateBySongId).toHaveBeenCalledWith('10')
    expect(repository.findCandidates).not.toHaveBeenCalled()
    expect(repository.setTotal).toHaveBeenCalledWith('100', 1)
  })

  it('loads unreviewed songs for one artist when the screening job carries artistId', async () => {
    const repository = createRepository({
      artistId: '960',
      isJapanese: true,
      country: 'JP',
      confidence: 100,
      status: 'confirmed_by_manual',
      reviewedAt: new Date('2026-06-16T00:00:00Z'),
    })
    const processor = createProcessor(repository)

    await processor.process(createArtistSongJob())

    expect(repository.findCandidatesByArtistId).toHaveBeenCalledWith('960', 10)
    expect(repository.findCandidateBySongId).not.toHaveBeenCalled()
    expect(repository.findCandidates).not.toHaveBeenCalled()
    expect(repository.setTotal).toHaveBeenCalledWith('101', 1)
  })

  it('uses Netease lyric kana evidence as fallback when external evidence is insufficient', async () => {
    const repository = createRepository(null, {
      songName: 'Hand in Hand',
      albumName: null,
      artists: [{ artistId: '961', artistName: 'Unknown Producer', identity: null }],
    })
    const netease = {
      getLyric: vi.fn().mockResolvedValue({
        rawLrc: '[00:01.00]きみのこえがきこえる\n[00:02.00]ぼくのこころにひびいている\n[00:03.00]あしたへあるいていこう',
        translatedLrc: null,
        raw: { code: 200 },
      }),
    }
    const processor = createProcessor(repository, { netease })

    await processor.process(createJob())

    expect(netease.getLyric).toHaveBeenCalledWith('10010')
    expect(repository.saveLyricsCache).toHaveBeenCalledWith(
      '10',
      expect.objectContaining({
        kanaCount: expect.any(Number),
        languageGuess: 'ja',
      }),
    )
    expect(repository.saveScreening).toHaveBeenCalledWith(
      '10',
      60,
      'pending',
      expect.objectContaining({
        fallback: expect.objectContaining({
          lyric_checked: true,
          passed: true,
          source: 'netease_lyric',
        }),
        positive: [expect.objectContaining({ type: 'lyric_kana_fallback', score: 60 })],
      }),
    )
  })
})
