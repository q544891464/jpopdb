# 数据库设计

数据库推荐使用 PostgreSQL。

## 1. songs 歌曲表

```sql
CREATE TABLE songs (
  id BIGSERIAL PRIMARY KEY,
  netease_song_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  alias JSONB,
  album_id BIGINT,
  duration_ms INTEGER,
  cover_url TEXT,
  netease_url TEXT,
  netease_popularity INTEGER,
  netease_red_count BIGINT,
  netease_comment_count BIGINT,
  netease_stats_updated_at TIMESTAMPTZ,
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 2. artists 歌手表

```sql
CREATE TABLE artists (
  id BIGSERIAL PRIMARY KEY,
  netease_artist_id BIGINT UNIQUE,
  name VARCHAR(255) NOT NULL,
  alias JSONB,
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 3. albums 专辑表

```sql
CREATE TABLE albums (
  id BIGSERIAL PRIMARY KEY,
  netease_album_id BIGINT UNIQUE,
  name VARCHAR(255),
  publish_time TIMESTAMP,
  cover_url TEXT,
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 4. song_artists 歌曲歌手关系表

```sql
CREATE TABLE song_artists (
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'main',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (song_id, artist_id)
);
```

## 5. playlists 歌单来源表

```sql
CREATE TABLE playlists (
  id BIGSERIAL PRIMARY KEY,
  netease_playlist_id BIGINT UNIQUE,
  name VARCHAR(255),
  description TEXT,
  creator_name VARCHAR(255),
  cover_url TEXT,
  source_type VARCHAR(50),
  raw_json JSONB,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 6. playlist_songs 歌单歌曲关系表

```sql
CREATE TABLE playlist_songs (
  playlist_id BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (playlist_id, song_id)
);
```

## 7. external_matches 外部 API 匹配表

用于保存 MusicBrainz、Wikidata、Last.fm 等外部匹配结果。

```sql
CREATE TABLE external_matches (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL,
  target_id BIGINT NOT NULL,
  source VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  matched_name VARCHAR(255),
  confidence NUMERIC(5,2),
  raw_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

字段说明：

```text
target_type：song / artist / album
target_id：本地目标 ID
source：musicbrainz / wikidata / lastfm / netease
external_id：外部平台 ID
confidence：匹配置信度
raw_json：保存原始响应，方便后续排查
```

建议索引：

```sql
CREATE INDEX idx_external_matches_target ON external_matches(target_type, target_id);
CREATE INDEX idx_external_matches_source ON external_matches(source);
CREATE INDEX idx_external_matches_external_id ON external_matches(external_id);
```

## 8. artist_identity 歌手身份表

```sql
CREATE TABLE artist_identity (
  id BIGSERIAL PRIMARY KEY,
  artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  is_japanese BOOLEAN,
  country VARCHAR(20),
  confidence NUMERIC(5,2),
  source_summary JSONB,
  status VARCHAR(30) DEFAULT 'unknown',
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

状态：

```text
confirmed_by_api
confirmed_by_manual
pending
rejected
unknown
```

建议约束：

```sql
CREATE UNIQUE INDEX uniq_artist_identity_artist_id ON artist_identity(artist_id);
```

## 9. song_screening 歌曲初筛表

```sql
CREATE TABLE song_screening (
  id BIGSERIAL PRIMARY KEY,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  is_japanese_candidate BOOLEAN DEFAULT FALSE,
  score NUMERIC(5,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'pending',
  reason JSONB,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

状态：

```text
accepted
pending
rejected
```

建议约束：

```sql
CREATE UNIQUE INDEX uniq_song_screening_song_id ON song_screening(song_id);
CREATE INDEX idx_song_screening_status ON song_screening(status);
CREATE INDEX idx_song_screening_score ON song_screening(score);
```

## 10. review_records 审核记录表

```sql
CREATE TABLE review_records (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(20),
  target_id BIGINT,
  old_status VARCHAR(30),
  new_status VARCHAR(30),
  reason TEXT,
  reviewer VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 11. sync_jobs 同步任务表

```sql
CREATE TABLE sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255),
  status VARCHAR(30) DEFAULT 'pending',
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

状态：

```text
pending
running
success
failed
partial_success
```

## 12. lyrics_cache 可选歌词缓存表

第一阶段歌词只用于后端筛选兜底，不做公开展示。

```sql
CREATE TABLE lyrics_cache (
  id BIGSERIAL PRIMARY KEY,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  raw_lrc TEXT,
  translated_lrc TEXT,
  kana_count INTEGER,
  kana_ratio NUMERIC(6,4),
  language_guess VARCHAR(20),
  last_fetch_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

建议：

- 不在前台大规模展示歌词。
- 可以只保存语言检测统计，不保存完整歌词。
- 如果保存歌词，只用于后台筛选和排查。

## 13. 最小索引建议

```sql
CREATE INDEX idx_songs_netease_song_id ON songs(netease_song_id);
CREATE INDEX idx_artists_netease_artist_id ON artists(netease_artist_id);
CREATE INDEX idx_albums_netease_album_id ON albums(netease_album_id);
CREATE INDEX idx_playlists_netease_playlist_id ON playlists(netease_playlist_id);
CREATE INDEX idx_song_screening_status_score ON song_screening(status, score DESC);
CREATE INDEX idx_artist_identity_status ON artist_identity(status);
```

## 14. 手工审核优先原则

在代码层必须实现：

```text
如果 song_screening.reviewed_at 不为空，则自动筛选任务不得覆盖 status。
如果 artist_identity.reviewed_at 不为空，则自动歌手识别任务不得覆盖 status。
```

可以允许自动任务更新 `reason` 中的建议字段，但不能直接改变人工状态。
