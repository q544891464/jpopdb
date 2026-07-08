ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS netease_popularity INTEGER,
  ADD COLUMN IF NOT EXISTS netease_red_count BIGINT,
  ADD COLUMN IF NOT EXISTS netease_comment_count BIGINT,
  ADD COLUMN IF NOT EXISTS netease_stats_updated_at TIMESTAMPTZ;

UPDATE songs
SET netease_popularity = (raw_json->>'pop')::integer
WHERE netease_popularity IS NULL
  AND raw_json->>'pop' ~ '^[0-9]+$';
