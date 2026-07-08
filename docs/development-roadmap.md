# 开发路线图

## Phase 0：项目初始化

目标：

```text
建立项目骨架
配置数据库
配置 Redis
配置 Docker Compose
建立基础文档和 Agent 规则
```

交付物：

```text
README.md
AGENTS.md
docker-compose.yml
backend app
frontend app
database migration
health check API
```

验收标准：

```text
docker compose up 可启动基础服务
GET /health 返回正常
前端可访问
数据库连接正常
```

---

## Phase 1：网易云候选歌曲导入

目标：

```text
输入网易云歌单 ID，导入歌曲、歌手、专辑、歌单来源
```

交付物：

```text
Netease API adapter
playlist import API
songs / artists / albums 保存逻辑
playlist_songs 保存逻辑
sync_jobs
导入页面
```

验收标准：

```text
输入一个歌单 ID 后，本地数据库出现对应歌曲和歌手
导入任务有状态
重复导入不会重复写入
```

---

## Phase 2：MusicBrainz 歌手身份识别

目标：

```text
按歌手名查询 MusicBrainz，判断是否日本歌手
```

交付物：

```text
MusicBrainz adapter
external_matches 保存
artist_identity 保存
歌手身份页面初版
```

验收标准：

```text
Aimer / YOASOBI / 米津玄師 / LiSA 可被识别或进入 pending
结果保存到 artist_identity
原始响应保存到 external_matches
```

---

## Phase 3：Wikidata 补充识别

目标：

```text
通过 MusicBrainz ID 或名称查询 Wikidata，补充国家 / 国籍 / 来源信息
```

交付物：

```text
Wikidata adapter
MusicBrainz → Wikidata 串联查询
artist_identity 证据补充
```

验收标准：

```text
Wikidata 命中的日本歌手可增加置信度
无法判断时不强行 accepted，而是 pending
```

---

## Phase 4：Last.fm 日系标签识别

目标：

```text
通过 Last.fm artist tags / track tags 判断日系候选
```

交付物：

```text
Last.fm adapter
日系标签白名单
负向标签识别
external_matches 保存
```

验收标准：

```text
命中 j-pop / japanese / anime / vocaloid 的歌曲可进入 accepted 或 pending
命中 k-pop / mandopop / c-pop 的歌曲降低分数
```

---

## Phase 5：筛选 Worker

目标：

```text
整合所有证据，生成 score、status、reason
```

交付物：

```text
screening worker
score calculation
reason JSON
手工审核保护逻辑
失败重试
```

验收标准：

```text
歌曲可以自动分为 accepted / pending / rejected
reason 可解释
人工审核结果不会被自动任务覆盖
```

---

## Phase 6：管理后台

目标：

```text
提供可用、美观的审核工作台
```

交付物：

```text
歌单导入页
候选歌曲列表页
待审核页
歌曲详情页
歌手身份页
审核接口
```

验收标准：

```text
管理员可以导入歌单、查看筛选结果、人工确认或排除歌曲、确认歌手身份
```

---

## Phase 7：验证与部署

目标：

```text
稳定运行 MVP
```

交付物：

```text
lint / typecheck / test
smoke test
docker compose 部署
环境变量示例
验证说明
```

验收标准：

```text
本地或服务器可一键启动
关键流程可跑通
文档说明清晰
```

---

## Phase 8：第二阶段扩展

可选方向：

```text
正式标签系统
歌词学习功能
假名 / 罗马音 / 中文释义
JLPT 词汇难度
动漫 OP / ED 关联
Vocaloid P 主识别
City Pop 专题
用户收藏
全文搜索
```
---

## Roadmap addendum: Phase 6.5 Database browse and query pages

This project should include a database-facing browse/search experience after the
admin candidate-review workflow is stable.

### Goal

Provide a read-only J-Music catalog page for accepted and reviewed metadata.
This page is separate from the candidate-review backend:

```text
Admin review backend -> produces trusted accepted records
Database browse/query page -> lets users search and inspect trusted records
```

### Scope

Initial scope:

```text
Search accepted songs by song title, artist name, album name, and Netease ID
Browse artist detail pages
Browse album detail pages
Open a song detail page with metadata and screening evidence summary
Filter by accepted / manually reviewed / evidence source
Show source links such as the Netease song page as outbound links only
```

### Content safety and copyright boundary

The database page must still follow the project boundary:

```text
Do not provide playback
Do not provide audio download
Do not distribute public audio URLs
Do not publish large-scale full lyrics
Do not expose Netease cookies or backend API secrets
```

Lyrics may be used for backend language fallback screening. The query page may
show lyric-derived metadata, for example:

```text
lyric fallback checked: yes / no
kana count
kana ratio
language guess
fallback passed: yes / no
```

It must not show `lyrics_cache.raw_lrc` or `lyrics_cache.translated_lrc` as full
public content.

### Future licensed-content option

If the project later obtains explicit rights or integrates a licensed lyrics /
audio provider, a separate future phase may add:

```text
licensed full-lyrics display
licensed authenticated playback
rights-cleared streaming URLs
provider-specific audit logs
terms and rate-limit enforcement
```

That future module must not use Netease cookies, hidden audio endpoints, or
scraped/publicly redistributed audio URLs as the content source.

### Acceptance criteria

```text
Only accepted or manually reviewed records are publicly queryable by default
Pending and rejected candidates remain admin-only
No full lyrics are rendered from lyrics_cache
No audio URL field is returned by public APIs
Search endpoints are read-only and paginated
The page has loading, empty, error, and detail states
```
