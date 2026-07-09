CREATE TABLE IF NOT EXISTS song_tags (
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  tag_group VARCHAR(100) NOT NULL DEFAULT '',
  tag_name VARCHAR(255) NOT NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (song_id, source, tag_group, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_song_tags_tag_name
  ON song_tags(tag_name);

CREATE INDEX IF NOT EXISTS idx_song_tags_song_source
  ON song_tags(song_id, source);

CREATE INDEX IF NOT EXISTS idx_song_screening_unscreened_initial_v2
  ON song_screening (song_id)
  WHERE status = 'pending'
    AND score = 0
    AND reviewed_at IS NULL
    AND reason->>'summary' IN (
      '已从网易云歌单导入，等待外部 API 初筛。',
      '手动添加网易云单曲，等待外部 API 初筛。'
    );
