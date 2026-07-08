import type {
  ExternalErrorCategory,
  NeteaseArtistSongsResult,
  NeteaseLyricResult,
  NeteasePlaylist,
  NeteasePlaylistResult,
  NeteaseSong,
  NeteaseSongResult,
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

  async getLyric(songId: string): Promise<NeteaseLyricResult> {
    const raw = await this.request('/lyric', { id: songId })
    return {
      rawLrc: readNestedLyric(raw, 'lrc'),
      translatedLrc: readNestedLyric(raw, 'tlyric'),
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
