import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import { QueueService } from '../../infrastructure/queue.service'
import { SyncJobService } from '../import/sync-job.service'
import type { SyncJobResponse } from '../import/sync-job.types'
import type {
  CandidateArtistIdentityResponse,
  CandidateFilter,
  CandidateListResponse,
  CandidateSongResponse,
  ManualReviewRequest,
  ScreeningJobRequest,
  ScreeningStatsResponse,
  ScreeningStatus,
} from './screening.types'

type CandidateRow = {
  song_id: string
  netease_song_id: string
  song_name: string
  artist_names: string[]
  artist_identities: unknown
  album_name: string | null
  playlist_names: string[]
  score: string
  status: ScreeningStatus
  is_japanese_candidate: boolean
  reason: unknown
  reviewed_by: string | null
  reviewed_at: Date | null
  updated_at: Date
}

type ReviewRow = {
  id: string
  status: ScreeningStatus
}

type ActiveJobRow = {
  id: string
}

type StatsRow = {
  total_songs: number
  accepted_songs: number
  pending_songs: number
  rejected_songs: number
  unscreened_songs: number
  manually_reviewed_songs: number
  manual_artist_songs: number
  needs_artist_review_songs: number
  manual_artist_pending_songs: number
  high_score_pending_songs: number
  lyric_fallback_songs: number
  confirmed_artists: number
  manual_confirmed_artists: number
}

const SCREENING_STATUSES = new Set<ScreeningStatus>(['accepted', 'pending', 'rejected'])
const CANDIDATE_FILTERS = new Set<CandidateFilter>([
  'all',
  'manual_artist',
  'needs_artist_review',
  'manual_artist_pending',
  'high_score_pending',
  'lyric_fallback',
])

@Injectable()
export class ScreeningService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
  ) {}

  async createScreeningJob(body: unknown): Promise<SyncJobResponse> {
    const request = this.parseJobRequest(body)
    const activeJob = await this.findActiveScreeningJob()
    if (activeJob) {
      throw new BadRequestException(`Screening job #${activeJob.id} is already running`)
    }
    const sourceId = `${request.status ?? 'pending'}:${request.limit ?? 5}`
    const job = await this.syncJobs.createSongScreening(sourceId)
    try {
      await this.queue.enqueueSongScreening({
        syncJobId: job.id,
        status: request.status,
        limit: request.limit,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue screening job'
      await this.syncJobs.markQueueFailure(job.id, message)
      throw new BadRequestException(message)
    }
    return job
  }

  async createSongRescreenJob(songId: string): Promise<SyncJobResponse> {
    if (!/^\d{1,20}$/u.test(songId)) {
      throw new BadRequestException('Invalid song ID')
    }
    const activeJob = await this.findActiveScreeningJob()
    if (activeJob) {
      throw new BadRequestException(`Screening job #${activeJob.id} is already running`)
    }
    const existing = await this.findCandidateBySongId(songId)
    if (!existing) {
      throw new NotFoundException('Song screening record not found')
    }
    const job = await this.syncJobs.createSongScreening(`song:${songId}`)
    try {
      await this.queue.enqueueSongScreening({
        syncJobId: job.id,
        songId,
        limit: 1,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue song rescreening job'
      await this.syncJobs.markQueueFailure(job.id, message)
      throw new BadRequestException(message)
    }
    return job
  }

  async findCandidates(
    status: ScreeningStatus = 'pending',
    limit = 50,
    filter: CandidateFilter = 'all',
  ): Promise<CandidateListResponse> {
    if (!SCREENING_STATUSES.has(status)) {
      throw new BadRequestException('Invalid screening status')
    }
    if (!CANDIDATE_FILTERS.has(filter)) {
      throw new BadRequestException('Invalid candidate filter')
    }
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
    const result = await this.database.query<CandidateRow>(
      `${this.candidateSelectSql()}
       WHERE screening.status = $1
       ${this.buildCandidateFilterClause(filter)}
       GROUP BY song.id, album.id, screening.id
       ORDER BY screening.updated_at DESC, song.id DESC
       LIMIT $2`,
      [status, normalizedLimit],
    )
    return { items: result.rows.map((row) => this.mapCandidate(row)) }
  }

  async getStats(): Promise<ScreeningStatsResponse> {
    const result = await this.database.query<StatsRow>(
      `SELECT
         count(*)::int AS total_songs,
         count(*) FILTER (WHERE screening.status = 'accepted')::int AS accepted_songs,
         count(*) FILTER (WHERE screening.status = 'pending')::int AS pending_songs,
         count(*) FILTER (WHERE screening.status = 'rejected')::int AS rejected_songs,
         count(*) FILTER (
           WHERE screening.status = 'pending'
             AND screening.score = 0
             AND screening.reviewed_at IS NULL
             AND screening.reason->>'summary' = '已从网易云歌单导入，等待外部 API 初筛。'
         )::int AS unscreened_songs,
         count(*) FILTER (WHERE screening.reviewed_at IS NOT NULL)::int AS manually_reviewed_songs,
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM song_artists stat_song_artist
             JOIN artist_identity stat_identity ON stat_identity.artist_id = stat_song_artist.artist_id
             WHERE stat_song_artist.song_id = screening.song_id
               AND stat_identity.reviewed_at IS NOT NULL
           )
         )::int AS manual_artist_songs,
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM song_artists stat_song_artist
             LEFT JOIN artist_identity stat_identity ON stat_identity.artist_id = stat_song_artist.artist_id
             WHERE stat_song_artist.song_id = screening.song_id
               AND (
                 stat_identity.artist_id IS NULL
                 OR stat_identity.status IN ('unknown', 'pending')
               )
           )
         )::int AS needs_artist_review_songs,
         count(*) FILTER (
           WHERE screening.status = 'pending'
             AND EXISTS (
               SELECT 1
               FROM song_artists stat_song_artist
               JOIN artist_identity stat_identity ON stat_identity.artist_id = stat_song_artist.artist_id
               WHERE stat_song_artist.song_id = screening.song_id
                 AND stat_identity.reviewed_at IS NOT NULL
             )
         )::int AS manual_artist_pending_songs,
         count(*) FILTER (
           WHERE screening.status = 'pending'
             AND screening.score >= 50
         )::int AS high_score_pending_songs,
         count(*) FILTER (
           WHERE screening.reason->'fallback'->>'passed' = 'true'
         )::int AS lyric_fallback_songs,
         (SELECT count(*)::int FROM artist_identity WHERE status IN ('confirmed_by_api', 'confirmed_by_manual')) AS confirmed_artists,
         (SELECT count(*)::int FROM artist_identity WHERE status = 'confirmed_by_manual') AS manual_confirmed_artists
       FROM song_screening screening`,
    )
    const row = result.rows[0]
    return {
      totalSongs: row?.total_songs ?? 0,
      acceptedSongs: row?.accepted_songs ?? 0,
      pendingSongs: row?.pending_songs ?? 0,
      rejectedSongs: row?.rejected_songs ?? 0,
      unscreenedSongs: row?.unscreened_songs ?? 0,
      manuallyReviewedSongs: row?.manually_reviewed_songs ?? 0,
      manualArtistSongs: row?.manual_artist_songs ?? 0,
      needsArtistReviewSongs: row?.needs_artist_review_songs ?? 0,
      manualArtistPendingSongs: row?.manual_artist_pending_songs ?? 0,
      highScorePendingSongs: row?.high_score_pending_songs ?? 0,
      lyricFallbackSongs: row?.lyric_fallback_songs ?? 0,
      confirmedArtists: row?.confirmed_artists ?? 0,
      manualConfirmedArtists: row?.manual_confirmed_artists ?? 0,
      lastfmConfigured: Boolean(process.env.LASTFM_API_KEY),
    }
  }

  async reviewSong(songId: string, body: unknown): Promise<CandidateSongResponse> {
    if (!/^\d{1,20}$/u.test(songId)) {
      throw new BadRequestException('Invalid song ID')
    }
    const request = this.parseReviewRequest(body)
    const result = await this.database.query<ReviewRow>(
      `UPDATE song_screening
       SET status = $2,
           is_japanese_candidate = $2::varchar = 'accepted',
           reviewed_by = $3,
           reviewed_at = NOW(),
           reason = jsonb_set(
             COALESCE(reason, '{}'::jsonb),
             '{manual_review}',
             $4::jsonb,
             true
           ),
           updated_at = NOW()
       WHERE song_id = $1
       RETURNING id, status`,
      [
        songId,
        request.status,
        request.reviewer ?? 'admin',
        JSON.stringify({
          status: request.status,
          reviewer: request.reviewer ?? 'admin',
          reason: request.reason ?? null,
          reviewedAt: new Date().toISOString(),
        }),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new NotFoundException('Song screening record not found')
    }
    await this.database.query(
      `INSERT INTO review_records (target_type, target_id, old_status, new_status, reason, reviewer)
       VALUES ('song', $1, NULL, $2, $3, $4)`,
      [songId, request.status, request.reason ?? null, request.reviewer ?? 'admin'],
    )
    const refreshed = await this.findCandidateBySongId(songId)
    if (!refreshed) {
      throw new NotFoundException('Song screening record not found')
    }
    return refreshed
  }

  private async findActiveScreeningJob(): Promise<ActiveJobRow | null> {
    const result = await this.database.query<ActiveJobRow>(
      `SELECT id
       FROM sync_jobs
       WHERE job_type = 'song_screening'
         AND status IN ('pending', 'running')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    return result.rows[0] ?? null
  }

  private async findCandidateBySongId(songId: string): Promise<CandidateSongResponse | null> {
    const result = await this.database.query<CandidateRow>(
      `${this.candidateSelectSql()}
       WHERE song.id = $1
       GROUP BY song.id, album.id, screening.id`,
      [songId],
    )
    const row = result.rows[0]
    return row ? this.mapCandidate(row) : null
  }

  private candidateSelectSql(): string {
    return `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         COALESCE(array_remove(array_agg(DISTINCT artist.name), NULL), ARRAY[]::varchar[]) AS artist_names,
         COALESCE(
           jsonb_agg(
             DISTINCT jsonb_build_object(
               'artistId', artist.id::text,
               'artistName', artist.name,
               'neteaseArtistId', artist.netease_artist_id::text,
               'isJapanese', identity.is_japanese,
               'country', identity.country,
               'confidence', identity.confidence,
               'status', COALESCE(identity.status, 'unknown'),
               'reviewedBy', identity.reviewed_by,
               'reviewedAt', identity.reviewed_at
             )
           ) FILTER (WHERE artist.id IS NOT NULL),
           '[]'::jsonb
         ) AS artist_identities,
         album.name AS album_name,
         COALESCE(array_remove(array_agg(DISTINCT playlist.name), NULL), ARRAY[]::varchar[]) AS playlist_names,
         screening.score,
         screening.status,
         screening.is_japanese_candidate,
         screening.reason,
         screening.reviewed_by,
         screening.reviewed_at,
         screening.updated_at
       FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       LEFT JOIN albums album ON album.id = song.album_id
       LEFT JOIN song_artists song_artist ON song_artist.song_id = song.id
       LEFT JOIN artists artist ON artist.id = song_artist.artist_id
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN playlist_songs playlist_song ON playlist_song.song_id = song.id
       LEFT JOIN playlists playlist ON playlist.id = playlist_song.playlist_id`
  }

  private buildCandidateFilterClause(filter: CandidateFilter): string {
    if (filter === 'manual_artist') {
      return `AND EXISTS (
        SELECT 1
        FROM song_artists filter_song_artist
        JOIN artist_identity filter_identity ON filter_identity.artist_id = filter_song_artist.artist_id
        WHERE filter_song_artist.song_id = song.id
          AND filter_identity.reviewed_at IS NOT NULL
      )`
    }
    if (filter === 'needs_artist_review') {
      return `AND EXISTS (
        SELECT 1
        FROM song_artists filter_song_artist
        LEFT JOIN artist_identity filter_identity ON filter_identity.artist_id = filter_song_artist.artist_id
        WHERE filter_song_artist.song_id = song.id
          AND (
            filter_identity.artist_id IS NULL
            OR filter_identity.status IN ('unknown', 'pending')
          )
      )`
    }
    if (filter === 'manual_artist_pending') {
      return `AND screening.status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM song_artists filter_song_artist
        JOIN artist_identity filter_identity ON filter_identity.artist_id = filter_song_artist.artist_id
        WHERE filter_song_artist.song_id = song.id
          AND filter_identity.reviewed_at IS NOT NULL
      )`
    }
    if (filter === 'high_score_pending') {
      return `AND screening.status = 'pending'
      AND screening.score >= 50`
    }
    if (filter === 'lyric_fallback') {
      return `AND screening.reason->'fallback'->>'passed' = 'true'`
    }
    return ''
  }

  private parseJobRequest(body: unknown): Required<ScreeningJobRequest> {
    const value = typeof body === 'object' && body !== null ? body : {}
    const status = 'status' in value ? value.status : 'pending'
    const limit = 'limit' in value ? Number(value.limit) : 5
    if (status !== undefined && !SCREENING_STATUSES.has(status as ScreeningStatus)) {
      throw new BadRequestException('Invalid screening status')
    }
    if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('Screening limit must be between 1 and 50')
    }
    return { status: (status as ScreeningStatus | undefined) ?? 'pending', limit: Math.trunc(limit) }
  }

  private parseReviewRequest(body: unknown): ManualReviewRequest {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Invalid review request')
    }
    const status = 'status' in body ? body.status : undefined
    if (!SCREENING_STATUSES.has(status as ScreeningStatus)) {
      throw new BadRequestException('Invalid review status')
    }
    return {
      status: status as ScreeningStatus,
      reviewer: 'reviewer' in body && typeof body.reviewer === 'string' ? body.reviewer.trim() || 'admin' : 'admin',
      reason: 'reason' in body && typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
    }
  }

  private mapCandidate(row: CandidateRow): CandidateSongResponse {
    return {
      songId: row.song_id,
      neteaseSongId: row.netease_song_id,
      songName: row.song_name,
      artistNames: row.artist_names,
      artistIdentities: this.mapArtistIdentities(row.artist_identities),
      albumName: row.album_name,
      playlistNames: row.playlist_names,
      score: Number(row.score),
      status: row.status,
      isJapaneseCandidate: row.is_japanese_candidate,
      reason: row.reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private mapArtistIdentities(value: unknown): CandidateArtistIdentityResponse[] {
    if (!Array.isArray(value)) {
      return []
    }
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        artistId: String(item.artistId),
        artistName: typeof item.artistName === 'string' ? item.artistName : 'Unknown artist',
        neteaseArtistId: item.neteaseArtistId === null ? null : String(item.neteaseArtistId),
        isJapanese: typeof item.isJapanese === 'boolean' ? item.isJapanese : null,
        country: typeof item.country === 'string' ? item.country : null,
        confidence: item.confidence === null || item.confidence === undefined ? null : Number(item.confidence),
        status: this.parseArtistIdentityStatus(item.status),
        reviewedBy: typeof item.reviewedBy === 'string' ? item.reviewedBy : null,
        reviewedAt: typeof item.reviewedAt === 'string' ? new Date(item.reviewedAt).toISOString() : null,
      }))
  }

  private parseArtistIdentityStatus(value: unknown): CandidateArtistIdentityResponse['status'] {
    if (
      value === 'confirmed_by_api' ||
      value === 'confirmed_by_manual' ||
      value === 'pending' ||
      value === 'rejected' ||
      value === 'unknown'
    ) {
      return value
    }
    return 'unknown'
  }
}
