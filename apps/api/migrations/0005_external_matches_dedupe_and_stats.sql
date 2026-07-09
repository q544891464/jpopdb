WITH ranked_matches AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY target_type, target_id, source
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
  FROM external_matches
)
DELETE FROM external_matches match
USING ranked_matches ranked
WHERE match.id = ranked.id
  AND ranked.duplicate_rank > 1;

ALTER TABLE external_matches
  ADD CONSTRAINT uq_external_matches_target_source
  UNIQUE (target_type, target_id, source);

CREATE INDEX IF NOT EXISTS idx_artist_identity_reviewed_artist
  ON artist_identity (artist_id)
  WHERE reviewed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artist_identity_pending_artist
  ON artist_identity (artist_id)
  WHERE status IN ('unknown', 'pending');
