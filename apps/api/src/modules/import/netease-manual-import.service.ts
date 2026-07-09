import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { PoolClient } from 'pg'

import { DatabaseService } from '../../infrastructure/database.service'

export const MANUAL_SONG_UNSCREENED_SUMMARY = '手动添加网易云单曲，等待外部 API 初筛。'

type NeteaseArtist = {
  id: number
  name: string
  alias?: unknown
  tns?: unknown
}

type NeteaseAlbum = {
  id: number
  name: string
  picUrl?: string | null
  tns?: unknown
}

type NeteaseSong = {
  id: number
  name: string
  alia?: unknown
  tns?: unknown
  ar: NeteaseArtist[]
  al: NeteaseAlbum
  dt?: number | null
  pop?: number | null
  publishTime?: number | null
}

type NeteaseWikiTag = {
  group: string
  value: string
  raw: unknown
}

export type NeteaseSongSearchItem = {
  neteaseSongId: string
  songName: string
  artists: Array<{
    neteaseArtistId: string | null
    artistName: string
  }>
  album: {
    neteaseAlbumId: string | null
    albumName: string | null
    coverUrl: string | null
  }
  durationMs: number | null
}

export type NeteaseArtistSearchItem = {
  neteaseArtistId: string
  artistName: string
  aliases: string[]
  coverUrl: string | null
}

export type ManualSongImportResponse = {
  songId: string
  neteaseSongId: string
  songName: string
  artistNames: string[]
  albumName: string | null
  tags: Array<{ group: string; value: string }>
}

type ManualSongRow = {
  song_id: string
}

@Injectable()
export class NeteaseManualImportService {
  private readonly baseUrl = process.env.NETEASE_API_BASE_URL ?? 'http://182.92.153.82:3000'

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async searchSongs(query: unknown): Promise<{ items: NeteaseSongSearchItem[] }> {
    const { keyword, limit } = this.readSearchRequest(query)
    const raw = await this.request('/search', {
      keywords: keyword,
      type: '1',
      limit: String(limit),
    })
    return { items: this.readSearchSongs(raw) }
  }

  async searchArtists(query: unknown): Promise<{ items: NeteaseArtistSearchItem[] }> {
    const { keyword, limit } = this.readSearchRequest(query)
    const raw = await this.request('/search', {
      keywords: keyword,
      type: '100',
      limit: String(limit),
    })
    return { items: this.readSearchArtists(raw) }
  }

  async importSong(body: unknown): Promise<ManualSongImportResponse> {
    const neteaseSongId = this.readNeteaseSongId(body)
    const detail = await this.request('/song/detail', { ids: neteaseSongId })
    const song = this.readSongDetail(detail)
    const wikiTags = await this.fetchWikiTags(neteaseSongId)
    const songId = await this.persistManualSong(song, wikiTags?.tags)
    return {
      songId,
      neteaseSongId: String(song.id),
      songName: song.name,
      artistNames: song.ar.map((artist) => artist.name),
      albumName: song.al.name ?? null,
      tags: (wikiTags?.tags ?? []).map((tag) => ({ group: tag.group, value: tag.value })),
    }
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (response.status === 404) throw new NotFoundException('网易云资源不存在')
        if (response.status === 429) throw new ServiceUnavailableException('网易云 API 请求频率受限，请稍后再试')
        if (!response.ok) throw new ServiceUnavailableException(`网易云 API 返回 HTTP ${response.status}`)
        const payload = (await response.json()) as unknown
        const code = this.readNumber(payload, 'code')
        if (code !== null && code !== 200) throw new NotFoundException('网易云 API 返回非成功状态')
        return payload
      } catch (error) {
        lastError = this.normalizeRequestError(error)
        if (attempt === 0 && lastError instanceof ServiceUnavailableException) {
          await new Promise((resolve) => setTimeout(resolve, 300))
          continue
        }
        throw lastError
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError
  }

  private async fetchWikiTags(
    neteaseSongId: string,
  ): Promise<{ tags: NeteaseWikiTag[]; raw: unknown } | undefined> {
    try {
      const raw = await this.request('/song/wiki/summary', { id: neteaseSongId })
      return { tags: this.readWikiTags(raw), raw }
    } catch {
      return undefined
    }
  }

  private async persistManualSong(
    song: NeteaseSong,
    wikiTags?: NeteaseWikiTag[],
  ): Promise<string> {
    return this.database.withTransaction(async (client) => {
      const albumId = await this.upsertAlbum(client, song)
      const songId = await this.upsertSong(client, song, albumId)
      await client.query('DELETE FROM song_artists WHERE song_id = $1', [songId])
      for (const artist of song.ar) {
        const artistId = await this.upsertArtist(client, artist)
        await client.query(
          `INSERT INTO song_artists (song_id, artist_id, role)
           VALUES ($1, $2, 'main')
           ON CONFLICT (song_id, artist_id) DO UPDATE SET role = EXCLUDED.role`,
          [songId, artistId],
        )
      }

      await client.query(
        `INSERT INTO song_screening (
           song_id, is_japanese_candidate, score, status, reason
         ) VALUES ($1, FALSE, 0, 'pending', $2::jsonb)
         ON CONFLICT (song_id) DO NOTHING`,
        [
          songId,
          JSON.stringify({
            score: 0,
            status: 'pending',
            positive: [],
            negative: [],
            fallback: { lyric_checked: false },
            summary: MANUAL_SONG_UNSCREENED_SUMMARY,
          }),
        ],
      )
      await client.query(
        `INSERT INTO external_matches (
           target_type, target_id, source, external_id, matched_name, confidence, raw_json
         ) VALUES ('song', $1, 'netease', $2, $3, 100, $4::jsonb)
         ON CONFLICT (target_type, target_id, source) DO UPDATE SET
           external_id = EXCLUDED.external_id,
           matched_name = EXCLUDED.matched_name,
           confidence = EXCLUDED.confidence,
           raw_json = EXCLUDED.raw_json,
           created_at = NOW()`,
        [songId, String(song.id), song.name, JSON.stringify(song)],
      )
      if (wikiTags !== undefined) await this.replaceSongTags(client, songId, wikiTags)
      return songId
    })
  }

  private async upsertAlbum(client: PoolClient, song: NeteaseSong): Promise<string> {
    const result = await client.query<ManualSongRow>(
      `INSERT INTO albums (
         netease_album_id, name, publish_time, cover_url, raw_json
       ) VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (netease_album_id) DO UPDATE SET
         name = EXCLUDED.name,
         publish_time = COALESCE(EXCLUDED.publish_time, albums.publish_time),
         cover_url = EXCLUDED.cover_url,
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id::text AS song_id`,
      [
        String(song.al.id),
        song.al.name,
        song.publishTime ? new Date(song.publishTime) : null,
        song.al.picUrl ?? null,
        JSON.stringify(song.al),
      ],
    )
    return this.requireRowId(result.rows[0], 'Failed to persist album')
  }

  private async upsertSong(client: PoolClient, song: NeteaseSong, albumId: string): Promise<string> {
    const result = await client.query<ManualSongRow>(
      `INSERT INTO songs (
         netease_song_id, name, alias, album_id, duration_ms, cover_url, netease_url,
         netease_popularity, raw_json
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (netease_song_id) DO UPDATE SET
         name = EXCLUDED.name,
         alias = EXCLUDED.alias,
         album_id = EXCLUDED.album_id,
         duration_ms = EXCLUDED.duration_ms,
         cover_url = EXCLUDED.cover_url,
         netease_url = EXCLUDED.netease_url,
         netease_popularity = COALESCE(EXCLUDED.netease_popularity, songs.netease_popularity),
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id::text AS song_id`,
      [
        String(song.id),
        song.name,
        JSON.stringify(this.collectAliases(song.alia, song.tns)),
        albumId,
        song.dt ?? null,
        song.al.picUrl ?? null,
        `https://music.163.com/#/song?id=${song.id}`,
        song.pop ?? null,
        JSON.stringify(song),
      ],
    )
    return this.requireRowId(result.rows[0], 'Failed to persist song')
  }

  private async upsertArtist(client: PoolClient, artist: NeteaseArtist): Promise<string> {
    const result = await client.query<ManualSongRow>(
      `INSERT INTO artists (netease_artist_id, name, alias, raw_json)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (netease_artist_id) DO UPDATE SET
         name = EXCLUDED.name,
         alias = EXCLUDED.alias,
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id::text AS song_id`,
      [
        String(artist.id),
        artist.name,
        JSON.stringify(this.collectAliases(artist.alias, artist.tns)),
        JSON.stringify(artist),
      ],
    )
    return this.requireRowId(result.rows[0], 'Failed to persist artist')
  }

  private async replaceSongTags(
    client: PoolClient,
    songId: string,
    wikiTags: NeteaseWikiTag[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM song_tags
       WHERE song_id = $1 AND source = 'netease_wiki'`,
      [songId],
    )
    for (const tag of this.uniqueWikiTags(wikiTags)) {
      await client.query(
        `INSERT INTO song_tags (
           song_id, source, tag_group, tag_name, raw_json
         ) VALUES ($1, 'netease_wiki', $2, $3, $4::jsonb)
         ON CONFLICT (song_id, source, tag_group, tag_name) DO UPDATE SET
           raw_json = EXCLUDED.raw_json,
           updated_at = NOW()`,
        [songId, tag.group, tag.value, JSON.stringify(tag.raw ?? {})],
      )
    }
  }

  private readSearchRequest(query: unknown): { keyword: string; limit: number } {
    const value = typeof query === 'object' && query !== null ? query as Record<string, unknown> : {}
    const keyword = typeof value.q === 'string' ? value.q.trim() : ''
    if (keyword.length < 1) throw new BadRequestException('请输入搜索关键词')
    const rawLimit = Number(value.limit ?? 10)
    return {
      keyword: keyword.slice(0, 80),
      limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 30) : 10,
    }
  }

  private readNeteaseSongId(body: unknown): string {
    const value = typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).neteaseSongId
      : undefined
    const normalized = typeof value === 'number'
      ? String(Math.trunc(value))
      : typeof value === 'string'
        ? value.trim()
        : ''
    if (!/^\d{1,20}$/u.test(normalized)) {
      throw new BadRequestException('neteaseSongId 必须是网易云歌曲数字 ID')
    }
    return normalized
  }

  private readSongDetail(payload: unknown): NeteaseSong {
    const songs = this.readArrayValue(payload, 'songs')
    const song = songs?.[0]
    if (!this.isRecord(song)) throw new NotFoundException('没有找到该网易云歌曲')
    const id = this.readNumber(song, 'id')
    const name = this.readString(song, 'name')
    const artists = this.readArrayValue(song, 'ar')
    const album = this.readObjectValue(song, 'al')
    if (!id || !name || !artists?.length || !album || !this.readNumber(album, 'id')) {
      throw new NotFoundException('网易云歌曲详情缺少必要字段')
    }
    return song as NeteaseSong
  }

  private readSearchSongs(payload: unknown): NeteaseSongSearchItem[] {
    const result = this.readObjectValue(payload, 'result')
    const songs = this.readArrayValue(result, 'songs')
    if (!songs) return []
    return songs.flatMap((item) => {
      const id = this.readNumber(item, 'id')
      const name = this.readString(item, 'name')
      if (!id || !name) return []
      const album = this.readObjectValue(item, 'album') ?? this.readObjectValue(item, 'al')
      const artistValues = this.readArrayValue(item, 'artists') ?? this.readArrayValue(item, 'ar') ?? []
      return [{
        neteaseSongId: String(id),
        songName: name,
        artists: artistValues.flatMap((artist) => {
          const artistName = this.readString(artist, 'name')
          if (!artistName) return []
          const artistId = this.readNumber(artist, 'id')
          return [{
            neteaseArtistId: artistId ? String(artistId) : null,
            artistName,
          }]
        }),
        album: {
          neteaseAlbumId: this.positiveId(album, 'id'),
          albumName: this.readString(album, 'name'),
          coverUrl: this.readString(album, 'picUrl'),
        },
        durationMs: this.readNumber(item, 'duration') ?? this.readNumber(item, 'dt'),
      }]
    })
  }

  private readSearchArtists(payload: unknown): NeteaseArtistSearchItem[] {
    const result = this.readObjectValue(payload, 'result')
    const artists = this.readArrayValue(result, 'artists')
    if (!artists) return []
    return artists.flatMap((item) => {
      const id = this.readNumber(item, 'id')
      const name = this.readString(item, 'name')
      if (!id || !name) return []
      return [{
        neteaseArtistId: String(id),
        artistName: name,
        aliases: this.stringArray((item as Record<string, unknown>).alias),
        coverUrl: this.readString(item, 'picUrl') ?? this.readString(item, 'img1v1Url'),
      }]
    })
  }

  private readWikiTags(payload: unknown): NeteaseWikiTag[] {
    const data = this.readObjectValue(payload, 'data')
    const blocks = this.readArrayValue(data, 'blocks')
    if (!blocks) return []
    const musicBlock = blocks.find((block) =>
      this.readString(block, 'showType') === 'SONG_PLAY_ABOUT_TAB_SONG_BASIC',
    )
    const creatives = this.readArrayValue(musicBlock, 'creatives')
    if (!creatives) return []
    return creatives.flatMap((creative) => {
      const group = this.readTitle(this.readObjectValue(creative, 'uiElement')) ?? '网易云百科'
      const resources = this.readArrayValue(creative, 'resources') ?? []
      return resources.flatMap((resource) => {
        const value = this.readTitle(this.readObjectValue(resource, 'uiElement'))
        return value ? [{ group, value, raw: resource }] : []
      })
    })
  }

  private readTitle(value: Record<string, unknown> | null): string | null {
    return this.readString(this.readObjectValue(value, 'mainTitle'), 'title')
  }

  private uniqueWikiTags(tags: NeteaseWikiTag[]): NeteaseWikiTag[] {
    const result = new Map<string, NeteaseWikiTag>()
    for (const tag of tags) {
      const group = tag.group.trim().slice(0, 100)
      const value = tag.value.trim().slice(0, 255)
      if (!group || !value) continue
      result.set(`${group}\u0000${value}`, { ...tag, group, value })
    }
    return [...result.values()]
  }

  private collectAliases(...values: unknown[]): string[] {
    const aliases: string[] = []
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        aliases.push(value.trim())
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.trim()) aliases.push(item.trim())
        }
      }
    }
    return [...new Set(aliases)]
  }

  private requireRowId(row: ManualSongRow | undefined, message: string): string {
    if (!row) throw new Error(message)
    return row.song_id
  }

  private normalizeRequestError(error: unknown): unknown {
    if (error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ServiceUnavailableException) {
      return error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new ServiceUnavailableException('网易云 API 请求超时，请稍后再试')
    }
    if (error instanceof SyntaxError) {
      return new ServiceUnavailableException('网易云 API 响应无法解析')
    }
    return new ServiceUnavailableException(
      error instanceof Error ? `网易云 API 请求失败: ${error.message}` : '网易云 API 请求失败',
    )
  }

  private positiveId(value: unknown, key: string): string | null {
    const id = this.readNumber(value, key)
    return id && id > 0 ? String(id) : null
  }

  private readObjectValue(value: unknown, key: string): Record<string, unknown> | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const nested = value[key]
    return this.isRecord(nested) ? nested : null
  }

  private readArrayValue(value: unknown, key: string): unknown[] | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const nested = value[key]
    return Array.isArray(nested) ? nested : null
  }

  private readNumber(value: unknown, key: string): number | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const result = value[key]
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }

  private readString(value: unknown, key: string): string | null {
    if (!this.isRecord(value) || !(key in value)) return null
    const result = value[key]
    return typeof result === 'string' && result.trim() ? result.trim() : null
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
