import type {
  ExternalErrorCategory,
  NeteaseArtistSongsResult,
  NeteaseLyricResult,
  NeteasePlaylist,
  NeteasePlaylistResult,
  NeteaseSearchArtist,
  NeteaseSearchSong,
  NeteaseSong,
  NeteaseSongWikiResult,
  NeteaseSongResult,
  NeteaseWikiTag,
} from './netease.types'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class NeteaseApiError extends Error {
  constructor(
    message: string,
    readonly category: ExternalErrorCategory,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'NeteaseApiError'
  }
}

export class NeteaseClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
    private readonly maxAttempts = 3,
  ) {}

  async getPlaylistDetail(playlistId: string): Promise<NeteasePlaylistResult> {
    const raw = await this.request('/playlist/detail', { id: playlistId })
    const playlist = this.readPlaylist(raw)
    const ids = playlist.trackIds?.map((item) => String(item.id)) ??
      playlist.tracks?.map((song) => String(song.id)) ?? []

    if (ids.length === 0) {
      throw new NeteaseApiError('歌单中没有可导入的歌曲', 'not_found')
    }

    return { playlist, trackIds: [...new Set(ids)], raw }
  }

  async getSongDetails(songIds: string[]): Promise<NeteaseSongResult[]> {
    const results: NeteaseSongResult[] = []
    for (let index = 0; index < songIds.length; index += 200) {
      const ids = songIds.slice(index, index + 200)
      const raw = await this.request('/song/detail', { ids: ids.join(',') })
      results.push({ songs: this.readSongs(raw), raw })
    }
    return results
  }

  async searchSongs(keyword: string, limit = 10): Promise<NeteaseSearchSong[]> {
    const raw = await this.request('/search', {
      keywords: keyword,
      type: '1',
      limit: String(Math.min(Math.max(Math.trunc(limit), 1), 30)),
    })
    return this.readSearchSongs(raw)
  }

  async searchArtists(keyword: string, limit = 10): Promise<NeteaseSearchArtist[]> {
    const raw = await this.request('/search', {
      keywords: keyword,
      type: '100',
      limit: String(Math.min(Math.max(Math.trunc(limit), 1), 30)),
    })
    return this.readSearchArtists(raw)
  }

  async getLyric(songId: string): Promise<NeteaseLyricResult> {
    const raw = await this.request('/lyric', { id: songId })
    return {
      rawLrc: readNestedLyric(raw, 'lrc'),
      translatedLrc: readNestedLyric(raw, 'tlyric'),
      raw,
    }
  }

  async getSongWikiSummary(songId: string): Promise<NeteaseSongWikiResult> {
    const raw = await this.request('/song/wiki/summary', { id: songId })
    return {
      tags: this.readWikiTags(raw),
      raw,
    }
  }

  async getArtistSongs(
    artistId: string,
    maxSongs = 500,
    startOffset = 0,
  ): Promise<NeteaseArtistSongsResult> {
    const pageSize = 100
    const songs = new Map<string, NeteaseSong>()
    const rawPages: unknown[] = []
    let total = 0
    let more = true

    for (let offset = startOffset; offset < startOffset + maxSongs && more; offset += pageSize) {
      const limit = Math.min(pageSize, startOffset + maxSongs - offset)
      const raw = await this.request('/artist/songs', {
        id: artistId,
        limit: String(limit),
        offset: String(offset),
        order: 'hot',
      })
      const page = this.readArtistSongs(raw)
      rawPages.push(raw)
      total = page.total
      more = page.more
      for (const song of page.songs) {
        songs.set(String(song.id), song)
      }
      if (page.songs.length === 0) break
    }

    const detailResults = songs.size > 0
      ? await this.getSongDetails([...songs.keys()])
      : []
    for (const detail of detailResults.flatMap((result) => result.songs)) {
      songs.set(String(detail.id), detail)
    }

    return {
      songs: [...songs.values()],
      total,
      truncated: more || startOffset + songs.size < total,
      rawPages,
    }
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value)
    }

    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetcher(url.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })

        if (response.status === 429) {
          throw new NeteaseApiError('网易云 API 请求频率受限', 'rate_limited', 429)
        }
        if (response.status === 404) {
          throw new NeteaseApiError('网易云资源不存在', 'not_found', 404)
        }
        if (!response.ok) {
          throw new NeteaseApiError(
            `网易云 API 返回 HTTP ${response.status}`,
            response.status >= 500 ? 'network_error' : 'unknown_error',
            response.status,
          )
        }

        const payload = (await response.json()) as unknown
        if (this.readCode(payload) !== 200) {
          throw new NeteaseApiError('网易云 API 返回非成功状态', 'not_found')
        }
        return payload
      } catch (error) {
        lastError = this.normalizeError(error)
        if (!this.shouldRetry(lastError) || attempt === this.maxAttempts) {
          throw lastError
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)))
      } finally {
        clearTimeout(timer)
      }
    }
    throw this.normalizeError(lastError)
  }

  private readCode(payload: unknown): number | null {
    if (typeof payload !== 'object' || payload === null || !('code' in payload)) {
      return null
    }
    return typeof payload.code === 'number' ? payload.code : null
  }

  private readPlaylist(payload: unknown): NeteasePlaylist {
    if (typeof payload !== 'object' || payload === null || !('playlist' in payload)) {
      throw new NeteaseApiError('网易云歌单响应格式无效', 'parse_error')
    }
    const playlist = payload.playlist
    if (
      typeof playlist !== 'object' ||
      playlist === null ||
      !('id' in playlist) ||
      !('name' in playlist) ||
      typeof playlist.id !== 'number' ||
      typeof playlist.name !== 'string'
    ) {
      throw new NeteaseApiError('网易云歌单响应缺少必要字段', 'parse_error')
    }
    return playlist as NeteasePlaylist
  }

  private readSongs(payload: unknown): NeteaseSong[] {
    if (typeof payload !== 'object' || payload === null || !('songs' in payload)) {
      throw new NeteaseApiError('网易云歌曲响应格式无效', 'parse_error')
    }
    if (!Array.isArray(payload.songs)) {
      throw new NeteaseApiError('网易云歌曲列表格式无效', 'parse_error')
    }
    return payload.songs as NeteaseSong[]
  }

  private readSearchSongs(payload: unknown): NeteaseSearchSong[] {
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

  private readSearchArtists(payload: unknown): NeteaseSearchArtist[] {
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

  private readArtistSongs(payload: unknown): {
    songs: NeteaseSong[]
    total: number
    more: boolean
  } {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('songs' in payload) ||
      !Array.isArray(payload.songs)
    ) {
      throw new NeteaseApiError('网易云艺人歌曲响应格式无效', 'parse_error')
    }
    return {
      songs: payload.songs as NeteaseSong[],
      total: 'total' in payload && typeof payload.total === 'number'
        ? payload.total
        : payload.songs.length,
      more: 'more' in payload && payload.more === true,
    }
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

  private positiveId(value: unknown, key: string): string | null {
    const id = this.readNumber(value, key)
    return id && id > 0 ? String(id) : null
  }

  private readObjectValue(value: unknown, key: string): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || !(key in value)) return null
    const nested = (value as Record<string, unknown>)[key]
    return typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? nested as Record<string, unknown>
      : null
  }

  private readArrayValue(value: unknown, key: string): unknown[] | null {
    if (typeof value !== 'object' || value === null || !(key in value)) return null
    const nested = (value as Record<string, unknown>)[key]
    return Array.isArray(nested) ? nested : null
  }

  private readNumber(value: unknown, key: string): number | null {
    if (typeof value !== 'object' || value === null || !(key in value)) return null
    const result = (value as Record<string, unknown>)[key]
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }

  private readString(value: unknown, key: string): string | null {
    if (typeof value !== 'object' || value === null || !(key in value)) return null
    const result = (value as Record<string, unknown>)[key]
    return typeof result === 'string' && result.trim() ? result.trim() : null
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  private normalizeError(error: unknown): NeteaseApiError {
    if (error instanceof NeteaseApiError) {
      return error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new NeteaseApiError('网易云 API 请求超时', 'timeout')
    }
    if (error instanceof SyntaxError) {
      return new NeteaseApiError('网易云 API 响应无法解析', 'parse_error')
    }
    return new NeteaseApiError(
      error instanceof Error ? `网易云 API 网络错误: ${error.message}` : '网易云 API 未知错误',
      'network_error',
    )
  }

  private shouldRetry(error: unknown): boolean {
    return (
      error instanceof NeteaseApiError &&
      ['network_error', 'timeout', 'rate_limited'].includes(error.category)
    )
  }
}

function readNestedLyric(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null || !(key in payload)) {
    return null
  }
  const section = (payload as Record<string, unknown>)[key]
  if (typeof section !== 'object' || section === null || !('lyric' in section)) {
    return null
  }
  const lyric = (section as Record<string, unknown>).lyric
  return typeof lyric === 'string' && lyric.trim().length > 0 ? lyric : null
}
