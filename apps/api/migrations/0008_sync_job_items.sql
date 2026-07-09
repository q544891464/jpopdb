CREATE TABLE IF NOT EXISTS sync_job_items (
  id BIGSERIAL PRIMARY KEY,
  sync_job_id BIGINT NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL DEFAULT 'song',
  target_id BIGINT,
  netease_song_id BIGINT,
  name VARCHAR(255) NOT NULL,
  artist_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  message TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_job_items_job_created
  ON sync_job_items(sync_job_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_sync_job_items_song
  ON sync_job_items(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_sync_job_items_netease_song
  ON sync_job_items(netease_song_id);
