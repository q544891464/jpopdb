import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import type {
  CatalogAlbumPage,
  CatalogArtistDetail,
  CatalogArtistListItem,
  CatalogArtistListResponse,
  CatalogArtistSummary,
  CatalogSongDetail,
  CatalogSongListResponse,
  CatalogSongSummary,
} from './catalog.types'
import {
  NeteaseCatalogStatsService,
  type CatalogSongStats,
} from './netease-catalog-stats.service'
import { NeteaseCatalogDetailService } from './netease-catalog-detail.service'

type CatalogSongRow = {
  song_id: string
  netease_song_id: string
  song_name: string
  aliases: unknown
  album_id: string | null
  netease_album_id: string | null
  album_name: string | null
  publish_time: Date | null
  duration_ms: number | null
  cover_url: string | null
  netease_url: string | null
  netease_popularity: number | null
  netease_red_count: string | null
  netease_comment_count: string | null
  netease_stats_updated_at: Date | null
  updated_at: Date
  artists: unknown
}

type CountRow = { total: number }

type SongArtistRow = {
  song_id: string
  artists: unknown
}

type CatalogArtistRow = {
  artist_id: string
  netease_artist_id: string | null
  artist_name: string
  song_count: number
  album_count: number
  latest_publish_time: Date | null
  cover_url: string | null
  updated_at: Date
}

type CatalogAlbumPageRow = {
  album_id: string
  netease_album_id: string | null
  album_name: string | null
  publish_time: Date | null
  cover_url: string | null
  song_count: number
  updated_at: Date
  artists: unknown
}

type CatalogListQuery = {
  q: string
  artist: string
  album: string
  yearFrom?: number
  yearTo?: number
  durationMin?: number
  durationMax?: number
  popularityMin?: number
  redCountMin?: number
  commentCountMin?: number
  sort: 'relevance' | 'newest' | 'oldest' | 'popularity' | 'redCount' | 'commentCount' | 'title'
  page: number
  limit: number
}

type CatalogEntityQuery = {
  q: string
  page: number
  limit: number
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(NeteaseCatalogStatsService) private readonly neteaseStats: NeteaseCatalogStatsService,
    @Inject(NeteaseCatalogDetailService) private readonly neteaseDetail: NeteaseCatalogDetailService,
  ) {}

  async findSongs(query: unknown): Promise<CatalogSongListResponse> {
    const request = this.parseListQuery(query)
    const conditions = [this.publicScopeSql()]
    const values: Array<string | number> = []
    let searchPatternIndex: number | undefined

    if (request.q) {
      values.push(`%${request.q}%`)
      searchPatternIndex = values.length
      conditions.push(`(
        song.name ILIKE $${searchPatternIndex}
        OR album.name ILIKE $${searchPatternIndex}
        OR song.netease_song_id::text ILIKE $${searchPatternIndex}
        OR EXISTS (
          SELECT 1 FROM song_artists search_link
          JOIN artists search_artist ON search_artist.id = search_link.artist_id
          WHERE search_link.song_id = song.id AND search_artist.name ILIKE $${searchPatternIndex}
        )
      )`)
    }
    if (request.artist) {
      values.push(`%${request.artist}%`)
      const index = values.length
      conditions.push(`EXISTS (
        SELECT 1 FROM song_artists filter_link
        JOIN artists filter_artist ON filter_artist.id = filter_link.artist_id
        WHERE filter_link.song_id = song.id AND filter_artist.name ILIKE $${index}
      )`)
    }
    if (request.album) {
      values.push(`%${request.album}%`)
      conditions.push(`album.name ILIKE $${values.length}`)
    }
    if (request.yearFrom !== undefined) {
      values.push(request.yearFrom)
      conditions.push(`EXTRACT(YEAR FROM album.publish_time) >= $${values.length}`)
    }
    if (request.yearTo !== undefined) {
      values.push(request.yearTo)
      conditions.push(`EXTRACT(YEAR FROM album.publish_time) <= $${values.length}`)
    }
    if (request.durationMin !== undefined) {
      values.push(request.durationMin * 1_000)
      conditions.push(`song.duration_ms >= $${values.length}`)
    }
    if (request.durationMax !== undefined) {
      values.push(request.durationMax * 1_000)
      conditions.push(`song.duration_ms <= $${values.length}`)
    }
    if (request.popularityMin !== undefined) {
      values.push(request.popularityMin)
      conditions.push(`song.netease_popularity >= $${values.length}`)
    }
    if (request.redCountMin !== undefined) {
      values.push(request.redCountMin)
      conditions.push(`song.netease_red_count >= $${values.length}`)
    }
    if (request.commentCountMin !== undefined) {
      values.push(request.commentCountMin)
      conditions.push(`song.netease_comment_count >= $${values.length}`)
    }

    const whereSql = `WHERE ${conditions.join('\nAND ')}`
    const countResult = this.shouldUseScreeningOnlyCount(request)
      ? await this.database.query<CountRow>(
        this.catalogPublicEstimateCountSql(),
      )
      : await this.database.query<CountRow>(
        `SELECT count(*)::int AS total
         ${this.catalogFromSql()}
         ${whereSql}`,
        values,
      )
    const total = countResult.rows[0]?.total ?? 0
    const offset = (request.page - 1) * request.limit
    const selectSql = this.shouldUseAlbumOrderedQuery(request, searchPatternIndex)
      ? this.catalogAlbumOrderedSelectSql()
      : this.catalogSelectSql()
    const result = await this.database.query<CatalogSongRow>(
      `${selectSql}
       ${whereSql}
       ORDER BY ${this.sortSql(request.sort, searchPatternIndex)}
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, request.limit, offset],
    )
    const artistsBySong = await this.loadArtists(result.rows.map((row) => row.song_id))
    const stats = new Map(result.rows.map((row) => [row.song_id, this.cachedStats(row)]))

    return {
      items: result.rows.map((row) => this.mapSong(row, stats.get(row.song_id), artistsBySong.get(row.song_id))),
      page: request.page,
      limit: request.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / request.limit)),
    }
  }

  async findSong(songId: string): Promise<CatalogSongDetail> {
    if (!/^\d{1,20}$/u.test(songId)) throw new BadRequestException('Invalid song ID')
    const result = await this.database.query<CatalogSongRow>(
      `${this.catalogSelectSql()}
       WHERE song.id = $1 AND ${this.publicScopeSql()}
       `,
      [songId],
    )
    const row = result.rows[0]
    if (!row) throw new NotFoundException('Catalog song not found')
    const artistsBySong = await this.loadArtists([row.song_id])
    const stats = await this.neteaseStats.enrich([this.statsTarget(row)])
    const summary = this.mapSong(row, stats.get(row.song_id), artistsBySong.get(row.song_id))
    const detail = await this.neteaseDetail.fetchDetail({
      neteaseSongId: row.netease_song_id,
      neteaseAlbumId: row.netease_album_id,
    })
    return { ...summary, neteaseDetail: detail }
  }

  async findArtists(query: unknown): Promise<CatalogArtistListResponse> {
    const request = this.parseEntityQuery(query)
    const values: Array<string | number> = []
    const conditions = [this.publicScopeSql()]
    if (request.q) {
      values.push(`%${request.q}%`)
      conditions.push(`(
        artist.name ILIKE $${values.length}
        OR artist.netease_artist_id::text ILIKE $${values.length}
      )`)
    }

    const whereSql = `WHERE ${conditions.join('\nAND ')}`
    const countResult = await this.database.query<CountRow>(
      `SELECT count(DISTINCT artist.id)::int AS total
       ${this.catalogArtistFromSql()}
       ${whereSql}`,
      values,
    )
    const total = countResult.rows[0]?.total ?? 0
    const offset = (request.page - 1) * request.limit
    const result = await this.database.query<CatalogArtistRow>(
      `${this.catalogArtistSelectSql()}
       ${this.catalogArtistFromSql()}
       ${whereSql}
       GROUP BY artist.id
       ORDER BY latest_publish_time DESC NULLS LAST, song_count DESC, artist.name ASC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, request.limit, offset],
    )
    return {
      items: result.rows.map((row) => this.mapArtist(row)),
      page: request.page,
      limit: request.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / request.limit)),
    }
  }

  async findArtist(artistId: string, query: unknown): Promise<CatalogArtistDetail> {
    if (!/^\d{1,20}$/u.test(artistId)) throw new BadRequestException('Invalid artist ID')
    const request = this.parseEntityQuery(query)
    const result = await this.database.query<CatalogArtistRow>(
      `${this.catalogArtistSelectSql()}
       ${this.catalogArtistFromSql()}
       WHERE artist.id = $1 AND ${this.publicScopeSql()}
       GROUP BY artist.id
       LIMIT 1`,
      [artistId],
    )
    const row = result.rows[0]
    if (!row) throw new NotFoundException('Catalog artist not found')
    const songs = await this.findSongPage(
      `EXISTS (
        SELECT 1 FROM song_artists detail_artist_link
        WHERE detail_artist_link.song_id = song.id
          AND detail_artist_link.artist_id = $1::bigint
      )`,
      [artistId],
      request.page,
      request.limit,
    )
    return { ...this.mapArtist(row), songs }
  }

  async findAlbum(albumId: string, query: unknown): Promise<CatalogAlbumPage> {
    if (!/^\d{1,20}$/u.test(albumId)) throw new BadRequestException('Invalid album ID')
    const request = this.parseEntityQuery(query)
    const result = await this.database.query<CatalogAlbumPageRow>(
      `SELECT
         album.id::text AS album_id,
         album.netease_album_id::text AS netease_album_id,
         album.name AS album_name,
         album.publish_time,
         album.cover_url,
         count(DISTINCT song.id)::int AS song_count,
         MAX(song.updated_at) AS updated_at,
         COALESCE(
           jsonb_agg(DISTINCT jsonb_build_object(
             'artistId', artist.id::text,
             'artistName', artist.name,
             'neteaseArtistId', artist.netease_artist_id::text
           )) FILTER (WHERE artist.id IS NOT NULL),
           '[]'::jsonb
         ) AS artists
       FROM albums album
       JOIN songs song ON song.album_id = album.id
       JOIN song_screening screening ON screening.song_id = song.id
       LEFT JOIN song_artists song_artist ON song_artist.song_id = song.id
       LEFT JOIN artists artist ON artist.id = song_artist.artist_id
       WHERE album.id = $1 AND ${this.publicScopeSql()}
       GROUP BY album.id
       LIMIT 1`,
      [albumId],
    )
    const row = result.rows[0]
    if (!row) throw new NotFoundException('Catalog album not found')
    const songs = await this.findSongPage('song.album_id = $1::bigint', [albumId], request.page, request.limit)
    return {
      albumId: row.album_id,
      neteaseAlbumId: row.netease_album_id,
      albumName: row.album_name,
      publishTime: row.publish_time?.toISOString() ?? null,
      coverUrl: row.cover_url,
      songCount: row.song_count,
      updatedAt: row.updated_at.toISOString(),
      artists: this.mapArtists(row.artists),
      songs,
    }
  }

  private parseListQuery(query: unknown): CatalogListQuery {
    const value = typeof query === 'object' && query !== null ? query as Record<string, unknown> : {}
    const sortValues = new Set<CatalogListQuery['sort']>([
      'newest',
      'relevance',
      'oldest',
      'popularity',
      'redCount',
      'commentCount',
      'title',
    ])
    const sort = typeof value.sort === 'string' && sortValues.has(value.sort as CatalogListQuery['sort'])
      ? value.sort as CatalogListQuery['sort']
      : 'relevance'
    const page = Number(value.page ?? 1)
    const limit = Number(value.limit ?? 20)
    return {
      q: this.readText(value.q),
      artist: this.readText(value.artist),
      album: this.readText(value.album),
      yearFrom: this.readInteger(value.yearFrom, 1900, 2200),
      yearTo: this.readInteger(value.yearTo, 1900, 2200),
      durationMin: this.readInteger(value.durationMin, 0, 86_400),
      durationMax: this.readInteger(value.durationMax, 0, 86_400),
      popularityMin: this.readInteger(value.popularityMin, 0, 100),
      redCountMin: this.readInteger(value.redCountMin, 0, Number.MAX_SAFE_INTEGER),
      commentCountMin: this.readInteger(value.commentCountMin, 0, Number.MAX_SAFE_INTEGER),
      sort,
      page: Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), 500) : 1,
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20,
    }
  }

  private parseEntityQuery(query: unknown): CatalogEntityQuery {
    const value = typeof query === 'object' && query !== null ? query as Record<string, unknown> : {}
    const page = Number(value.page ?? 1)
    const limit = Number(value.limit ?? 20)
    return {
      q: this.readText(value.q),
      page: Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), 500) : 1,
      limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20,
    }
  }

  private readText(value: unknown): string {
    return typeof value === 'string' ? value.trim().slice(0, 80) : ''
  }

  private readInteger(value: unknown, minimum: number, maximum: number): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return undefined
    return Math.min(Math.max(Math.trunc(parsed), minimum), maximum)
  }

  private sortSql(
    sort: CatalogListQuery['sort'],
    searchPatternIndex?: number,
  ): string {
    if (sort === 'relevance') {
      if (!searchPatternIndex) {
        return 'album.publish_time DESC NULLS LAST, song.id DESC'
      }
      return `CASE
        WHEN lower(song.name) = lower(trim(both '%' from $${searchPatternIndex})) THEN 0
        WHEN song.name ILIKE $${searchPatternIndex} THEN 1
        WHEN EXISTS (
          SELECT 1 FROM song_artists rank_link
          JOIN artists rank_artist ON rank_artist.id = rank_link.artist_id
          WHERE rank_link.song_id = song.id
            AND lower(rank_artist.name) = lower(trim(both '%' from $${searchPatternIndex}))
        ) THEN 2
        WHEN EXISTS (
          SELECT 1 FROM song_artists rank_link
          JOIN artists rank_artist ON rank_artist.id = rank_link.artist_id
          WHERE rank_link.song_id = song.id
            AND rank_artist.name ILIKE $${searchPatternIndex}
        ) THEN 3
        WHEN album.name ILIKE $${searchPatternIndex} THEN 4
        ELSE 5
      END,
      song.netease_popularity DESC NULLS LAST,
      album.publish_time DESC NULLS LAST,
      song.id DESC`
    }
    return {
      newest: 'album.publish_time DESC NULLS LAST, song.id DESC',
      oldest: 'album.publish_time ASC NULLS LAST, song.id ASC',
      popularity: 'song.netease_popularity DESC NULLS LAST, song.id DESC',
      redCount: 'song.netease_red_count DESC NULLS LAST, song.id DESC',
      commentCount: 'song.netease_comment_count DESC NULLS LAST, song.id DESC',
      title: 'song.name ASC, song.id ASC',
      relevance: 'album.publish_time DESC NULLS LAST, song.id DESC',
    }[sort]
  }

  private catalogSelectSql(): string {
    return `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         song.alias AS aliases,
         song.duration_ms,
         song.cover_url,
         song.netease_url,
         song.netease_popularity,
         song.netease_red_count,
         song.netease_comment_count,
         song.netease_stats_updated_at,
         song.updated_at,
         album.id AS album_id,
         album.netease_album_id::text,
         album.name AS album_name,
         album.publish_time,
         '[]'::jsonb AS artists
       ${this.catalogFromSql()}`
  }

  private catalogAlbumOrderedSelectSql(): string {
    return `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         song.alias AS aliases,
         song.duration_ms,
         song.cover_url,
         song.netease_url,
         song.netease_popularity,
         song.netease_red_count,
         song.netease_comment_count,
         song.netease_stats_updated_at,
         song.updated_at,
         album.id AS album_id,
         album.netease_album_id::text,
         album.name AS album_name,
         album.publish_time,
         '[]'::jsonb AS artists
       FROM albums album
       JOIN songs song ON song.album_id = album.id
       JOIN song_screening screening ON screening.song_id = song.id`
  }

  private catalogFromSql(): string {
    return `FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       LEFT JOIN albums album ON album.id = song.album_id`
  }

  private catalogPublicEstimateCountSql(): string {
    return `SELECT GREATEST(
         0,
         COALESCE((
           SELECT reltuples::int
           FROM pg_class
           WHERE oid = to_regclass('idx_song_screening_public_song_id')
         ), 0)
       ) AS total`
  }

  private catalogArtistSelectSql(): string {
    return `SELECT
         artist.id::text AS artist_id,
         artist.netease_artist_id::text AS netease_artist_id,
         artist.name AS artist_name,
         count(DISTINCT song.id)::int AS song_count,
         count(DISTINCT album.id)::int AS album_count,
         MAX(album.publish_time) AS latest_publish_time,
         (array_remove(array_agg(song.cover_url ORDER BY album.publish_time DESC NULLS LAST, song.id DESC), NULL))[1] AS cover_url,
         MAX(song.updated_at) AS updated_at`
  }

  private catalogArtistFromSql(): string {
    return `FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       JOIN song_artists song_artist ON song_artist.song_id = song.id
       JOIN artists artist ON artist.id = song_artist.artist_id
       LEFT JOIN albums album ON album.id = song.album_id`
  }

  private publicScopeSql(): string {
    return `(screening.status = 'accepted' OR screening.reviewed_at IS NOT NULL)`
  }

  private shouldUseAlbumOrderedQuery(
    request: CatalogListQuery,
    searchPatternIndex?: number,
  ): boolean {
    return !searchPatternIndex && (request.sort === 'relevance' || request.sort === 'newest')
  }

  private shouldUseScreeningOnlyCount(request: CatalogListQuery): boolean {
    return !request.q &&
      !request.artist &&
      !request.album &&
      request.yearFrom === undefined &&
      request.yearTo === undefined &&
      request.durationMin === undefined &&
      request.durationMax === undefined &&
      request.popularityMin === undefined &&
      request.redCountMin === undefined &&
      request.commentCountMin === undefined
  }

  private statsTarget(row: CatalogSongRow) {
    return {
      songId: row.song_id,
      neteaseSongId: row.netease_song_id,
      albumId: row.album_id,
      neteaseAlbumId: row.netease_album_id,
      publishTime: row.publish_time,
      popularity: row.netease_popularity,
      redCount: row.netease_red_count === null ? null : Number(row.netease_red_count),
      commentCount: row.netease_comment_count === null ? null : Number(row.netease_comment_count),
      statsUpdatedAt: row.netease_stats_updated_at,
    }
  }

  private cachedStats(row: CatalogSongRow): CatalogSongStats {
    return {
      publishTime: row.publish_time,
      popularity: row.netease_popularity,
      redCount: row.netease_red_count === null ? null : Number(row.netease_red_count),
      commentCount: row.netease_comment_count === null ? null : Number(row.netease_comment_count),
      statsUpdatedAt: row.netease_stats_updated_at,
    }
  }

  private async loadArtists(songIds: string[]): Promise<Map<string, CatalogArtistSummary[]>> {
    if (songIds.length === 0) return new Map()
    const result = await this.database.query<SongArtistRow>(
      `SELECT
         song_artist.song_id::text,
         COALESCE(
           jsonb_agg(DISTINCT jsonb_build_object(
             'artistId', artist.id::text,
             'artistName', artist.name,
             'neteaseArtistId', artist.netease_artist_id::text
           )) FILTER (WHERE artist.id IS NOT NULL),
           '[]'::jsonb
         ) AS artists
       FROM song_artists song_artist
       JOIN artists artist ON artist.id = song_artist.artist_id
       WHERE song_artist.song_id = ANY($1::bigint[])
       GROUP BY song_artist.song_id`,
      [songIds],
    )
    return new Map(result.rows.map((row) => [row.song_id, this.mapArtists(row.artists)]))
  }

  private async findSongPage(
    extraConditionSql: string,
    extraValues: Array<string | number>,
    page: number,
    limit: number,
  ): Promise<CatalogSongListResponse> {
    const conditions = [this.publicScopeSql(), extraConditionSql]
    const whereSql = `WHERE ${conditions.join('\nAND ')}`
    const countResult = await this.database.query<CountRow>(
      `SELECT count(*)::int AS total
       ${this.catalogFromSql()}
       ${whereSql}`,
      extraValues,
    )
    const total = countResult.rows[0]?.total ?? 0
    const offset = (page - 1) * limit
    const result = await this.database.query<CatalogSongRow>(
      `${this.catalogSelectSql()}
       ${whereSql}
       ORDER BY album.publish_time DESC NULLS LAST, song.id DESC
       LIMIT $${extraValues.length + 1}
       OFFSET $${extraValues.length + 2}`,
      [...extraValues, limit, offset],
    )
    const artistsBySong = await this.loadArtists(result.rows.map((row) => row.song_id))
    const stats = new Map(result.rows.map((row) => [row.song_id, this.cachedStats(row)]))
    return {
      items: result.rows.map((row) => this.mapSong(row, stats.get(row.song_id), artistsBySong.get(row.song_id))),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  private mapSong(
    row: CatalogSongRow,
    stats?: CatalogSongStats,
    artists?: CatalogArtistSummary[],
  ): CatalogSongSummary {
    return {
      songId: row.song_id,
      neteaseSongId: row.netease_song_id,
      songName: row.song_name,
      aliases: this.stringArray(row.aliases),
      artists: artists ?? this.mapArtists(row.artists),
      albumId: row.album_id,
      albumName: row.album_name,
      publishTime: (stats?.publishTime ?? row.publish_time)?.toISOString() ?? null,
      durationMs: row.duration_ms,
      coverUrl: row.cover_url,
      neteaseUrl: row.netease_url,
      popularity: stats?.popularity ?? row.netease_popularity,
      redCount: stats?.redCount ?? null,
      commentCount: stats?.commentCount ?? null,
      statsUpdatedAt: stats?.statsUpdatedAt?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private mapArtist(row: CatalogArtistRow): CatalogArtistListItem {
    return {
      artistId: row.artist_id,
      artistName: row.artist_name,
      neteaseArtistId: row.netease_artist_id,
      songCount: row.song_count,
      albumCount: row.album_count,
      latestPublishTime: row.latest_publish_time?.toISOString() ?? null,
      coverUrl: row.cover_url,
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private mapArtists(value: unknown): CatalogArtistSummary[] {
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        artistId: String(item.artistId),
        artistName: typeof item.artistName === 'string' ? item.artistName : 'Unknown artist',
        neteaseArtistId: item.neteaseArtistId === null ? null : String(item.neteaseArtistId),
      }))
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
  }
}
