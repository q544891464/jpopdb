import { Pool } from 'pg'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'
const playlistId = process.env.TEST_PLAYLIST_ID ?? '60198'
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://jmusic:jmusic@127.0.0.1:5432/jmusic'
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

async function importPlaylist() {
  const created = await request('/api/admin/import/playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId }),
  })

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const job = await request(`/api/admin/jobs/${created.id}`)
    if (['success', 'failed', 'partial_success'].includes(job.status)) {
      if (job.status !== 'success') {
        throw new Error(`Import ${job.id} ended with ${job.status}: ${job.errorMessage ?? ''}`)
      }
      return job
    }
  }
  throw new Error(`Import job ${created.id} did not finish within 60 seconds`)
}

async function snapshot() {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM playlists WHERE netease_playlist_id = $1) AS playlists,
       (SELECT count(*)::int
          FROM playlist_songs playlist_link
          JOIN playlists playlist ON playlist.id = playlist_link.playlist_id
         WHERE playlist.netease_playlist_id = $1) AS playlist_songs,
       (SELECT count(*)::int
          FROM song_screening screening
          JOIN playlist_songs playlist_link ON playlist_link.song_id = screening.song_id
          JOIN playlists playlist ON playlist.id = playlist_link.playlist_id
         WHERE playlist.netease_playlist_id = $1) AS screenings,
       (SELECT count(*)::int
          FROM external_matches match
          JOIN playlist_songs playlist_link ON playlist_link.song_id = match.target_id
          JOIN playlists playlist ON playlist.id = playlist_link.playlist_id
         WHERE playlist.netease_playlist_id = $1
           AND match.target_type = 'song'
           AND match.source = 'netease') AS netease_matches`,
    [playlistId],
  )
  return result.rows[0]
}

try {
  const health = await request('/health')
  if (health.status !== 'ok') throw new Error('API health is not ok')

  const firstJob = await importPlaylist()
  const firstSnapshot = await snapshot()
  const secondJob = await importPlaylist()
  const secondSnapshot = await snapshot()

  if (JSON.stringify(firstSnapshot) !== JSON.stringify(secondSnapshot)) {
    throw new Error(
      `Idempotency failed: ${JSON.stringify(firstSnapshot)} -> ${JSON.stringify(secondSnapshot)}`,
    )
  }
  if (
    firstSnapshot.playlists !== 1 ||
    firstSnapshot.playlist_songs !== firstJob.totalCount ||
    firstSnapshot.screenings !== firstJob.totalCount ||
    firstSnapshot.netease_matches !== firstJob.totalCount
  ) {
    throw new Error(`Persistence counts are incomplete: ${JSON.stringify(firstSnapshot)}`)
  }

  console.log(
    JSON.stringify(
      {
        playlistId,
        firstJob: firstJob.id,
        secondJob: secondJob.id,
        imported: firstJob.successCount,
        idempotent: true,
        persisted: firstSnapshot,
      },
      null,
      2,
    ),
  )
} finally {
  await pool.end()
}
