import type { Pool, PoolClient } from 'pg'

import type { NeteasePlaylist, NeteaseSong, NeteaseWikiTag } from '../netease/netease.types'

export class PlaylistImportRepository {
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

  async upsertPlaylist(playlist: NeteasePlaylist, raw: unknown): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO playlists (
         netease_playlist_id, name, description, creator_name, cover_url,
         source_type, raw_json, last_sync_at
       ) VALUES ($1, $2, $3, $4, $5, 'playlist', $6::jsonb, NOW())
       ON CONFLICT (netease_playlist_id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         creator_name = EXCLUDED.creator_name,
         cover_url = EXCLUDED.cover_url,
         source_type = EXCLUDED.source_type,
         raw_json = EXCLUDED.raw_json,
         last_sync_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        String(playlist.id),
        playlist.name,
        playlist.description ?? null,
        playlist.creator?.nickname ?? null,
        playlist.coverImgUrl ?? null,
        JSON.stringify(raw),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to persist playlist')
    }
    return row.id
  }

  async persistSong(
    playlistId: string,
    song: NeteaseSong,
    position: number,
    wikiTags?: NeteaseWikiTag[],
  ): Promise<void> {
    await this.persistSongRecord(song, { playlistId, position, wikiTags })
  }

  async persistArtistSong(
    song: NeteaseSong,
    confirmedArtistName: string,
    wikiTags?: NeteaseWikiTag[],
  ): Promise<void> {
    await this.persistSongRecord(song, { confirmedArtistName, wikiTags })
  }

  private async persistSongRecord(
    song: NeteaseSong,
    source: {
      playlistId?: string
      position?: number
      confirmedArtistName?: string
      wikiTags?: NeteaseWikiTag[]
    },
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const albumId = await this.upsertAlbum(client, song)
      const songId = await this.upsertSong(client, song, albumId)

      await client.query('DELETE FROM song_artists WHERE song_id = $1', [songId])
      for (const artist of song.ar) {
        const artistId = await this.upsertArtist(client, artist)
        await client.query(
          `INSERT INTO song_artists (song_id, artist_id, role)
           VALUES ($1, $2, 'main')
           ON CONFLICT (song_id, artist_id) DO UPDATE SET role = EXCLUDED.role`,
          [songId, artistId],
        )
      }

      if (source.playlistId) {
        await client.query(
          `INSERT INTO playlist_songs (playlist_id, song_id, position)
           VALUES ($1, $2, $3)
           ON CONFLICT (playlist_id, song_id) DO UPDATE SET position = EXCLUDED.position`,
          [source.playlistId, songId, source.position ?? 0],
        )
      }
      const fromConfirmedArtist = Boolean(source.confirmedArtistName)
      await client.query(
        `INSERT INTO song_screening (
           song_id, is_japanese_candidate, score, status, reason
         ) VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (song_id) DO NOTHING`,
        [
          songId,
          fromConfirmedArtist,
          fromConfirmedArtist ? 100 : 0,
          fromConfirmedArtist ? 'accepted' : 'pending',
          JSON.stringify({
            score: fromConfirmedArtist ? 100 : 0,
            status: fromConfirmedArtist ? 'accepted' : 'pending',
            positive: fromConfirmedArtist
              ? [{
                  source: 'manual_artist_identity',
                  type: 'confirmed_japanese_artist',
                  value: source.confirmedArtistName,
                  score: 100,
                }]
              : [],
            negative: [],
            fallback: { lyric_checked: false },
            summary: fromConfirmedArtist
              ? `已从确认日本艺人 ${source.confirmedArtistName} 的网易云歌曲列表自动导入。`
              : '已从网易云歌单导入，等待外部 API 初筛。',
          }),
        ],
      )
      await client.query(
        `INSERT INTO external_matches (
           target_type, target_id, source, external_id, matched_name, confidence, raw_json
         ) VALUES ('song', $1, 'netease', $2, $3, 100, $4::jsonb)
         ON CONFLICT (target_type, target_id, source) DO UPDATE SET
           external_id = EXCLUDED.external_id,
           matched_name = EXCLUDED.matched_name,
           confidence = EXCLUDED.confidence,
           raw_json = EXCLUDED.raw_json,
           created_at = NOW()`,
        [songId, String(song.id), song.name, JSON.stringify(song)],
      )
      if (source.wikiTags !== undefined) {
        await this.replaceSongTags(client, songId, source.wikiTags)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async prunePlaylistSongs(playlistId: string, currentNeteaseSongIds: string[]): Promise<void> {
    await this.pool.query(
      `DELETE FROM playlist_songs playlist_link
       USING songs song
       WHERE playlist_link.playlist_id = $1
         AND playlist_link.song_id = song.id
         AND NOT (song.netease_song_id = ANY($2::bigint[]))`,
      [playlistId, currentNeteaseSongIds],
    )
  }

  private async upsertAlbum(client: PoolClient, song: NeteaseSong): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO albums (
         netease_album_id, name, publish_time, cover_url, raw_json
       ) VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (netease_album_id) DO UPDATE SET
         name = EXCLUDED.name,
         publish_time = COALESCE(EXCLUDED.publish_time, albums.publish_time),
         cover_url = EXCLUDED.cover_url,
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id`,
      [
        String(song.al.id),
        song.al.name,
        song.publishTime ? new Date(song.publishTime) : null,
        song.al.picUrl ?? null,
        JSON.stringify(song.al),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to persist album')
    }
    return row.id
  }

  private async upsertSong(client: PoolClient, song: NeteaseSong, albumId: string): Promise<string> {
    const aliases = this.collectAliases(song.alia, song.tns)
    const result = await client.query<{ id: string }>(
      `INSERT INTO songs (
         netease_song_id, name, alias, album_id, duration_ms, cover_url, netease_url,
         netease_popularity, raw_json
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (netease_song_id) DO UPDATE SET
         name = EXCLUDED.name,
         alias = EXCLUDED.alias,
         album_id = EXCLUDED.album_id,
         duration_ms = EXCLUDED.duration_ms,
         cover_url = EXCLUDED.cover_url,
         netease_url = EXCLUDED.netease_url,
         netease_popularity = COALESCE(EXCLUDED.netease_popularity, songs.netease_popularity),
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id`,
      [
        String(song.id),
        song.name,
        JSON.stringify(aliases),
        albumId,
        song.dt ?? null,
        song.al.picUrl ?? null,
        `https://music.163.com/#/song?id=${song.id}`,
        song.pop ?? null,
        JSON.stringify(song),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to persist song')
    }
    return row.id
  }

  private async upsertArtist(client: PoolClient, artist: NeteaseSong['ar'][number]): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO artists (netease_artist_id, name, alias, raw_json)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (netease_artist_id) DO UPDATE SET
         name = EXCLUDED.name,
         alias = EXCLUDED.alias,
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()
       RETURNING id`,
      [
        String(artist.id),
        artist.name,
        JSON.stringify(this.collectAliases(artist.alias, artist.tns)),
        JSON.stringify(artist),
      ],
    )
    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to persist artist')
    }
    return row.id
  }

  private async replaceSongTags(
    client: PoolClient,
    songId: string,
    wikiTags: NeteaseWikiTag[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM song_tags
       WHERE song_id = $1 AND source = 'netease_wiki'`,
      [songId],
    )
    for (const tag of this.uniqueWikiTags(wikiTags)) {
      await client.query(
        `INSERT INTO song_tags (
           song_id, source, tag_group, tag_name, raw_json
         ) VALUES ($1, 'netease_wiki', $2, $3, $4::jsonb)
         ON CONFLICT (song_id, source, tag_group, tag_name) DO UPDATE SET
           raw_json = EXCLUDED.raw_json,
           updated_at = NOW()`,
        [songId, tag.group, tag.value, JSON.stringify(tag.raw ?? {})],
      )
    }
  }

  private uniqueWikiTags(tags: NeteaseWikiTag[]): NeteaseWikiTag[] {
    const result = new Map<string, NeteaseWikiTag>()
    for (const tag of tags) {
      const group = tag.group.trim().slice(0, 100)
      const value = tag.value.trim().slice(0, 255)
      if (!group || !value) continue
      result.set(`${group}\u0000${value}`, { ...tag, group, value })
    }
    return [...result.values()]
  }

  private collectAliases(...values: unknown[]): string[] {
    const aliases: string[] = []
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        aliases.push(value.trim())
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.trim()) {
            aliases.push(item.trim())
          }
        }
      }
    }
    return [...new Set(aliases)]
  }
}
