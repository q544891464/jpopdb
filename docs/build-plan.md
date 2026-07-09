# 日音数据库应用构建方案：基于外部 API 的日语歌 / 日本歌手初筛系统

## 1. 项目背景

本项目计划基于网易云音乐第三方 API 构建一个“日音数据库应用”，用于整理网易云中的日语歌曲、日本歌手作品、动漫歌曲、Vocaloid、J-Pop、City Pop、日剧 / 动画 / 游戏 OST 等内容。

第一阶段不做复杂标签系统，不做推荐算法，不做在线播放，不做歌词学习解析。第一阶段只解决一个核心问题：

> 如何从大量网易云歌曲中，自动筛选出“高概率日语歌曲”或“高概率日本歌手作品”。

本方案采用“外部 API 初筛 + 网易云数据补充 + 简单人工审核”的方式，降低本地规则复杂度。

---

## 2. 第一阶段目标

第一阶段目标不是构建完整音乐平台，而是完成一个稳定的“日音候选库”。

核心目标如下：

1. 支持从网易云歌单分享链接、关键词搜索、指定歌手导入候选歌曲。
2. 对每首歌曲提取基础信息：歌曲名、歌手、专辑、时长、封面、网易云 ID，并保存网易云百科标签作为歌曲标签。
   导入时尽量同步红心数、评论数、热度和部分发行时间；如果网易云接口限流或超时导致缺失，可通过后台网易云统计同步任务一次补齐所有缺失歌曲。
3. 通过 MusicBrainz、Wikidata、Last.fm 等外部 API 判断歌手是否为日本歌手。
4. 通过 Last.fm 标签、MusicBrainz 信息、Wikidata 信息判断歌曲是否为日系歌曲。
5. 对外部 API 无法判断的歌曲，再用网易云歌词做简单兜底。
6. 将歌曲自动分为：自动通过、待审核、暂不入库。
7. 提供后台审核页面，人工确认低置信度结果。
8. 后台任务需展示歌曲级处理明细，方便确认每次导入或统计同步实际处理了哪些歌曲。
9. 形成可持续扩展的日音候选数据库。

---

## 3. 非目标范围

第一阶段暂不实现以下功能：

1. 不做在线试听。
2. 不缓存或分发音频文件。
3. 不做复杂标签体系。
4. 不做歌词逐句翻译、假名、罗马音、JLPT 解析。
5. 不做 AI 推荐。
6. 不做用户社交。
7. 不做歌单订阅或个性化推荐。
8. 不直接公开网易云 API 服务地址。

---

## 4. 总体设计思路

核心思路是：

```text
网易云 API 负责提供候选歌曲
外部 API 负责判断是否日音
本地数据库负责保存筛选结果
人工后台负责修正低置信度数据
```

整体流程：

```text
网易云歌单 / 搜索 / 歌手导入
        ↓
获取候选歌曲基础信息
        ↓
查询本地歌手身份缓存
        ↓
查询 MusicBrainz
        ↓
查询 Wikidata
        ↓
查询 Last.fm
        ↓
必要时查询网易云歌词
        ↓
计算日音候选分数
        ↓
自动通过 / 待审核 / 暂不入库
        ↓
人工审核修正
        ↓
进入日音候选库
```

---

## 5. 数据来源设计

### 5.1 网易云 API

网易云 API 在本系统中只作为“候选歌曲来源”和“元数据补充来源”。

主要用途：

1. 获取歌单详情。
2. 获取歌曲详情。
3. 获取歌手信息。
4. 获取专辑信息。
5. 获取歌词。
6. 获取网易云百科摘要标签。
7. 根据关键词搜索歌曲、歌单、歌手。

推荐使用方式：

```text
歌单 ID → 歌单详情 → 歌曲 ID 列表
歌曲 ID → 歌曲详情 → 歌名 / 歌手 / 专辑 / 时长
歌曲 ID → 网易云百科摘要 → 曲风 / 语种等标签
歌曲 ID → 歌词 → 语言兜底判断
歌手 ID → 歌手详情 / 热门歌曲 → 辅助判断
```

网易云数据不作为最终判断依据，只作为候选数据来源。

---

### 5.2 MusicBrainz

MusicBrainz 用作第一优先级外部识别源。

主要用途：

1. 匹配歌手身份。
2. 匹配歌曲 Recording。
3. 获取歌手国家 / 地区。
4. 获取专辑发行国家。
5. 获取 MusicBrainz ID，作为跨平台匹配主键。

匹配输入：

```text
artist_name
song_name
album_name
duration
```

优先查询歌手：

```text
歌手名 → MusicBrainz Artist Search → 匹配候选歌手 → 判断 area / country
```

如果歌手匹配成功，并且地区为 Japan，则直接认为该歌手为日本歌手。

---

### 5.3 Wikidata

Wikidata 用作第二优先级补充识别源。

主要用途：

1. 补充歌手国籍。
2. 补充歌手是否日本人 / 日本乐队 / 日本组合。
3. 通过 MusicBrainz Artist ID 反查 Wikidata 条目。
4. 判断作品来源国。
5. 后续可扩展动画、游戏、电影、声优等关联信息。

使用方式：

```text
MusicBrainz Artist ID
        ↓
Wikidata 查询对应条目
        ↓
判断 country of citizenship / country of origin / occupation 等字段
        ↓
如果国家或来源为 Japan，则增加日本歌手置信度
```

Wikidata 覆盖热门歌手较好，但对冷门歌手、同人音乐人、Vocaloid P 主覆盖不一定完整，所以不作为唯一依据。

---

### 5.4 Last.fm

Last.fm 用作日系风格初筛源。

主要用途：

1. 获取歌曲热门标签。
2. 获取歌手热门标签。
3. 判断是否存在 `japanese`、`j-pop`、`anime`、`vocaloid`、`city pop` 等日系标签。
4. 对 MusicBrainz 无法判断的歌曲提供辅助判断。

推荐判断标签：

```text
japanese
j-pop
j-rock
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

如果 Last.fm 歌曲标签或歌手标签命中上述关键词，则该歌曲进入日音候选。

---

## 6. 筛选分类定义

系统最终不直接给出“绝对正确”的判断，而是把歌曲分成三类。

### 6.1 自动通过

满足以下任意条件即可自动通过：

```text
MusicBrainz 判断歌手地区为 Japan
Wikidata 判断歌手国籍 / 来源为 Japan
Last.fm 歌手标签命中 japanese / j-pop / j-rock
Last.fm 歌曲标签命中 japanese / j-pop / anime / vocaloid / city pop
外部 API 不命中，但歌词明显包含大量日文假名
```

状态：

```text
accepted
```

### 6.2 待审核

满足以下条件之一，进入待审核：

```text
外部 API 有命中，但置信度不高
歌手名存在多个同名候选
Last.fm 只命中弱标签
网易云歌单名包含日语相关关键词，但外部 API 无结果
歌名含日文字符，但歌手身份未知
无歌词，且外部 API 结果不完整
```

状态：

```text
pending
```

### 6.3 暂不入库

满足以下条件之一，暂不入库：

```text
MusicBrainz / Wikidata 明确为非日本歌手
Last.fm 明确命中 k-pop / c-pop / mandopop / cantopop 等非日系标签
无日系标签命中
无日文标题
无歌词或歌词非日语
歌手身份未知且来源歌单不可靠
```

状态：

```text
rejected
```

注意：`rejected` 不代表永久删除，只是暂不进入日音候选库，后续可以重新审核。

---

## 7. 第一阶段交付物

第一阶段完成后，应具备以下能力：

```text
1. 可以导入网易云歌单
2. 可以批量保存歌曲、歌手、专辑
3. 可以调用 MusicBrainz 判断歌手国家
4. 可以调用 Wikidata 补充歌手身份
5. 可以调用 Last.fm 判断日系标签
6. 可以对歌曲生成筛选分数
7. 可以把歌曲分成 accepted / pending / rejected
8. 可以在后台人工审核
9. 可以沉淀日本歌手身份缓存
10. 可以持续扩展日音候选库
```

---

## 8. 最终结论

第一阶段不要做成复杂的“日语识别系统”，而应该做成“外部 API 辅助的日音候选筛选系统”。

最小可行逻辑是：

```text
日本歌手作品 → 收
Last.fm 明确 J-Pop / Japanese / Anime / Vocaloid → 收
MusicBrainz / Wikidata 明确日本来源 → 收
外部 API 查不到，但歌词明显日语 → 收
其他 → 待审核或暂不收
```

这样可以显著降低开发复杂度，同时保证第一批日音数据库的质量。

---

## Confirmed artist song import

Confirmed Japanese artists can be used as a high-confidence candidate source:

```text
confirm Japanese artist
        -> enqueue artist_song_import
        -> page through Netease artist songs
        -> upsert songs / albums / artists
        -> create accepted screening only for newly discovered songs
```

Admin endpoints:

```text
POST /api/admin/import/artist/:artistId
POST /api/admin/import/artists/confirmed
```

Safety and quality rules:

1. Only `confirmed_by_api` or `confirmed_by_manual` artists with
   `is_japanese = true` and a Netease artist ID can be imported.
2. Imports are idempotent by Netease song ID.
3. Existing screening rows and manual review decisions are never overwritten.
4. A single artist import is capped at 2,000 songs; the admin UI defaults to 500.
5. A bulk request queues at most 50 artists; the admin UI defaults to 10 and
   prioritizes artists that have never had an artist-song import job.
6. The cap is required because Netease artist results include collaborations;
   some virtual singers expose tens of thousands of associated tracks.
---

## Build-plan addendum: searchable database pages

After the candidate import, screening, and manual review workflow becomes stable,
the product plan includes a database browse/search surface.

This is a separate surface from the admin review backend:

```text
Admin backend: import, screen, review, correct data
Database pages: search and browse trusted accepted metadata
```

### Planned pages

```text
Song search page
Song detail page
Artist search page
Artist detail page
Album detail page
Evidence summary panel
```

### Data exposure policy

The first implementation should expose only reviewed or accepted metadata by
default. Candidate records with `pending` or `rejected` status remain admin-only
unless an administrator explicitly opens them inside the review backend.

The page may display:

```text
song title
artist names
album name
duration
cover image URL if already stored as metadata
Netease song page link
screening score/status
human review status
lyric fallback summary such as kana count and kana ratio
```

The page must not display:

```text
full lyrics from lyrics_cache
raw_lrc
translated_lrc
playback widgets
audio download links
public or authenticated Netease audio URLs
backend secrets or cookies
```

### Licensed future expansion

Full-lyrics display and authenticated audio playback are not part of the current
Netease-based metadata project. They may be reconsidered only as a separate
licensed-content phase, using a rights-cleared lyrics/audio provider and explicit
authorization. Such a future phase must not redistribute Netease audio URLs or
scraped lyrics.
