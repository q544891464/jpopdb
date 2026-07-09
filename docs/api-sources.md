# 外部 API 接入说明

## 1. 接入原则

所有外部 API 都必须从后端调用，不能由前端直接调用。

必须实现：

1. timeout
2. retry
3. rate limit 处理
4. normalized result
5. raw response 保存
6. 错误分类
7. 环境变量配置密钥

统一返回结构建议：

```ts
export type ExternalMatchResult = {
  source: 'netease' | 'musicbrainz' | 'wikidata' | 'lastfm'
  externalId?: string
  matchedName?: string
  confidence: number
  raw: unknown
  evidence: Record<string, unknown>
}
```

---

## 2. NeteaseCloudMusicApiEnhanced

用途：

- 候选歌曲来源
- 歌曲详情
- 歌单详情
- 歌词兜底
- 歌手和专辑信息补充

推荐封装方法：

```ts
getPlaylistDetail(playlistId: string): Promise<NeteasePlaylistDetail>
getSongDetail(songIds: string[]): Promise<NeteaseSongDetail[]>
getLyric(songId: string): Promise<NeteaseLyric>
searchSongs(keyword: string): Promise<NeteaseSongSearchResult[]>
searchPlaylists(keyword: string): Promise<NeteasePlaylistSearchResult[]>
getArtistSongs(artistId: string): Promise<NeteaseArtistSongs>
getSongRedCount(songId: string): Promise<number | null>
getSongCommentCount(songId: string): Promise<number | null>
getAlbumDetail(albumId: string): Promise<NeteaseAlbumDetail>
```

Public catalog statistics use:

```text
GET /song/red/count?id={songId}
GET /comment/music?id={songId}&limit=1&offset=0
```

The catalog API caches these values for 24 hours. Catalog list endpoints read
the cached fields only and must not block the page response on live Netease
metadata refresh. Detail pages or explicit backfill jobs may refresh stale
values. A failed optional statistics request does not fail the metadata query.

Public catalog song details may also use these read-only metadata endpoints:

```text
GET /song/detail?ids={songId}
GET /album?id={albumId}
GET /lyric?id={songId}
GET /song/wiki/summary?id={songId}
GET /check/music?id={songId}
```

The public detail API normalizes these into metadata only:

```text
song title variants, disc/track number, MV id, fee/copyright flags
album type, company, tags, description, artist, track count
lyric availability, line counts, kana count/ratio, contributor names
Netease music encyclopedia style/tag groups
quality level metadata such as bitrate and file size
```

When songs are imported from playlist, artist import, or manual song search,
the backend should try to fetch `/song/wiki/summary` and persist normalized
encyclopedia tags into `song_tags` with source `netease_wiki`. A failed wiki
request must not fail the song import.

Do not expose raw lyric text from `/lyric`, translated lyric text, romanized
lyric text, Netease cookies, or any audio URL. Endpoints such as `/song/url`
remain outside the first-phase catalog.

Release dates are read from `/song/detail` first. If a song-detail or
artist-song response omits `publishTime`, the backend falls back to
`GET /album?id={albumId}` and persists the album release date. Existing
databases can be repaired with:

```text
npm run db:catalog-backfill
```

The implemented artist-song adapter uses:

```text
GET /artist/songs?id={artistId}&limit={limit}&offset={offset}&order=hot
```

It requests pages of at most 100 songs, deduplicates by Netease song ID, and
stops at the task safety limit. The response `total` and truncation state are
recorded in the sync job summary so a capped import is visible rather than
silently presented as complete.

配置：

```env
NETEASE_API_BASE_URL=http://netease-api:3000
```

注意：

- 不要把网易云 API 地址暴露给前端。
- 不要在前端保存 cookie。
- 不做音频 URL 获取与公开分发。
- 公开页只能展示歌词可用性与语言统计；歌词全文只用于后台语言兜底判断。

---

## 3. MusicBrainz

用途：

- 判断歌手是否来自日本。
- 匹配标准歌手 ID。
- 为 Wikidata 查询提供 MusicBrainz Artist ID。
- 辅助歌曲 / 专辑 / 发行信息匹配。

推荐封装方法：

```ts
searchArtist(artistName: string): Promise<MusicBrainzArtistCandidate[]>
getArtistByMbid(mbid: string): Promise<MusicBrainzArtist>
searchRecording(songName: string, artistName: string): Promise<MusicBrainzRecordingCandidate[]>
```

匹配建议：

```text
先按 artistName 搜索 artist
再根据 name、sort-name、aliases、area、country 计算置信度
如果候选过多，则进入 pending，不要强行确认
```

判断规则：

```text
artist.area.name == Japan → 日本歌手强证据
artist.country == JP → 日本歌手强证据
begin-area.name == Japan → 日本歌手中证据
```

配置：

```env
MUSICBRAINZ_APP_NAME=jmusic-db
MUSICBRAINZ_CONTACT_EMAIL=your-email@example.com
```

注意：

- MusicBrainz 对 User-Agent 有规范要求，调用时应带上应用名和联系信息。
- 要限制请求频率。
- 要缓存结果。

---

## 4. Wikidata

用途：

- 补充歌手国籍 / 来源国家。
- 通过 MusicBrainz Artist ID 查询 Wikidata 实体。
- 补充作品来源国。
- 后续扩展动画、游戏、声优、作曲人关联。

推荐封装方法：

```ts
findEntityByMusicBrainzArtistId(mbid: string): Promise<WikidataEntity | null>
findEntityByName(name: string): Promise<WikidataEntity[]>
getArtistCountry(entityId: string): Promise<WikidataCountryEvidence>
```

推荐查询思路：

```text
MusicBrainz Artist ID
        ↓
Wikidata P434
        ↓
Wikidata Entity
        ↓
P27 / P495 / P17 等国家相关字段
```

判断规则：

```text
P27 = Japan → 日本歌手强证据
P495 = Japan → 日本来源作品强证据
occupation 包含 singer / musician / band / voice actor 且国家为 Japan → 日本音乐人强证据
```

注意：

- Wikidata 结果需要解析实体 ID，不要只看 label。
- 热门歌手覆盖好，冷门音乐人可能没有。
- 不要将 Wikidata 作为唯一来源。

---

## 5. Last.fm

用途：

- 判断歌曲 / 歌手是否有日系标签。
- 识别 J-Pop、J-Rock、Anime、Vocaloid、City Pop 等候选。

需要 API Key：

```env
LASTFM_API_KEY=your_lastfm_api_key
```

推荐封装方法：

```ts
getArtistTopTags(artistName: string): Promise<LastfmTag[]>
getTrackTopTags(artistName: string, trackName: string): Promise<LastfmTag[]>
checkJapaneseTags(tags: LastfmTag[]): JapaneseTagEvidence
```

推荐日系标签白名单：

```text
japanese
j-pop
jpop
j-rock
jrock
japanese pop
japanese rock
anime
anime song
anisong
vocaloid
city pop
utaite
doujin
game music
soundtrack
```

推荐负向标签：

```text
k-pop
kpop
mandopop
c-pop
cpop
cantopop
korean
chinese
taiwanese pop
```

判断规则：

```text
Last.fm artist tags 命中 japanese / j-pop / j-rock → +70
Last.fm track tags 命中 japanese / j-pop / anime / vocaloid / city pop → +70
Last.fm tags 命中 k-pop / mandopop / c-pop / cantopop → -60
```

注意：

- Last.fm 标签是用户生成的，有噪声。
- 只识别白名单标签。
- 不要让一个弱标签直接决定结果。
- 需要保存原始标签和命中标签。

---

## 6. 外部 API 调用顺序

推荐顺序：

```text
1. 查本地 artist_identity
2. MusicBrainz artist lookup
3. Wikidata lookup
4. Last.fm artist tags
5. Last.fm track tags
6. 网易云歌词兜底
```

原则：

```text
能通过歌手身份判断的，不再重复判断每首歌
能通过强数据源判断的，不再调用弱数据源
只有不确定时才查歌词
```

## 7. 缓存策略

缓存对象：

```text
artist_name → MusicBrainz 查询结果
musicbrainz_mbid → Wikidata 查询结果
artist_name → Last.fm artist tags
artist_name + song_name → Last.fm track tags
song_id → 网易云歌词
```

建议：

```text
歌手身份：长期缓存
歌曲筛选结果：长期缓存
外部 API 原始响应：长期保存
歌词：可缓存，但不建议公开展示
```

## 8. 错误处理

建议错误分类：

```text
network_error
timeout
rate_limited
not_found
ambiguous_match
parse_error
unknown_error
```

处理规则：

```text
网络错误：重试 3 次
429 限流：延迟重试
404 无结果：不重试，标记 no_result
匹配歧义：进入 pending
解析错误：记录日志，进入 pending
```
