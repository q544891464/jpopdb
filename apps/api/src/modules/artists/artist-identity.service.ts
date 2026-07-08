import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import { QueueService } from '../../infrastructure/queue.service'
import { SyncJobService } from '../import/sync-job.service'
import { ArtistSongImportService } from '../import/artist-song-import.service'
import type { SyncJobResponse } from '../import/sync-job.types'
import type {
  ArtistIdentityListResponse,
  ArtistIdentityResponse,
  ArtistIdentityReviewRequest,
  ArtistIdentityStatus,
} from './artist-identity.types'

const ARTIST_IDENTITY_STATUSES = new Set<ArtistIdentityStatus>([
  'confirmed_by_api',
  'confirmed_by_manual',
  'pending',
  'rejected',
  'unknown',
])

type ArtistIdentityRow = {
  artist_id: string
  netease_artist_id: string | null
  artist_name: string
  song_count: number
  is_japanese: boolean | null
  country: string | null
  confidence: string | null
  status: ArtistIdentityStatus | null
  source_summary: unknown
  reviewed_by: string | null
  reviewed_at: Date | null
  updated_at: Date | null
}

@Injectable()
export class ArtistIdentityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
    @Inject(ArtistSongImportService) private readonly artistSongImports: ArtistSongImportService,
  ) {}

  async findIdentities(status?: string, limit = 50): Promise<ArtistIdentityListResponse> {
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
    const normalizedStatus = this.parseStatus(status)
    const where = normalizedStatus ? 'WHERE COALESCE(identity.status, $1) = $1' : ''
    const params = normalizedStatus ? [normalizedStatus, normalizedLimit] : [normalizedLimit]
    const limitParam = normalizedStatus ? '$2' : '$1'
    const result = await this.database.query<ArtistIdentityRow>(
      `SELECT
         artist.id AS artist_id,
         artist.netease_artist_id,
         artist.name AS artist_name,
         count(DISTINCT song_artist.song_id)::int AS song_count,
         identity.is_japanese,
         identity.country,
         identity.confidence,
         identity.status,
         identity.source_summary,
         identity.reviewed_by,
         identity.reviewed_at,
         identity.updated_at
       FROM artists artist
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN song_artists song_artist ON song_artist.artist_id = artist.id
       ${where}
       GROUP BY artist.id, identity.id
       ORDER BY
         CASE COALESCE(identity.status, 'unknown')
           WHEN 'pending' THEN 0
           WHEN 'unknown' THEN 1
           WHEN 'confirmed_by_api' THEN 2
           WHEN 'rejected' THEN 3
           WHEN 'confirmed_by_manual' THEN 4
           ELSE 5
         END,
         song_count DESC,
         artist.name ASC
       LIMIT ${limitParam}`,
      params,
    )
    return { items: result.rows.map((row) => this.mapIdentity(row)) }
  }

  async reviewIdentity(artistId: string, body: unknown): Promise<ArtistIdentityResponse> {
    if (!/^\d{1,20}$/u.test(artistId)) {
      throw new BadRequestException('Invalid artist ID')
    }
    const request = this.parseReviewRequest(body)
    const existing = await this.findByArtistId(artistId)
    if (!existing) {
      throw new NotFoundException('Artist not found')
    }

    const status: ArtistIdentityStatus = request.isJapanese ? 'confirmed_by_manual' : 'rejected'
    const country = request.isJapanese ? 'JP' : null
    const sourceSummary = {
      ...(typeof existing.sourceSummary === 'object' && existing.sourceSummary !== null
        ? (existing.sourceSummary as Record<string, unknown>)
        : {}),
      manual_review: {
        isJapanese: request.isJapanese,
        status,
        reviewer: request.reviewer ?? 'admin',
        reason: request.reason ?? null,
        reviewedAt: new Date().toISOString(),
      },
    }

    await this.database.query(
      `INSERT INTO artist_identity (
         artist_id, is_japanese, country, confidence, source_summary,
         status, reviewed_by, reviewed_at, updated_at
       ) VALUES ($1, $2, $3, 100, $4::jsonb, $5, $6, NOW(), NOW())
       ON CONFLICT (artist_id) DO UPDATE SET
         is_japanese = EXCLUDED.is_japanese,
         country = EXCLUDED.country,
         confidence = EXCLUDED.confidence,
         source_summary = EXCLUDED.source_summary,
         status = EXCLUDED.status,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = NOW(),
         updated_at = NOW()`,
      [
        artistId,
        request.isJapanese,
        country,
        JSON.stringify(sourceSummary),
        status,
        request.reviewer ?? 'admin',
      ],
    )
    await this.database.query(
      `INSERT INTO review_records (target_type, target_id, old_status, new_status, reason, reviewer)
       VALUES ('artist', $1, $2, $3, $4, $5)`,
      [
        artistId,
        existing.status,
        status,
        request.reason ?? null,
        request.reviewer ?? 'admin',
      ],
    )

    const rescreenResult = request.rescreenSongs ? await this.enqueueArtistRescreen(artistId) : null
    const refreshed = await this.findByArtistId(artistId)
    if (!refreshed) {
      throw new NotFoundException('Artist not found')
    }
    let importJob: SyncJobResponse | null = null
    if (request.isJapanese && refreshed.neteaseArtistId) {
      try {
        importJob = await this.artistSongImports.createForArtist(artistId, { maxSongs: 500 })
      } catch {
        importJob = null
      }
    }
    return {
      ...refreshed,
      rescreenJob: rescreenResult?.job ?? null,
      rescreenSongCount: rescreenResult?.songCount ?? 0,
      importJob,
    }
  }

  private async enqueueArtistRescreen(artistId: string): Promise<{ job: SyncJobResponse; songCount: number } | null> {
    const countResult = await this.database.query<{ song_count: number }>(
      `SELECT count(DISTINCT screening.song_id)::int AS song_count
       FROM song_screening screening
       JOIN song_artists song_artist ON song_artist.song_id = screening.song_id
       WHERE song_artist.artist_id = $1
         AND screening.reviewed_at IS NULL`,
      [artistId],
    )
    const songCount = countResult.rows[0]?.song_count ?? 0
    if (songCount === 0) {
      return null
    }
    const job = await this.syncJobs.createSongScreening(`artist:${artistId}`)
    try {
      await this.queue.enqueueSongScreening({
        syncJobId: job.id,
        artistId,
        limit: Math.min(songCount, 200),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue artist rescreening job'
      await this.syncJobs.markQueueFailure(job.id, message)
      throw new BadRequestException(message)
    }
    return { job, songCount }
  }

  private parseStatus(status?: string): ArtistIdentityStatus | undefined {
    if (!status) {
      return undefined
    }
    if (!ARTIST_IDENTITY_STATUSES.has(status as ArtistIdentityStatus)) {
      throw new BadRequestException('Invalid artist identity status')
    }
    return status as ArtistIdentityStatus
  }

  private async findByArtistId(artistId: string): Promise<ArtistIdentityResponse | null> {
    const result = await this.database.query<ArtistIdentityRow>(
      `SELECT
         artist.id AS artist_id,
         artist.netease_artist_id,
         artist.name AS artist_name,
         count(DISTINCT song_artist.song_id)::int AS song_count,
         identity.is_japanese,
         identity.country,
         identity.confidence,
         identity.status,
         identity.source_summary,
         identity.reviewed_by,
         identity.reviewed_at,
         identity.updated_at
       FROM artists artist
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN song_artists song_artist ON song_artist.artist_id = artist.id
       WHERE artist.id = $1
       GROUP BY artist.id, identity.id`,
      [artistId],
    )
    const row = result.rows[0]
    return row ? this.mapIdentity(row) : null
  }

  private parseReviewRequest(body: unknown): ArtistIdentityReviewRequest {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Invalid artist review request')
    }
    if (!('isJapanese' in body) || typeof body.isJapanese !== 'boolean') {
      throw new BadRequestException('isJapanese must be a boolean')
    }
    return {
      isJapanese: body.isJapanese,
      reviewer: 'reviewer' in body && typeof body.reviewer === 'string' ? body.reviewer.trim() || 'admin' : 'admin',
      reason: 'reason' in body && typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
      rescreenSongs: 'rescreenSongs' in body ? body.rescreenSongs === true : false,
    }
  }

  private mapIdentity(row: ArtistIdentityRow): ArtistIdentityResponse {
    return {
      artistId: row.artist_id,
      neteaseArtistId: row.netease_artist_id,
      artistName: row.artist_name,
      songCount: row.song_count,
      isJapanese: row.is_japanese,
      country: row.country,
      confidence: row.confidence === null ? null : Number(row.confidence),
      status: row.status ?? 'unknown',
      sourceSummary: row.source_summary ?? {},
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      updatedAt: row.updated_at?.toISOString() ?? null,
    }
  }
}
