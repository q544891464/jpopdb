import type { Pool } from 'pg'

import type { NeteaseCatalogStatsResult } from '../netease/netease.types'

export type CatalogStatsSyncTarget = {
  songId: string
  neteaseSongId: string
  songName: string
  artistNames: string[]
  albumId: string | null
  neteaseAlbumId: string | null
}

type CatalogStatsTargetRow = {
  song_id: string
  netease_song_id: string
  song_name: string
  artist_names: unknown
  album_id: string | null
  netease_album_id: string | null
}

export class CatalogStatsSyncRepository {
  constructor(private readonly pool: Pool) {}

  async markRunning(syncJobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET status = 'running', started_at = COALESCE(started_at, NOW()),
           finished_at = NULL, error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [syncJobId],
    )
  }

  async setTotal(syncJobId: string, totalCount: number): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET total_count = $2, success_count = 0, failed_count = 0, updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, totalCount],
    )
  }

  async updateProgress(syncJobId: string, successCount: number, failedCount: number): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET success_count = $2, failed_count = $3, updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, successCount, failedCount],
    )
  }

  async updateJobMetadata(syncJobId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, JSON.stringify(metadata)],
    )
  }

  async markFinished(
    syncJobId: string,
    status: 'success' | 'failed' | 'partial_success',
    successCount: number,
    failedCount: number,
    errorMessage: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET status = $2, success_count = $3, failed_count = $4,
           error_message = $5, finished_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, status, successCount, failedCount, errorMessage],
    )
  }

  async markRetry(syncJobId: string, message: string): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET status = 'pending', error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, message],
    )
  }

  async findTargets(limit: number, missingOnly: boolean): Promise<CatalogStatsSyncTarget[]> {
    const filter = missingOnly
      ? `(song.netease_red_count IS NULL OR song.netease_comment_count IS NULL)`
      : `(song.netease_stats_updated_at IS NULL
          OR song.netease_stats_updated_at < NOW() - INTERVAL '24 hours')`
    const result = await this.pool.query<CatalogStatsTargetRow>(
      `SELECT
         song.id::text AS song_id,
         song.netease_song_id::text AS netease_song_id,
         song.name AS song_name,
         COALESCE(
           jsonb_agg(DISTINCT artist.name) FILTER (WHERE artist.name IS NOT NULL),
           '[]'::jsonb
         ) AS artist_names,
         album.id::text AS album_id,
         album.netease_album_id::text AS netease_album_id
       FROM songs song
       LEFT JOIN albums album ON album.id = song.album_id
       LEFT JOIN song_artists song_artist ON song_artist.song_id = song.id
       LEFT JOIN artists artist ON artist.id = song_artist.artist_id
       WHERE ${filter}
       GROUP BY song.id, album.id
       ORDER BY song.netease_stats_updated_at ASC NULLS FIRST, song.id ASC
       LIMIT $1`,
      [limit],
    )

    return result.rows.map((row) => ({
      songId: row.song_id,
      neteaseSongId: row.netease_song_id,
      songName: row.song_name,
      artistNames: this.readStringArray(row.artist_names),
      albumId: row.album_id,
      neteaseAlbumId: row.netease_album_id,
    }))
  }

  async updateStats(target: CatalogStatsSyncTarget, stats: NeteaseCatalogStatsResult): Promise<void> {
    const updatedAt = new Date()
    await this.pool.query(
      `UPDATE songs
       SET netease_popularity = COALESCE($2, netease_popularity),
           netease_red_count = COALESCE($3, netease_red_count),
           netease_comment_count = COALESCE($4, netease_comment_count),
           netease_stats_updated_at = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        target.songId,
        stats.popularity,
        stats.redCount,
        stats.commentCount,
        updatedAt,
      ],
    )
    if (target.albumId && stats.publishTime) {
      await this.pool.query(
        `UPDATE albums
         SET publish_time = COALESCE(publish_time, $2), updated_at = NOW()
         WHERE id = $1`,
        [target.albumId, stats.publishTime],
      )
    }
  }

  async recordSongItem(
    syncJobId: string,
    target: {
      songId: string | null
      neteaseSongId: string | null
      songName: string
      artistNames: string[]
      status: 'success' | 'failed' | 'skipped'
      message: string | null
      raw?: unknown
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_job_items (
         sync_job_id, target_type, target_id, netease_song_id, name,
         artist_names, status, message, raw_json
       ) VALUES ($1, 'song', $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)`,
      [
        syncJobId,
        target.songId,
        target.neteaseSongId,
        target.songName.slice(0, 255),
        JSON.stringify(target.artistNames),
        target.status,
        target.message,
        JSON.stringify(target.raw ?? null),
      ],
    )
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .sort((left, right) => left.localeCompare(right))
  }
}
