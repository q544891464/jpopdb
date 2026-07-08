CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_songs_name_trgm
  ON songs USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_songs_netease_song_id_text_trgm
  ON songs USING gin ((netease_song_id::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_albums_name_trgm
  ON albums USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_artists_name_trgm
  ON artists USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_song_artists_artist_song
  ON song_artists (artist_id, song_id);

CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_playlist
  ON playlist_songs (song_id, playlist_id);
