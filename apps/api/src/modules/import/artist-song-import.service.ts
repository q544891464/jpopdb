import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import { QueueService } from '../../infrastructure/queue.service'
import type { SyncJobResponse } from './sync-job.types'
import { SyncJobService } from './sync-job.service'

type ConfirmedArtistRow = {
  artist_id: string
  netease_artist_id: string
  artist_name: string
}

type LatestImportRow = {
  metadata: unknown
}

type TruncatedImportRow = {
  artist_id: string
  netease_artist_id: string
  artist_name: string
  metadata: unknown
  legacy_offset?: number | null
}

export type ConfirmedArtistImportResponse = {
  queuedCount: number
  maxSongsPerArtist: number
  jobs: SyncJobResponse[]
}

@Injectable()
export class ArtistSongImportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
    @Inject(QueueService) private readonly queue: QueueService,
  ) {}

  async createForArtist(artistId: string, body: unknown): Promise<SyncJobResponse> {
    if (!/^\d{1,20}$/u.test(artistId)) {
      throw new BadRequestException('artistId 必须是本地艺人数字 ID')
    }
    const maxSongs = this.readPositiveInteger(body, 'maxSongs', 500, 2_000)
    const offset = this.readNonNegativeInteger(body, 'offset', 0)
    const artist = await this.findConfirmedArtist(artistId)
    if (!artist) {
      throw new NotFoundException('仅支持导入已确认的日本艺人，且艺人必须有网易云 ID')
    }
    return this.enqueueArtist(artist, maxSongs, offset)
  }

  async createManualArtistImport(body: unknown): Promise<SyncJobResponse> {
    const value = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
    const neteaseArtistId = this.readNeteaseArtistId(value.neteaseArtistId)
    const artistName = this.readOptionalText(value.artistName) ?? `网易云艺人 ${neteaseArtistId}`
    const maxSongs = this.readPositiveInteger(body, 'maxSongs', 500, 2_000)
    const artist = await this.upsertManualArtist(neteaseArtistId, artistName)
    return this.enqueueArtist(artist, maxSongs, 0)
  }

  async continueForArtist(artistId: string, body: unknown): Promise<SyncJobResponse> {
    if (!/^\d{1,20}$/u.test(artistId)) {
      throw new BadRequestException('artistId 必须是本地艺人数字 ID')
    }
    const maxSongs = this.readPositiveInteger(body, 'maxSongs', 500, 2_000)
    const artist = await this.findConfirmedArtist(artistId)
    if (!artist) {
      throw new NotFoundException('仅支持导入已确认的日本艺人，且艺人必须有网易云 ID')
    }
    const latest = await this.findLatestImportMetadata(artist.artist_id, artist.netease_artist_id)
    const nextOffset = this.readMetadataInteger(latest, 'nextOffset', 0)
    const totalAvailable = this.readMetadataInteger(latest, 'totalAvailable', 0)
    if (totalAvailable > 0 && nextOffset >= totalAvailable) {
      throw new BadRequestException('该艺人没有更多可继续导入的网易云关联歌曲')
    }
    return this.enqueueArtist(artist, maxSongs, nextOffset)
  }

  async continueTruncatedImports(body: unknown): Promise<ConfirmedArtistImportResponse> {
    const maxArtists = this.readPositiveInteger(body, 'maxArtists', 10, 50)
    const maxSongsPerArtist = this.readPositiveInteger(body, 'maxSongsPerArtist', 500, 2_000)
    const result = await this.database.query<TruncatedImportRow>(
      `SELECT artist_id, netease_artist_id, artist_name, metadata, legacy_offset
       FROM (
         SELECT DISTINCT ON (job.source_id)
           artist.id AS artist_id,
           artist.netease_artist_id,
           artist.name AS artist_name,
           job.metadata,
           GREATEST(COALESCE(job.success_count, 0), COALESCE(job.total_count, 0)) AS legacy_offset,
           job.created_at
         FROM sync_jobs job
         JOIN artists artist
           ON job.source_id = 'artist:' || artist.id::text || ':netease:' || artist.netease_artist_id::text
         JOIN artist_identity identity ON identity.artist_id = artist.id
         WHERE job.job_type = 'artist_song_import'
           AND job.status NOT IN ('pending', 'running')
           AND (
             (job.metadata->>'truncated') = 'true'
             OR (
               COALESCE(job.metadata, '{}'::jsonb) = '{}'::jsonb
               AND GREATEST(COALESCE(job.success_count, 0), COALESCE(job.total_count, 0)) >= $2
             )
           )
           AND artist.netease_artist_id IS NOT NULL
           AND identity.is_japanese = TRUE
           AND identity.status IN ('confirmed_by_api', 'confirmed_by_manual')
           AND NOT EXISTS (
             SELECT 1
             FROM sync_jobs active_job
             WHERE active_job.job_type = 'artist_song_import'
               AND active_job.source_id = job.source_id
               AND active_job.status IN ('pending', 'running')
           )
         ORDER BY job.source_id, job.created_at DESC
       ) latest
       WHERE (
           (metadata->>'truncated') = 'true'
           AND (
             COALESCE((metadata->>'totalAvailable')::int, 0) = 0
             OR COALESCE((metadata->>'nextOffset')::int, 0) < COALESCE((metadata->>'totalAvailable')::int, 0)
           )
         )
         OR (
           COALESCE(metadata, '{}'::jsonb) = '{}'::jsonb
           AND legacy_offset >= $2
         )
       ORDER BY created_at ASC
       LIMIT $1`,
      [maxArtists, maxSongsPerArtist],
    )

    const jobs: SyncJobResponse[] = []
    for (const row of result.rows) {
      const metadata = this.readMetadata(row.metadata)
      const offset = this.readMetadataInteger(metadata, 'nextOffset', row.legacy_offset ?? 0)
      jobs.push(await this.enqueueArtist(row, maxSongsPerArtist, offset))
    }
    return { queuedCount: jobs.length, maxSongsPerArtist, jobs }
  }

  async createForConfirmedArtists(body: unknown): Promise<ConfirmedArtistImportResponse> {
    const maxArtists = this.readPositiveInteger(body, 'maxArtists', 10, 50)
    const maxSongsPerArtist = this.readPositiveInteger(body, 'maxSongsPerArtist', 500, 2_000)
    const result = await this.database.query<ConfirmedArtistRow>(
      `SELECT
         artist.id AS artist_id,
         artist.netease_artist_id,
         artist.name AS artist_name
       FROM artists artist
       JOIN artist_identity identity ON identity.artist_id = artist.id
       WHERE identity.is_japanese = TRUE
         AND identity.status IN ('confirmed_by_api', 'confirmed_by_manual')
         AND artist.netease_artist_id IS NOT NULL
       ORDER BY (
         SELECT max(job.created_at)
         FROM sync_jobs job
         WHERE job.job_type = 'artist_song_import'
           AND job.source_id LIKE 'artist:' || artist.id || ':%'
       ) ASC NULLS FIRST,
       artist.id ASC
       LIMIT $1`,
      [maxArtists],
    )

    const jobs: SyncJobResponse[] = []
    for (const artist of result.rows) {
      jobs.push(await this.enqueueArtist(artist, maxSongsPerArtist, 0))
    }
    return { queuedCount: jobs.length, maxSongsPerArtist, jobs }
  }

  private async findConfirmedArtist(artistId: string): Promise<ConfirmedArtistRow | null> {
    const result = await this.database.query<ConfirmedArtistRow>(
      `SELECT
         artist.id AS artist_id,
         artist.netease_artist_id,
         artist.name AS artist_name
       FROM artists artist
       JOIN artist_identity identity ON identity.artist_id = artist.id
       WHERE artist.id = $1
         AND identity.is_japanese = TRUE
         AND identity.status IN ('confirmed_by_api', 'confirmed_by_manual')
         AND artist.netease_artist_id IS NOT NULL`,
      [artistId],
    )
    return result.rows[0] ?? null
  }

  private async upsertManualArtist(
    neteaseArtistId: string,
    artistName: string,
  ): Promise<ConfirmedArtistRow> {
    const result = await this.database.query<ConfirmedArtistRow>(
      `WITH upserted_artist AS (
         INSERT INTO artists (netease_artist_id, name, alias, raw_json)
         VALUES ($1, $2, '[]'::jsonb, $3::jsonb)
         ON CONFLICT (netease_artist_id) DO UPDATE SET
           name = CASE
             WHEN EXCLUDED.name LIKE '网易云艺人 %' THEN artists.name
             ELSE EXCLUDED.name
           END,
           raw_json = COALESCE(artists.raw_json, '{}'::jsonb) || EXCLUDED.raw_json,
           updated_at = NOW()
         RETURNING id, netease_artist_id, name
       ), upserted_identity AS (
         INSERT INTO artist_identity (
           artist_id, is_japanese, country, confidence, status,
           source_summary, reviewed_by, reviewed_at
         )
         SELECT
           id, TRUE, 'JP', 100, 'confirmed_by_manual',
           jsonb_build_object(
             'manual_import', TRUE,
             'neteaseArtistId', netease_artist_id::text,
             'artistName', name
           ),
           'admin',
           NOW()
         FROM upserted_artist
         ON CONFLICT (artist_id) DO UPDATE SET
           is_japanese = TRUE,
           country = 'JP',
           confidence = 100,
           status = 'confirmed_by_manual',
           source_summary = COALESCE(artist_identity.source_summary, '{}'::jsonb) || EXCLUDED.source_summary,
           reviewed_by = 'admin',
           reviewed_at = NOW(),
           updated_at = NOW()
       )
       SELECT
         id AS artist_id,
         netease_artist_id::text,
         name AS artist_name
       FROM upserted_artist`,
      [
        neteaseArtistId,
        artistName,
        JSON.stringify({
          manual_import: true,
          neteaseArtistId,
          artistName,
        }),
      ],
    )
    const artist = result.rows[0]
    if (!artist) {
      throw new Error('Failed to create manual artist import')
    }
    return artist
  }

  private async enqueueArtist(
    artist: ConfirmedArtistRow,
    maxSongs: number,
    offset: number,
  ): Promise<SyncJobResponse> {
    const job = await this.syncJobs.createArtistSongImport(
      artist.artist_id,
      artist.netease_artist_id,
      {
        offset,
        maxSongs,
        artistName: artist.artist_name,
        totalAvailable: null,
        truncated: null,
        importedSongCount: 0,
        nextOffset: offset,
      },
    )
    try {
      await this.queue.enqueueArtistSongImport({
        syncJobId: job.id,
        artistId: artist.artist_id,
        neteaseArtistId: artist.netease_artist_id,
        artistName: artist.artist_name,
        maxSongs,
        offset,
      })
    } catch {
      await this.syncJobs.markQueueFailure(job.id, '任务队列暂不可用')
      throw new ServiceUnavailableException('任务队列暂不可用，请稍后重试')
    }
    return job
  }

  private async findLatestImportMetadata(
    artistId: string,
    neteaseArtistId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.database.query<LatestImportRow>(
      `SELECT metadata
       FROM sync_jobs
       WHERE job_type = 'artist_song_import'
         AND source_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [`artist:${artistId}:netease:${neteaseArtistId}`],
    )
    const metadata = result.rows[0]?.metadata
    return this.readMetadata(metadata)
  }

  private readMetadata(metadata: unknown): Record<string, unknown> {
    return typeof metadata === 'object' && metadata !== null ? metadata as Record<string, unknown> : {}
  }

  private readMetadataInteger(
    metadata: Record<string, unknown>,
    field: string,
    defaultValue: number,
  ): number {
    const value = metadata[field]
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : defaultValue
  }

  private readPositiveInteger(
    body: unknown,
    field: string,
    defaultValue: number,
    maximum: number,
  ): number {
    if (typeof body !== 'object' || body === null || !(field in body)) {
      return defaultValue
    }
    const value = (body as Record<string, unknown>)[field]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
      throw new BadRequestException(`${field} 必须是 1 到 ${maximum} 之间的整数`)
    }
    return value
  }

  private readNonNegativeInteger(
    body: unknown,
    field: string,
    defaultValue: number,
  ): number {
    if (typeof body !== 'object' || body === null || !(field in body)) {
      return defaultValue
    }
    const value = (body as Record<string, unknown>)[field]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} 必须是大于或等于 0 的整数`)
    }
    return value
  }

  private readNeteaseArtistId(value: unknown): string {
    const normalized = typeof value === 'number' ? String(Math.trunc(value)) : typeof value === 'string' ? value.trim() : ''
    if (!/^\d{1,20}$/u.test(normalized)) {
      throw new BadRequestException('neteaseArtistId 必须是网易云艺人数字 ID')
    }
    return normalized
  }

  private readOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim().slice(0, 255)
    return normalized.length > 0 ? normalized : null
  }
}
