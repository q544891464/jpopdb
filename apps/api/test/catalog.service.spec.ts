import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import { CatalogService } from '../src/modules/catalog/catalog.service'
import type { NeteaseCatalogDetailService } from '../src/modules/catalog/netease-catalog-detail.service'
import type { NeteaseCatalogStatsService } from '../src/modules/catalog/netease-catalog-stats.service'

const row = {
  song_id: '10',
  netease_song_id: '60198',
  song_name: 'Test Song',
  aliases: ['テスト曲'],
  album_id: '5',
  netease_album_id: '500',
  album_name: 'Test Album',
  publish_time: new Date('2024-01-02T00:00:00Z'),
  duration_ms: 240000,
  cover_url: 'https://example.test/cover.jpg',
  netease_url: 'https://music.163.com/#/song?id=60198',
  netease_popularity: 92,
  netease_red_count: '24413',
  netease_comment_count: '452',
  netease_stats_updated_at: new Date('2026-07-06T00:00:00Z'),
  updated_at: new Date('2026-06-24T00:00:00Z'),
  artists: [{ artistId: '1', artistName: 'Aimer', neteaseArtistId: '123' }],
}

const freshStats = new Map([
  ['10', {
    publishTime: new Date('2024-01-02T00:00:00Z'),
    popularity: 92,
    redCount: 24_413,
    commentCount: 452,
    statsUpdatedAt: new Date('2026-07-06T00:00:00Z'),
  }],
])

const detail = {
  mainTitle: null,
  additionalTitle: null,
  disc: '01',
  trackNo: 1,
  mvId: null,
  fee: 1,
  copyright: 0,
  availability: { playable: true, message: 'ok' },
  qualities: [{ level: 'high' as const, label: '极高音质', bitrate: 320000, size: 9_000_000, extension: null }],
  album: {
    neteaseAlbumId: '500',
    name: 'Test Album',
    type: '专辑',
    subType: null,
    company: 'Test Label',
    publishTime: '2024-01-02T00:00:00.000Z',
    size: 12,
    aliases: [],
    tags: ['J-Pop'],
    description: 'Album metadata only',
    artistName: 'Aimer',
    coverUrl: 'https://example.test/cover.jpg',
  },
  lyric: {
    hasOriginal: true,
    hasTranslation: true,
    hasRomanization: false,
    originalLineCount: 12,
    translatedLineCount: 12,
    romanizedLineCount: 0,
    kanaCount: 88,
    kanaRatio: 0.42,
    languageGuess: 'ja' as const,
    lyricContributor: 'lyric user',
    translationContributor: 'translator',
    lyricUpdatedAt: '2024-01-02T00:00:00.000Z',
    translationUpdatedAt: '2024-01-02T00:00:00.000Z',
  },
  wikiTags: [{ group: '曲风', values: ['J-Pop'] }],
  fetchedAt: '2026-07-07T00:00:00.000Z',
  availableSources: ['songDetail', 'album', 'lyric', 'wiki', 'availability'],
}

const artistRows = [{ song_id: '10', artists: row.artists }]

describe('CatalogService', () => {
  it('returns song metadata and popularity without screening internals', async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: artistRows }),
    }
    const neteaseStats = { enrich: vi.fn().mockResolvedValue(freshStats) }
    const service = new CatalogService(
      database as unknown as DatabaseService,
      neteaseStats as unknown as NeteaseCatalogStatsService,
      {} as NeteaseCatalogDetailService,
    )

    const result = await service.findSongs({ q: 'Aimer', page: '1', limit: '10' })

    expect(result.items[0]).toEqual(expect.objectContaining({
      songId: '10',
      songName: 'Test Song',
      aliases: ['テスト曲'],
      popularity: 92,
      redCount: 24_413,
      commentCount: 452,
    }))
    const serialized = JSON.stringify(result)
    for (const forbidden of ['score', 'status', 'reason', 'evidence', 'lyricFallback', 'identityStatus']) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(String(database.query.mock.calls[1]?.[0])).toContain('lower(song.name) = lower(')
    expect(neteaseStats.enrich).not.toHaveBeenCalled()
  })

  it('returns a metadata-only song detail', async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: artistRows }),
    }
    const neteaseStats = { enrich: vi.fn().mockResolvedValue(freshStats) }
    const neteaseDetail = { fetchDetail: vi.fn().mockResolvedValue(detail) }
    const service = new CatalogService(
      database as unknown as DatabaseService,
      neteaseStats as unknown as NeteaseCatalogStatsService,
      neteaseDetail as unknown as NeteaseCatalogDetailService,
    )

    const result = await service.findSong('10')

    expect(result.albumName).toBe('Test Album')
    expect(result.publishTime).toBe('2024-01-02T00:00:00.000Z')
    expect(result.redCount).toBe(24_413)
    expect(result.neteaseDetail?.lyric?.hasOriginal).toBe(true)
    expect(result.neteaseDetail?.album?.company).toBe('Test Label')
    expect(JSON.stringify(result)).not.toContain('rawLrc')
    expect(JSON.stringify(result)).not.toContain('translatedLrc')
    expect(neteaseDetail.fetchDetail).toHaveBeenCalledWith({
      neteaseSongId: '60198',
      neteaseAlbumId: '500',
    })
  })

  it('applies composable metadata filters and whitelisted sorting', async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: artistRows }),
    }
    const neteaseStats = { enrich: vi.fn().mockResolvedValue(freshStats) }
    const service = new CatalogService(
      database as unknown as DatabaseService,
      neteaseStats as unknown as NeteaseCatalogStatsService,
      {} as NeteaseCatalogDetailService,
    )

    await service.findSongs({
      artist: 'Aimer',
      album: 'Sun Dance',
      yearFrom: '2015',
      yearTo: '2025',
      durationMin: '120',
      durationMax: '360',
      popularityMin: '70',
      redCountMin: '1000',
      commentCountMin: '100',
      sort: 'redCount',
    })

    const sql = String(database.query.mock.calls[1]?.[0])
    expect(sql).toContain('filter_artist.name ILIKE')
    expect(sql).toContain('EXTRACT(YEAR FROM album.publish_time)')
    expect(sql).toContain('song.duration_ms >=')
    expect(sql).toContain('song.netease_red_count DESC NULLS LAST')
  })

  it('uses cached list data and the album-ordered query for the default catalog page', async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: artistRows }),
    }
    const neteaseStats = { enrich: vi.fn().mockResolvedValue(freshStats) }
    const service = new CatalogService(
      database as unknown as DatabaseService,
      neteaseStats as unknown as NeteaseCatalogStatsService,
      {} as NeteaseCatalogDetailService,
    )

    await service.findSongs({})

    expect(String(database.query.mock.calls[0]?.[0])).toContain('to_regclass')
    expect(String(database.query.mock.calls[0]?.[0])).toContain('idx_song_screening_public_song_id')
    expect(database.query.mock.calls[0]?.[1]).toBeUndefined()
    expect(String(database.query.mock.calls[1]?.[0])).toContain('FROM albums album')
    expect(String(database.query.mock.calls[1]?.[0])).toContain('JOIN songs song ON song.album_id = album.id')
    expect(neteaseStats.enrich).not.toHaveBeenCalled()
  })


  it('rejects invalid song ids and missing songs', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const neteaseStats = { enrich: vi.fn().mockResolvedValue(new Map()) }
    const service = new CatalogService(
      database as unknown as DatabaseService,
      neteaseStats as unknown as NeteaseCatalogStatsService,
      {} as NeteaseCatalogDetailService,
    )

    await expect(service.findSong('invalid')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.findSong('999')).rejects.toBeInstanceOf(NotFoundException)
  })
})
