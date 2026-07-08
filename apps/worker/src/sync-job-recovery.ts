import type { Queue } from 'bullmq'
import type { Pool } from 'pg'

import {
  ARTIST_SONG_IMPORT_JOB,
  type ArtistSongImportJobData,
} from './import/artist-song-import.processor'
import { PLAYLIST_IMPORT_JOB, type PlaylistImportJobData } from './import/playlist-import.processor'
import { SONG_SCREENING_JOB } from './screening/song-screening.processor'
import type { SongScreeningJobData } from './screening/screening.types'

type QueueJobData = PlaylistImportJobData | ArtistSongImportJobData | SongScreeningJobData

type StuckSyncJobRow = {
  id: string
  job_type: string
  source_id: string | null
  metadata: unknown
}

type ArtistRow = {
  id: string
  netease_artist_id: string | null
  name: string
}

const SCREENING_STATUSES = new Set(['accepted', 'pending', 'rejected'])

export async function recoverStuckSyncJobs(
  database: Pool,
  queue: Queue<QueueJobData>,
): Promise<number> {
  const result = await database.query<StuckSyncJobRow>(
    `SELECT id, job_type, source_id, metadata
     FROM sync_jobs
     WHERE status IN ('pending', 'running')
       AND finished_at IS NULL
     ORDER BY created_at ASC
     LIMIT 200`,
  )

  let recovered = 0
  for (const row of result.rows) {
    const recoveredJob = await toQueueJob(database, row)
    if (!recoveredJob) continue
    await queue.add(recoveredJob.name, recoveredJob.data, {
      jobId: `${recoveredJob.name}-${row.id}`,
    })
    recovered += 1
  }
  return recovered
}

async function toQueueJob(
  database: Pool,
  row: StuckSyncJobRow,
): Promise<{ name: string; data: QueueJobData } | null> {
  if (row.job_type === 'playlist_import' && row.source_id) {
    return {
      name: PLAYLIST_IMPORT_JOB,
      data: { syncJobId: row.id, playlistId: row.source_id },
    }
  }

  if (row.job_type === 'artist_song_import') {
    const artist = await findArtistForImport(database, row.source_id)
    if (!artist?.netease_artist_id) return null
    return {
      name: ARTIST_SONG_IMPORT_JOB,
      data: {
        syncJobId: row.id,
        artistId: artist.id,
        neteaseArtistId: artist.netease_artist_id,
        artistName: artist.name,
        maxSongs: readMetadataInteger(row.metadata, 'maxSongs', 500),
        offset: readMetadataInteger(row.metadata, 'offset', 0),
      },
    }
  }

  if (row.job_type === 'song_screening' && row.source_id) {
    return {
      name: SONG_SCREENING_JOB,
      data: parseScreeningData(row.id, row.source_id),
    }
  }

  return null
}

function readMetadataInteger(metadata: unknown, field: string, fallback: number): number {
  if (typeof metadata !== 'object' || metadata === null || !(field in metadata)) return fallback
  const value = (metadata as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

async function findArtistForImport(database: Pool, sourceId: string | null): Promise<ArtistRow | null> {
  const artistId = sourceId?.match(/^artist:(\d+):netease:\d+$/u)?.[1]
  if (!artistId) return null
  const result = await database.query<ArtistRow>(
    `SELECT id::text, netease_artist_id::text, name
     FROM artists
     WHERE id = $1`,
    [artistId],
  )
  return result.rows[0] ?? null
}

function parseScreeningData(syncJobId: string, sourceId: string): SongScreeningJobData {
  const songMatch = sourceId.match(/^song:(\d+)$/u)
  if (songMatch?.[1]) {
    return { syncJobId, songId: songMatch[1], limit: 1 }
  }

  const artistMatch = sourceId.match(/^artist:(\d+)$/u)
  if (artistMatch?.[1]) {
    return { syncJobId, artistId: artistMatch[1], limit: 200 }
  }

  const [rawStatus, rawLimit] = sourceId.split(':')
  const status = rawStatus ?? 'pending'
  const limit = Number(rawLimit)
  return {
    syncJobId,
    status: SCREENING_STATUSES.has(status) ? (status as SongScreeningJobData['status']) : 'pending',
    limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 5,
  }
}
