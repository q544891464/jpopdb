import { Pool } from 'pg'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'
const playlistId = process.env.TEST_PLAYLIST_ID ?? '60198'
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://jmusic:jmusic@127.0.0.1:5432/jmusic'
const screeningLimit = Number(process.env.SCREENING_LIMIT ?? 3)
const adminToken = process.env.ADMIN_TOKEN ?? readDotenvValue('ADMIN_TOKEN')
const pool = new Pool({ connectionString: databaseUrl })

async function request(path, options) {
  const response = await fetch(`${apiBaseUrl}${path}`, withAdminAuth(path, options))
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`)
  }
  return payload
}

function withAdminAuth(path, options = {}) {
  if (!path.startsWith('/api/admin')) return options
  if (!adminToken) throw new Error('ADMIN_TOKEN is required for admin smoke requests')
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${adminToken}`,
    },
  }
}

function readDotenvValue(name) {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return undefined
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/u)
    .find((item) => item.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim() : undefined
}

async function ensureImportedSongs() {
  const result = await pool.query(
    `SELECT count(*)::int AS count
     FROM playlist_songs playlist_song
     JOIN playlists playlist ON playlist.id = playlist_song.playlist_id
     WHERE playlist.netease_playlist_id = $1`,
    [playlistId],
  )
  if (result.rows[0]?.count > 0) {
    return
  }
  const created = await request('/api/admin/import/playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId }),
  })
  await waitForJob(created.id, 120)
}

async function waitForJob(id, maxAttempts) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const job = await request(`/api/admin/jobs/${id}`)
    if (['success', 'failed', 'partial_success'].includes(job.status)) {
      if (job.status === 'failed') {
        throw new Error(`Job ${id} failed: ${job.errorMessage ?? ''}`)
      }
      return job
    }
  }
  throw new Error(`Job ${id} did not finish in time`)
}

async function snapshot() {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int
          FROM song_screening
         WHERE reason ? 'external'
           AND updated_at > NOW() - INTERVAL '30 minutes') AS screened_recently,
       (SELECT count(*)::int FROM artist_identity) AS artist_identities,
       (SELECT count(*)::int
          FROM external_matches
         WHERE source IN ('musicbrainz', 'wikidata', 'lastfm')) AS external_matches,
       (SELECT jsonb_agg(status_count)
          FROM (
            SELECT status, count(*)::int AS count
            FROM song_screening
            GROUP BY status
            ORDER BY status
          ) status_count) AS statuses`,
  )
  return result.rows[0]
}

try {
  const health = await request('/health')
  if (health.status !== 'ok') throw new Error('API health is not ok')

  await ensureImportedSongs()
  const before = await snapshot()
  const created = await request('/api/admin/screening/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending', limit: screeningLimit }),
  })
  const job = await waitForJob(created.id, 180)
  const after = await snapshot()
  const pending = await request('/api/admin/screening/candidates?status=pending&limit=5')

  if (job.successCount < 1) {
    throw new Error(`Screening job did not process any songs: ${JSON.stringify(job)}`)
  }
  if (after.screened_recently < 1) {
    throw new Error(`No recent screening reason was saved: ${JSON.stringify(after)}`)
  }
  if (after.artist_identities < before.artist_identities) {
    throw new Error('Artist identity count unexpectedly decreased')
  }

  console.log(
    JSON.stringify(
      {
        playlistId,
        screeningJob: job.id,
        processed: job.successCount,
        before,
        after,
        pendingSampleCount: pending.items.length,
      },
      null,
      2,
    ),
  )
} finally {
  await pool.end()
}
