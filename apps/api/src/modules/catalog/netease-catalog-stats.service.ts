import { Inject, Injectable } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'

type CatalogStatsTarget = {
  songId: string
  neteaseSongId: string
  albumId: string | null
  neteaseAlbumId: string | null
  publishTime: Date | null
  popularity: number | null
  redCount: number | null
  commentCount: number | null
  statsUpdatedAt: Date | null
}

export type CatalogSongStats = {
  publishTime: Date | null
  popularity: number | null
  redCount: number | null
  commentCount: number | null
  statsUpdatedAt: Date | null
}

@Injectable()
export class NeteaseCatalogStatsService {
  private readonly baseUrl = process.env.NETEASE_API_BASE_URL ?? 'http://182.92.153.82:3000'

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async enrich(targets: CatalogStatsTarget[]): Promise<Map<string, CatalogSongStats>> {
    const stats = new Map(
      targets.map((target) => [
        target.songId,
        {
          publishTime: target.publishTime,
          popularity: target.popularity,
          redCount: target.redCount,
          commentCount: target.commentCount,
          statsUpdatedAt: target.statsUpdatedAt,
        },
      ]),
    )
    const stale = targets.filter((target) => this.isStale(target.statsUpdatedAt))

    for (let index = 0; index < stale.length; index += 4) {
      const chunk = stale.slice(index, index + 4)
      await Promise.all(chunk.map(async (target) => {
        try {
          const fresh = await this.fetchStats(target.neteaseSongId, target.neteaseAlbumId)
          const updatedAt = new Date()
          await this.database.query(
            `UPDATE songs
             SET netease_popularity = COALESCE($2, netease_popularity),
                 netease_red_count = $3,
                 netease_comment_count = $4,
                 netease_stats_updated_at = $5,
                 updated_at = updated_at
             WHERE id = $1`,
            [
              target.songId,
              fresh.popularity,
              fresh.redCount,
              fresh.commentCount,
              updatedAt,
            ],
          )
          if (target.albumId && fresh.publishTime) {
            await this.database.query(
              `UPDATE albums
               SET publish_time = COALESCE(publish_time, $2), updated_at = NOW()
               WHERE id = $1`,
              [target.albumId, fresh.publishTime],
            )
          }
          stats.set(target.songId, {
            ...fresh,
            publishTime: fresh.publishTime ?? target.publishTime,
            popularity: fresh.popularity ?? target.popularity,
            statsUpdatedAt: updatedAt,
          })
        } catch {
          // Catalog metadata remains available when optional popularity APIs fail.
        }
      }))
    }
    return stats
  }

  private isStale(value: Date | null): boolean {
    return !value || Date.now() - value.getTime() > 24 * 60 * 60 * 1_000
  }

  private async fetchStats(
    neteaseSongId: string,
    neteaseAlbumId: string | null,
  ): Promise<{
    publishTime: Date | null
    popularity: number | null
    redCount: number | null
    commentCount: number | null
  }> {
    const [detail, red, comments] = await Promise.all([
      this.request('/song/detail', { ids: neteaseSongId }),
      this.request('/song/red/count', { id: neteaseSongId }),
      this.request('/comment/music', { id: neteaseSongId, limit: '1', offset: '0' }),
    ])
    let publishTime = this.readSongDate(detail)
    if (!publishTime && neteaseAlbumId) {
      const album = await this.request('/album', { id: neteaseAlbumId })
      publishTime = this.readNestedDate(album, 'album', 'publishTime')
    }
    return {
      publishTime,
      popularity: this.readSongNumber(detail, 'pop'),
      redCount: this.readNestedNumber(red, 'data', 'count'),
      commentCount: this.readNumber(comments, 'total'),
    }
  }

  private readSongNumber(value: unknown, key: string): number | null {
    if (typeof value !== 'object' || value === null || !('songs' in value)) return null
    const songs = (value as Record<string, unknown>).songs
    return Array.isArray(songs) ? this.readNumber(songs[0], key) : null
  }

  private readSongDate(value: unknown): Date | null {
    const timestamp = this.readSongNumber(value, 'publishTime')
    return timestamp && timestamp > 0 ? new Date(timestamp) : null
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5_000)
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json() as unknown
        if (this.readNumber(payload, 'code') !== 200) throw new Error('Netease API failed')
        return payload
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError
  }

  private readNumber(value: unknown, key: string): number | null {
    if (typeof value !== 'object' || value === null || !(key in value)) return null
    const result = (value as Record<string, unknown>)[key]
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }

  private readNestedNumber(value: unknown, section: string, key: string): number | null {
    if (typeof value !== 'object' || value === null || !(section in value)) return null
    return this.readNumber((value as Record<string, unknown>)[section], key)
  }

  private readNestedDate(value: unknown, section: string, key: string): Date | null {
    const timestamp = this.readNestedNumber(value, section, key)
    return timestamp && timestamp > 0 ? new Date(timestamp) : null
  }
}
