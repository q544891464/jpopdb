import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { Pool } from 'pg'

type SongRow = {
  song_id: string
  netease_song_id: string
}

type AlbumRow = {
  album_id: string
  netease_album_id: string
}

type NeteaseSongDetail = {
  id: number
  pop?: number | null
  publishTime?: number | null
  al?: { id?: number }
}

function loadEnvironment(): void {
  for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '..', '.env')]) {
    if (existsSync(path)) {
      process.loadEnvFile(path)
      return
    }
  }
}

async function main(): Promise<void> {
  loadEnvironment()
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://jmusic:jmusic@localhost:5432/jmusic',
  })
  const baseUrl = process.env.NETEASE_API_BASE_URL ?? 'http://182.92.153.82:3000'

  try {
    const result = await pool.query<SongRow>(
      `SELECT song.id AS song_id, song.netease_song_id::text
       FROM songs song
       LEFT JOIN albums album ON album.id = song.album_id
       WHERE song.netease_popularity IS NULL
          OR album.publish_time IS NULL
       ORDER BY song.id`,
    )
    let updatedSongs = 0
    let updatedAlbums = 0

    for (let index = 0; index < result.rows.length; index += 200) {
      const rows = result.rows.slice(index, index + 200)
      const url = new URL('/song/detail', baseUrl)
      url.searchParams.set('ids', rows.map((row) => row.netease_song_id).join(','))
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Netease song detail returned HTTP ${response.status}`)
      const payload = await response.json() as { code?: number; songs?: NeteaseSongDetail[] }
      if (payload.code !== 200 || !Array.isArray(payload.songs)) {
        throw new Error('Netease song detail response is invalid')
      }

      for (const song of payload.songs) {
        await pool.query(
          `UPDATE songs
           SET netease_popularity = COALESCE($2, netease_popularity)
           WHERE netease_song_id = $1`,
          [String(song.id), song.pop ?? null],
        )
        updatedSongs += 1
        if (song.al?.id && song.publishTime && song.publishTime > 0) {
          const albumResult = await pool.query(
            `UPDATE albums
             SET publish_time = COALESCE(publish_time, $2), updated_at = NOW()
             WHERE netease_album_id = $1
               AND publish_time IS NULL`,
            [String(song.al.id), new Date(song.publishTime)],
          )
          updatedAlbums += albumResult.rowCount ?? 0
        }
      }
      console.log(`Catalog metadata backfill: ${Math.min(index + rows.length, result.rows.length)}/${result.rows.length}`)
    }
    const missingAlbums = await pool.query<AlbumRow>(
      `SELECT id AS album_id, netease_album_id::text
       FROM albums
       WHERE publish_time IS NULL
         AND netease_album_id IS NOT NULL
       ORDER BY id`,
    )
    for (let index = 0; index < missingAlbums.rows.length; index += 5) {
      const chunk = missingAlbums.rows.slice(index, index + 5)
      await Promise.all(chunk.map(async (row) => {
        const url = new URL('/album', baseUrl)
        url.searchParams.set('id', row.netease_album_id)
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const payload = await response.json() as {
          code?: number
          album?: { publishTime?: number | null }
        }
        const publishTime = payload.album?.publishTime
        if (payload.code === 200 && publishTime && publishTime > 0) {
          const update = await pool.query(
            `UPDATE albums
             SET publish_time = $2, updated_at = NOW()
             WHERE id = $1 AND publish_time IS NULL`,
            [row.album_id, new Date(publishTime)],
          )
          updatedAlbums += update.rowCount ?? 0
        }
      }))
      console.log(`Album date fallback: ${Math.min(index + chunk.length, missingAlbums.rows.length)}/${missingAlbums.rows.length}`)
    }
    console.log(`Catalog metadata backfill complete: ${updatedSongs} songs, ${updatedAlbums} albums updated`)
  } finally {
    await pool.end()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog metadata backfill failed')
  process.exitCode = 1
})
