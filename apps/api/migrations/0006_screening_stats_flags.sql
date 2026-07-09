CREATE TABLE IF NOT EXISTS song_artist_review_flags (
  song_id BIGINT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  has_manual_artist BOOLEAN NOT NULL DEFAULT FALSE,
  needs_artist_review BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION refresh_song_artist_review_flags(p_song_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM song_artist_review_flags
  WHERE song_id = p_song_id;

  INSERT INTO song_artist_review_flags (
    song_id, has_manual_artist, needs_artist_review, updated_at
  )
  SELECT
    song_artist.song_id,
    bool_or(identity.reviewed_at IS NOT NULL),
    bool_or(identity.artist_id IS NULL OR identity.status IN ('unknown', 'pending')),
    NOW()
  FROM song_artists song_artist
  LEFT JOIN artist_identity identity ON identity.artist_id = song_artist.artist_id
  WHERE song_artist.song_id = p_song_id
  GROUP BY song_artist.song_id;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_song_artist_review_flags_for_artist(p_artist_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  affected_song_id BIGINT;
BEGIN
  FOR affected_song_id IN
    SELECT DISTINCT song_id
    FROM song_artists
    WHERE artist_id = p_artist_id
  LOOP
    PERFORM refresh_song_artist_review_flags(affected_song_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trg_song_artists_refresh_review_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_song_artist_review_flags(OLD.song_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_song_artist_review_flags(NEW.song_id);

  IF TG_OP = 'UPDATE' AND OLD.song_id <> NEW.song_id THEN
    PERFORM refresh_song_artist_review_flags(OLD.song_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_artist_identity_refresh_review_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_song_artist_review_flags_for_artist(OLD.artist_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_song_artist_review_flags_for_artist(NEW.artist_id);

  IF TG_OP = 'UPDATE' AND OLD.artist_id <> NEW.artist_id THEN
    PERFORM refresh_song_artist_review_flags_for_artist(OLD.artist_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_song_artists_review_flags ON song_artists;
CREATE TRIGGER trg_song_artists_review_flags
AFTER INSERT OR UPDATE OR DELETE ON song_artists
FOR EACH ROW
EXECUTE FUNCTION trg_song_artists_refresh_review_flags();

DROP TRIGGER IF EXISTS trg_artist_identity_review_flags ON artist_identity;
CREATE TRIGGER trg_artist_identity_review_flags
AFTER INSERT OR UPDATE OR DELETE ON artist_identity
FOR EACH ROW
EXECUTE FUNCTION trg_artist_identity_refresh_review_flags();

TRUNCATE song_artist_review_flags;

INSERT INTO song_artist_review_flags (
  song_id, has_manual_artist, needs_artist_review, updated_at
)
SELECT
  song_artist.song_id,
  bool_or(identity.reviewed_at IS NOT NULL),
  bool_or(identity.artist_id IS NULL OR identity.status IN ('unknown', 'pending')),
  NOW()
FROM song_artists song_artist
LEFT JOIN artist_identity identity ON identity.artist_id = song_artist.artist_id
GROUP BY song_artist.song_id;

CREATE INDEX IF NOT EXISTS idx_song_screening_status_accepted
  ON song_screening (song_id)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_song_screening_status_pending
  ON song_screening (song_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_song_screening_status_rejected
  ON song_screening (song_id)
  WHERE status = 'rejected';

CREATE INDEX IF NOT EXISTS idx_song_screening_reviewed
  ON song_screening (song_id)
  WHERE reviewed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_song_screening_pending_high_score
  ON song_screening (song_id)
  WHERE status = 'pending' AND score >= 50;

CREATE INDEX IF NOT EXISTS idx_song_screening_unscreened_initial
  ON song_screening (song_id)
  WHERE status = 'pending'
    AND score = 0
    AND reviewed_at IS NULL
    AND reason->>'summary' = '已从网易云歌单导入，等待外部 API 初筛。';

CREATE INDEX IF NOT EXISTS idx_song_screening_lyric_fallback
  ON song_screening (song_id)
  WHERE reason->'fallback'->>'passed' = 'true';

CREATE INDEX IF NOT EXISTS idx_song_artist_review_flags_manual
  ON song_artist_review_flags (song_id)
  WHERE has_manual_artist;

CREATE INDEX IF NOT EXISTS idx_song_artist_review_flags_needs_review
  ON song_artist_review_flags (song_id)
  WHERE needs_artist_review;

ANALYZE song_screening;
ANALYZE song_artists;
ANALYZE artist_identity;
ANALYZE song_artist_review_flags;
