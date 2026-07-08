CREATE INDEX IF NOT EXISTS idx_song_screening_public_song_id
  ON song_screening (song_id)
  WHERE status = 'accepted' OR reviewed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_albums_publish_time_id
  ON albums (publish_time DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS idx_songs_album_id_id
  ON songs (album_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_songs_popularity_id
  ON songs (netease_popularity DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS idx_songs_red_count_id
  ON songs (netease_red_count DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS idx_songs_comment_count_id
  ON songs (netease_comment_count DESC NULLS LAST, id DESC);
