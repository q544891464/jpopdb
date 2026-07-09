import type { Pool } from 'pg'

import type { ExternalMatchResult } from '../external/external.types'
import type {
  ArtistIdentity,
  LyricsCache,
  ScreeningCandidate,
  ScreeningCandidateArtist,
  ScreeningReason,
  ScreeningStatus,
} from './screening.types'

type CandidateRow = {
  song_id: string
  netease_song_id: string
  song_name: string
  album_name: string | null
  artists: unknown
  playlist_names: string[]
  reviewed_at: Date | null
}

type LyricsCacheRow = {
  song_id: string
  raw_lrc: string | null
  translated_lrc: string | null
  kana_count: number | null
  kana_ratio: string | null
  language_guess: string | null
  last_fetch_at: Date
}

type IdentityRow = {
  artist_id: string
  is_japanese: boolean | null
  country: string | null
  confidence: string | null
  status: ArtistIdentity['status']
  reviewed_at: Date | null
}

type EmbeddedIdentity = {
  artistId?: unknown
  artistName?: unknown
  isJapanese?: unknown
  country?: unknown
  confidence?: unknown
  status?: unknown
  reviewedAt?: unknown
}

export class ScreeningRepository {
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

  async markRetry(syncJobId: string, message: string): Promise<void> {
    await this.pool.query(
      `UPDATE sync_jobs
       SET status = 'pending', error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [syncJobId, message],
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

  async findCandidates(status: ScreeningStatus, limit: number): Promise<ScreeningCandidate[]> {
    const result = await this.pool.query<CandidateRow>(
      `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         album.name AS album_name,
         ${this.artistAggregateSql()} AS artists,
         COALESCE(array_remove(array_agg(DISTINCT playlist.name), NULL), ARRAY[]::varchar[]) AS playlist_names,
         screening.reviewed_at
       FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       JOIN song_artists song_artist ON song_artist.song_id = song.id
       JOIN artists artist ON artist.id = song_artist.artist_id
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN albums album ON album.id = song.album_id
       LEFT JOIN playlist_songs playlist_song ON playlist_song.song_id = song.id
       LEFT JOIN playlists playlist ON playlist.id = playlist_song.playlist_id
       WHERE screening.status = $1
       GROUP BY song.id, album.id, screening.id
       ORDER BY screening.updated_at ASC, song.id ASC
       LIMIT $2`,
      [status, limit],
    )
    return result.rows.map((row) => this.mapCandidate(row))
  }

  async findCandidateBySongId(songId: string): Promise<ScreeningCandidate | null> {
    const result = await this.pool.query<CandidateRow>(
      `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         album.name AS album_name,
         ${this.artistAggregateSql()} AS artists,
         COALESCE(array_remove(array_agg(DISTINCT playlist.name), NULL), ARRAY[]::varchar[]) AS playlist_names,
         screening.reviewed_at
       FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       JOIN song_artists song_artist ON song_artist.song_id = song.id
       JOIN artists artist ON artist.id = song_artist.artist_id
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN albums album ON album.id = song.album_id
       LEFT JOIN playlist_songs playlist_song ON playlist_song.song_id = song.id
       LEFT JOIN playlists playlist ON playlist.id = playlist_song.playlist_id
       WHERE song.id = $1
       GROUP BY song.id, album.id, screening.id
       LIMIT 1`,
      [songId],
    )
    const row = result.rows[0]
    return row ? this.mapCandidate(row) : null
  }

  async findCandidatesByArtistId(artistId: string, limit: number): Promise<ScreeningCandidate[]> {
    const result = await this.pool.query<CandidateRow>(
      `SELECT
         song.id AS song_id,
         song.netease_song_id,
         song.name AS song_name,
         album.name AS album_name,
         ${this.artistAggregateSql()} AS artists,
         COALESCE(array_remove(array_agg(DISTINCT playlist.name), NULL), ARRAY[]::varchar[]) AS playlist_names,
         screening.reviewed_at
       FROM song_screening screening
       JOIN songs song ON song.id = screening.song_id
       JOIN song_artists target_song_artist ON target_song_artist.song_id = song.id
       JOIN song_artists song_artist ON song_artist.song_id = song.id
       JOIN artists artist ON artist.id = song_artist.artist_id
       LEFT JOIN artist_identity identity ON identity.artist_id = artist.id
       LEFT JOIN albums album ON album.id = song.album_id
       LEFT JOIN playlist_songs playlist_song ON playlist_song.song_id = song.id
       LEFT JOIN playlists playlist ON playlist.id = playlist_song.playlist_id
       WHERE target_song_artist.artist_id = $1
         AND screening.reviewed_at IS NULL
       GROUP BY song.id, album.id, screening.id
       ORDER BY screening.updated_at ASC, song.id ASC
       LIMIT $2`,
      [artistId, limit],
    )
    return result.rows.map((row) => this.mapCandidate(row))
  }

  private artistAggregateSql(): string {
    return `COALESCE(
       jsonb_agg(DISTINCT jsonb_build_object(
         'artistId', artist.id::text,
         'artistName', artist.name,
         'identity', CASE
           WHEN identity.artist_id IS NULL THEN NULL
           ELSE jsonb_build_object(
             'artistId', artist.id::text,
             'artistName', artist.name,
             'isJapanese', identity.is_japanese,
             'country', identity.country,
             'confidence', identity.confidence,
             'status', identity.status,
             'reviewedAt', identity.reviewed_at
           )
         END
       )) FILTER (WHERE artist.id IS NOT NULL),
       '[]'::jsonb
     )`
  }

  private mapCandidate(row: CandidateRow): ScreeningCandidate {
    return {
      songId: row.song_id,
      neteaseSongId: row.netease_song_id,
      songName: row.song_name,
      albumName: row.album_name,
      artists: this.mapCandidateArtists(row.artists),
      playlistNames: row.playlist_names,
      reviewedAt: row.reviewed_at,
    }
  }

  private mapCandidateArtists(value: unknown): ScreeningCandidateArtist[] {
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => {
        const artistId = String(item.artistId)
        const artistName = typeof item.artistName === 'string' ? item.artistName : 'Unknown artist'
        return {
          artistId,
          artistName,
          identity: this.mapEmbeddedIdentity(item.identity as EmbeddedIdentity | null | undefined, artistId, artistName),
        }
      })
  }

  private mapEmbeddedIdentity(
    value: EmbeddedIdentity | null | undefined,
    fallbackArtistId: string,
    fallbackArtistName: string,
  ): ArtistIdentity | null {
    if (typeof value !== 'object' || value === null) return null
    const reviewedAt = this.parseDate(value.reviewedAt)
    return {
      artistId: typeof value.artistId === 'string' ? value.artistId : fallbackArtistId,
      artistName: typeof value.artistName === 'string' ? value.artistName : fallbackArtistName,
      isJapanese: typeof value.isJapanese === 'boolean' ? value.isJapanese : null,
      country: typeof value.country === 'string' ? value.country : null,
      confidence: this.parseNullableNumber(value.confidence),
      status: this.parseIdentityStatus(value.status),
      reviewedAt,
    }
  }

  private parseIdentityStatus(value: unknown): ArtistIdentity['status'] {
    return value === 'confirmed_by_api' ||
      value === 'confirmed_by_manual' ||
      value === 'pending' ||
      value === 'rejected' ||
      value === 'unknown'
      ? value
      : 'unknown'
  }

  private parseDate(value: unknown): Date | null {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
    if (typeof value !== 'string') return null
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  private parseNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  async getLyricsCache(songId: string): Promise<LyricsCache | null> {
    const result = await this.pool.query<LyricsCacheRow>(
      `SELECT song_id, raw_lrc, translated_lrc, kana_count, kana_ratio, language_guess, last_fetch_at
       FROM lyrics_cache
       WHERE song_id = $1`,
      [songId],
    )
    const row = result.rows[0]
    return row
      ? {
          songId: row.song_id,
          rawLrc: row.raw_lrc,
          translatedLrc: row.translated_lrc,
          kanaCount: row.kana_count,
          kanaRatio: row.kana_ratio === null ? null : Number(row.kana_ratio),
          languageGuess: row.language_guess,
          lastFetchAt: row.last_fetch_at,
        }
      : null
  }

  async saveLyricsCache(
    songId: string,
    values: {
      rawLrc: string | null
      translatedLrc: string | null
      kanaCount: number
      kanaRatio: number
      languageGuess: string
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO lyrics_cache (
         song_id, raw_lrc, translated_lrc, kana_count, kana_ratio, language_guess, last_fetch_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (song_id) DO UPDATE SET
         raw_lrc = EXCLUDED.raw_lrc,
         translated_lrc = EXCLUDED.translated_lrc,
         kana_count = EXCLUDED.kana_count,
         kana_ratio = EXCLUDED.kana_ratio,
         language_guess = EXCLUDED.language_guess,
         last_fetch_at = NOW()`,
      [
        songId,
        values.rawLrc,
        values.translatedLrc,
        values.kanaCount,
        values.kanaRatio,
        values.languageGuess,
      ],
    )
  }

  async getArtistIdentity(artistId: string): Promise<ArtistIdentity | null> {
    const result = await this.pool.query<IdentityRow>(
      `SELECT artist_id, is_japanese, country, confidence, status, reviewed_at
       FROM artist_identity
       WHERE artist_id = $1`,
      [artistId],
    )
    const row = result.rows[0]
    return row
      ? {
          artistId: row.artist_id,
          isJapanese: row.is_japanese,
          country: row.country,
          confidence: row.confidence === null ? null : Number(row.confidence),
          status: row.status,
          reviewedAt: row.reviewed_at,
        }
      : null
  }

  async upsertArtistIdentity(
    artistId: string,
    values: {
      isJapanese: boolean | null
      country?: string
      confidence: number
      status: ArtistIdentity['status']
      sourceSummary: unknown
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO artist_identity (artist_id, is_japanese, country, confidence, status, source_summary)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (artist_id) DO UPDATE SET
         is_japanese = CASE
           WHEN artist_identity.reviewed_at IS NULL THEN EXCLUDED.is_japanese
           ELSE artist_identity.is_japanese
         END,
         country = CASE
           WHEN artist_identity.reviewed_at IS NULL THEN EXCLUDED.country
           ELSE artist_identity.country
         END,
         confidence = CASE
           WHEN artist_identity.reviewed_at IS NULL THEN EXCLUDED.confidence
           ELSE artist_identity.confidence
         END,
         status = CASE
           WHEN artist_identity.reviewed_at IS NULL THEN EXCLUDED.status
           ELSE artist_identity.status
         END,
         source_summary = CASE
           WHEN artist_identity.reviewed_at IS NULL THEN EXCLUDED.source_summary
           ELSE jsonb_set(
             COALESCE(artist_identity.source_summary, '{}'::jsonb),
             '{latest_auto_suggestion}',
             EXCLUDED.source_summary,
             true
           )
         END,
         updated_at = NOW()`,
      [
        artistId,
        values.isJapanese,
        values.country ?? null,
        values.confidence,
        values.status,
        JSON.stringify(values.sourceSummary),
      ],
    )
  }

  async saveExternalMatch(targetType: 'song' | 'artist', targetId: string, result: ExternalMatchResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_matches (
         target_type, target_id, source, external_id, matched_name, confidence, raw_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (target_type, target_id, source) DO UPDATE SET
         external_id = EXCLUDED.external_id,
         matched_name = EXCLUDED.matched_name,
         confidence = EXCLUDED.confidence,
         raw_json = EXCLUDED.raw_json,
         created_at = NOW()`,
      [
        targetType,
        targetId,
        result.source,
        result.externalId ?? null,
        result.matchedName ?? null,
        result.confidence,
        JSON.stringify({ raw: result.raw, evidence: result.evidence }),
      ],
    )
  }

  async saveScreening(songId: string, score: number, status: ScreeningStatus, reason: ScreeningReason): Promise<void> {
    await this.pool.query(
      `UPDATE song_screening
       SET score = CASE WHEN reviewed_at IS NULL THEN $2 ELSE score END,
           status = CASE WHEN reviewed_at IS NULL THEN $3 ELSE status END,
           is_japanese_candidate = CASE WHEN reviewed_at IS NULL THEN $3 = 'accepted' ELSE is_japanese_candidate END,
           reason = CASE
             WHEN reviewed_at IS NULL THEN $4::jsonb
             ELSE jsonb_set(
               COALESCE(reason, '{}'::jsonb),
               '{latest_auto_suggestion}',
               $5::jsonb,
               true
             )
           END,
           updated_at = NOW()
       WHERE song_id = $1`,
      [
        songId,
        score,
        status,
        JSON.stringify(reason),
        JSON.stringify(reason.latest_auto_suggestion ?? {
          score,
          status,
          summary: reason.summary,
          suggestedAt: new Date().toISOString(),
        }),
      ],
    )
  }
}
