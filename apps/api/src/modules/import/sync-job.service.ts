import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import type { SyncJobItemResponse, SyncJobResponse, SyncJobStatus } from './sync-job.types'

type SyncJobRow = {
  id: string
  job_type: string
  source_id: string | null
  status: SyncJobStatus
  total_count: number
  success_count: number
  failed_count: number
  error_message: string | null
  metadata: unknown
  started_at: Date | null
  finished_at: Date | null
  created_at: Date
  updated_at: Date
}

type SyncJobItemRow = {
  id: string
  sync_job_id: string
  target_type: string
  target_id: string | null
  netease_song_id: string | null
  name: string
  artist_names: unknown
  status: 'success' | 'failed' | 'skipped'
  message: string | null
  created_at: Date
}

@Injectable()
export class SyncJobService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createPlaylistImport(playlistId: string): Promise<SyncJobResponse> {
    const result = await this.database.query<SyncJobRow>(
      `INSERT INTO sync_jobs (job_type, source_id)
       VALUES ('playlist_import', $1)
       RETURNING *`,
      [playlistId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create sync job')
    }
    return this.mapRow(row)
  }

  async createSongScreening(sourceId: string): Promise<SyncJobResponse> {
    const result = await this.database.query<SyncJobRow>(
      `INSERT INTO sync_jobs (job_type, source_id)
       VALUES ('song_screening', $1)
       RETURNING *`,
      [sourceId],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create screening job')
    }
    return this.mapRow(row)
  }

  async createArtistSongImport(
    artistId: string,
    neteaseArtistId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<SyncJobResponse> {
    const result = await this.database.query<SyncJobRow>(
      `INSERT INTO sync_jobs (job_type, source_id, metadata)
       VALUES ('artist_song_import', $1, $2::jsonb)
       RETURNING *`,
      [`artist:${artistId}:netease:${neteaseArtistId}`, JSON.stringify(metadata)],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create artist song import job')
    }
    return this.mapRow(row)
  }

  async createCatalogStatsSync(metadata: Record<string, unknown>): Promise<SyncJobResponse> {
    const result = await this.database.query<SyncJobRow>(
      `INSERT INTO sync_jobs (job_type, source_id, metadata)
       VALUES ('catalog_stats_sync', 'catalog_stats', $1::jsonb)
       RETURNING *`,
      [JSON.stringify(metadata)],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create catalog stats sync job')
    }
    return this.mapRow(row)
  }

  async markQueueFailure(id: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE sync_jobs
       SET status = 'failed', error_message = $2, finished_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, message],
    )
  }

  async findRecent(limit = 20): Promise<SyncJobResponse[]> {
    const result = await this.database.query<SyncJobRow>(
      `SELECT * FROM sync_jobs
       ORDER BY
         CASE status
           WHEN 'running' THEN 0
           WHEN 'pending' THEN 1
           ELSE 2
         END,
         updated_at DESC,
         created_at DESC
       LIMIT $1`,
      [limit],
    )
    return result.rows.map((row) => this.mapRow(row))
  }

  async findById(id: string): Promise<SyncJobResponse> {
    const result = await this.database.query<SyncJobRow>(
      'SELECT * FROM sync_jobs WHERE id = $1',
      [id],
    )
    const row = result.rows[0]
    if (!row) {
      throw new NotFoundException('同步任务不存在')
    }
    return this.mapRow(row)
  }

  async findItems(syncJobId: string, limit = 100): Promise<SyncJobItemResponse[]> {
    await this.findById(syncJobId)
    const result = await this.database.query<SyncJobItemRow>(
      `SELECT
         id::text,
         sync_job_id::text,
         target_type,
         target_id::text,
         netease_song_id::text,
         name,
         artist_names,
         status,
         message,
         created_at
       FROM sync_job_items
       WHERE sync_job_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [syncJobId, limit],
    )
    return result.rows.map((row) => this.mapItemRow(row))
  }

  private mapRow(row: SyncJobRow): SyncJobResponse {
    return {
      id: row.id,
      jobType: row.job_type,
      sourceId: row.source_id,
      status: row.status,
      totalCount: row.total_count,
      successCount: row.success_count,
      failedCount: row.failed_count,
      errorMessage: row.error_message,
      metadata: typeof row.metadata === 'object' && row.metadata !== null
        ? row.metadata as Record<string, unknown>
        : {},
      startedAt: row.started_at?.toISOString() ?? null,
      finishedAt: row.finished_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private mapItemRow(row: SyncJobItemRow): SyncJobItemResponse {
    return {
      id: row.id,
      syncJobId: row.sync_job_id,
      targetType: row.target_type,
      targetId: row.target_id,
      neteaseSongId: row.netease_song_id,
      name: row.name,
      artistNames: this.readStringArray(row.artist_names),
      status: row.status,
      message: row.message,
      createdAt: row.created_at.toISOString(),
    }
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  }
}
