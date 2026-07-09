# 系统架构设计

## 1. 总体架构

```text
Browser Admin UI
        ↓
Backend API
        ↓
PostgreSQL
        ↓
Redis / BullMQ
        ↓
Worker
        ↓
External APIs
```

外部 API 包括：

```text
NeteaseCloudMusicApiEnhanced
MusicBrainz
Wikidata
Last.fm
```

## 2. 服务划分

### 2.1 Frontend

职责：

- 歌单导入
- 候选歌曲列表
- 待审核页面
- 歌曲详情
- 歌手身份管理
- 同步任务状态查看

推荐技术：

```text
Vue 3 + Vite + TypeScript + Element Plus / Naive UI
```

### 2.2 Backend API

职责：

- 提供管理后台 API
- 统一外部 API 调用入口
- 保存歌曲、歌手、专辑、筛选结果
- 创建队列任务
- 提供审核接口

推荐技术：

```text
NestJS + TypeScript
```

### 2.3 Worker

职责：

- 执行歌单导入任务
- 执行歌曲筛选任务
- 调用外部 API
- 重试失败任务
- 更新筛选结果

推荐技术：

```text
BullMQ + Redis
```

### 2.4 Database

职责：

- 保存核心音乐元数据
- 保存外部 API 原始匹配结果
- 保存筛选结果
- 保存人工审核结果

推荐技术：

```text
PostgreSQL
```

原因：

- 关系数据清晰
- 支持 JSONB
- 后续扩展全文搜索方便
- 适合保存 external_matches.raw_json 和 song_screening.reason

## 3. 推荐目录结构

```text
jmusic-db/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── netease/
│   │   │   │   ├── musicbrainz/
│   │   │   │   ├── wikidata/
│   │   │   │   ├── lastfm/
│   │   │   │   ├── songs/
│   │   │   │   ├── artists/
│   │   │   │   ├── playlists/
│   │   │   │   ├── screening/
│   │   │   │   ├── review/
│   │   │   │   └── jobs/
│   │   │   └── main.ts
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── api/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── router/
│       │   └── main.ts
│       └── package.json
├── packages/
│   └── shared/
├── docs/
├── .agents/
│   └── skills/
├── docker-compose.yml
└── AGENTS.md
```

如果不做 monorepo，也可以简化为：

```text
backend/
frontend/
docs/
```

## 4. 后端模块划分

### 4.1 NeteaseModule

功能：

```text
getPlaylistDetail(playlistId)
getSongDetail(songIds)
getLyric(songId)
searchSongs(keyword)
searchPlaylists(keyword)
getArtistSongs(artistId)
```

### 4.2 MusicBrainzModule

功能：

```text
searchArtist(artistName)
searchRecording(songName, artistName)
getArtistByMbid(mbid)
matchArtistCountry(artistName)
```

### 4.3 WikidataModule

功能：

```text
findEntityByMusicBrainzArtistId(mbid)
findEntityByName(name)
getArtistCountry(entityId)
getWorkCountry(entityId)
```

### 4.4 LastfmModule

功能：

```text
getArtistTopTags(artistName)
getTrackTopTags(artistName, trackName)
checkJapaneseTags(tags)
```

### 4.5 ScreeningModule

功能：

```text
screenSong(songId)
screenArtist(artistId)
calculateScore(evidence)
generateReason(evidence)
updateScreeningStatus(songId)
```

### 4.6 ReviewModule

功能：

```text
approveSong(songId)
rejectSong(songId)
markPending(songId)
approveArtist(artistId)
rejectArtist(artistId)
recordReviewLog()
```

## 5. 数据流

### 5.1 歌单导入数据流

```text
输入歌单 ID 或网易云分享链接
        ↓
NeteaseModule.getPlaylistDetail
        ↓
保存 playlists
        ↓
保存 songs / artists / albums
        ↓
尝试读取并保存网易云百科标签
        ↓
保存 playlist_songs
        ↓
创建 screening jobs
```

### 5.2 歌曲筛选数据流

```text
读取 song + artists
        ↓
检查 artist_identity
        ↓
MusicBrainz lookup
        ↓
Wikidata lookup
        ↓
Last.fm lookup
        ↓
歌词兜底
        ↓
计算 score
        ↓
写入 song_screening
```

### 5.3 人工审核数据流

```text
后台点击确认 / 排除
        ↓
Review API
        ↓
更新 song_screening 或 artist_identity
        ↓
写入 review_records
        ↓
返回最新状态
```

## 6. Docker Compose 服务

推荐服务：

```text
api
worker
web
postgres
redis
netease-api
```

可以先只启动：

```text
api
worker
web
postgres
redis
```

网易云 API 可单独部署或作为 compose 服务部署。

## 7. 环境变量

```env
DATABASE_URL=postgres://jmusic:jmusic@postgres:5432/jmusic
REDIS_URL=redis://redis:6379
NETEASE_API_BASE_URL=http://netease-api:3000
LASTFM_API_KEY=your_lastfm_api_key
MUSICBRAINZ_APP_NAME=jmusic-db
MUSICBRAINZ_CONTACT_EMAIL=your-email@example.com
```

不要将这些变量提交到仓库。

## 8. 关键约束

1. 前端不能直接访问外部 API。
2. 外部 API 原始结果要保存到 `external_matches`。
3. 筛选判断原因要保存到 `song_screening.reason`。
4. 手工审核结果优先级最高。
5. 自动任务不能覆盖手工审核状态。
6. 不实现在线播放和下载。
---

## Architecture addendum: catalog browse/query surface

The system should eventually expose a read-only catalog surface in addition to
the admin review backend.

```text
Browser catalog UI
        -> Public/read-only catalog API
        -> PostgreSQL accepted/reviewed metadata
```

The catalog API must be separate from admin mutation APIs. It should only expose
paginated, read-only endpoints such as:

```text
GET /api/catalog/songs
GET /api/catalog/songs/:songId
GET /api/catalog/artists
GET /api/catalog/artists/:artistId
GET /api/catalog/albums/:albumId
```

Default query scope:

```text
song_screening.status = 'accepted'
OR song_screening.reviewed_at IS NOT NULL
```

Admin-only candidate data remains behind `/api/admin/*`.

### Catalog response boundary

Catalog responses may include metadata and evidence summaries:

```text
song id
Netease song id
song title
artist names
album name
duration
cover metadata
screening status and score
review summary
lyric fallback summary
outbound source page links
```

Catalog responses must not include:

```text
lyrics_cache.raw_lrc
lyrics_cache.translated_lrc
audio URLs
Netease cookies
Last.fm API keys
MusicBrainz contact identity
external_matches.raw_json by default
```

If a future licensed-content provider is added, full lyrics or streaming URLs
must live in a separate provider-specific module with explicit rights,
authentication, rate limiting, and audit logs. The Netease metadata adapter must
not become an audio URL distribution path.
