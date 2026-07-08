CREATE TABLE songs (
  id BIGSERIAL PRIMARY KEY,
  netease_song_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  alias JSONB,
  album_id BIGINT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  cover_url TEXT,
  netease_url TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE artists (
  id BIGSERIAL PRIMARY KEY,
  netease_artist_id BIGINT UNIQUE,
  name VARCHAR(255) NOT NULL,
  alias JSONB,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE albums (
  id BIGSERIAL PRIMARY KEY,
  netease_album_id BIGINT UNIQUE,
  name VARCHAR(255),
  publish_time TIMESTAMPTZ,
  cover_url TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE songs
  ADD CONSTRAINT fk_songs_album
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL;

CREATE TABLE song_artists (
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE playlists (
  id BIGSERIAL PRIMARY KEY,
  netease_playlist_id BIGINT UNIQUE,
  name VARCHAR(255),
  description TEXT,
  creator_name VARCHAR(255),
  cover_url TEXT,
  source_type VARCHAR(50),
  raw_json JSONB,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE playlist_songs (
  playlist_id BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER CHECK (position IS NULL OR position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE external_matches (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('song', 'artist', 'album')),
  target_id BIGINT NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('netease', 'musicbrainz', 'wikidata', 'lastfm')),
  external_id VARCHAR(255),
  matched_name VARCHAR(255),
  confidence NUMERIC(5, 2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  raw_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE artist_identity (
  id BIGSERIAL PRIMARY KEY,
  artist_id BIGINT NOT NULL UNIQUE REFERENCES artists(id) ON DELETE CASCADE,
  is_japanese BOOLEAN,
  country VARCHAR(20),
  confidence NUMERIC(5, 2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  source_summary JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('confirmed_by_api', 'confirmed_by_manual', 'pending', 'rejected', 'unknown')),
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE song_screening (
  id BIGSERIAL PRIMARY KEY,
  song_id BIGINT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
  is_japanese_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('accepted', 'pending', 'rejected')),
  reason JSONB NOT NULL DEFAULT '{}'::JSONB,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE review_records (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('song', 'artist')),
  target_id BIGINT NOT NULL,
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  reason TEXT,
  reviewer VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'partial_success')),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lyrics_cache (
  id BIGSERIAL PRIMARY KEY,
  song_id BIGINT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
  raw_lrc TEXT,
  translated_lrc TEXT,
  kana_count INTEGER CHECK (kana_count IS NULL OR kana_count >= 0),
  kana_ratio NUMERIC(6, 4) CHECK (kana_ratio IS NULL OR kana_ratio BETWEEN 0 AND 1),
  language_guess VARCHAR(20),
  last_fetch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_external_matches_target ON external_matches(target_type, target_id);
CREATE INDEX idx_external_matches_source ON external_matches(source);
CREATE INDEX idx_external_matches_external_id ON external_matches(external_id);
CREATE INDEX idx_song_screening_status_score ON song_screening(status, score DESC);
CREATE INDEX idx_artist_identity_status ON artist_identity(status);
CREATE INDEX idx_review_records_target ON review_records(target_type, target_id, created_at DESC);
CREATE INDEX idx_sync_jobs_status_created ON sync_jobs(status, created_at DESC);
