# Agent 工作提示词合集

本文件提供可直接复制给 Codex / Claude Code / 其他 coding agent 的提示词。

建议每次只执行一个阶段，不要一次让 Agent 完成整个项目。

---

## 0. 总启动提示词

```text
请先阅读 README.md、AGENTS.md、docs/build-plan.md、docs/architecture.md、docs/db-schema.md、docs/api-sources.md、docs/screening-rules.md、docs/frontend-ui-guidelines.md。

本项目是一个日音数据库 Web 应用。第一阶段只做网易云候选歌曲导入、外部 API 初筛、后台人工审核。禁止实现在线播放、音频下载、公开音频 URL 分发、大规模公开歌词展示、复杂推荐系统。

请先检查当前项目结构，然后给出实现计划。不要马上大规模改代码。每次只实现一个完整功能切片。
```

---

## 1. 初始化项目骨架

```text
请按照 AGENTS.md 和 docs/architecture.md 初始化项目骨架。

要求：
1. 后端使用 Node.js + NestJS + TypeScript。
2. 前端使用 Vue 3 + Vite + TypeScript。
3. 数据库使用 PostgreSQL。
4. 队列 / 缓存使用 Redis + BullMQ。
5. 添加 docker-compose.yml，包含 api、worker、web、postgres、redis。
6. 添加基础健康检查接口 GET /health。
7. 添加 .env.example。
8. 不要实现在线播放、音频下载、歌词展示。
9. 完成后运行基础验证，并说明启动命令。

请先检查目录，如果已有项目结构，请在现有结构上增量修改，不要重建。
```

---

## 2. 实现数据库表结构

```text
请根据 docs/db-schema.md 实现第一阶段数据库表结构。

要求：
1. 创建 songs、artists、albums、song_artists、playlists、playlist_songs、external_matches、artist_identity、song_screening、review_records、sync_jobs。
2. 如果项目使用 ORM，请创建对应实体和 migration。
3. 如果项目使用 SQL migration，请生成 migration 文件。
4. 添加必要索引。
5. 确保 song_screening 和 artist_identity 支持人工审核优先。
6. 不要新增第一阶段不需要的复杂标签表。
7. 完成后运行 migration 检查，并说明如何验证表结构。
```

---

## 3. 实现网易云歌单导入

```text
请使用 jmusic-feature-slice 和 jmusic-api-adapter 的思路，实现“网易云歌单导入”功能。

要求：
1. 后端添加 NeteaseModule。
2. 通过 NETEASE_API_BASE_URL 调用网易云 API。
3. 实现 getPlaylistDetail 和 getSongDetail。
4. 新增接口 POST /api/admin/import/playlist。
5. 输入 playlistId 后，保存 playlists、songs、artists、albums、song_artists、playlist_songs。
6. 重复导入时要去重。
7. 创建 sync_jobs 记录导入状态。
8. 为导入的歌曲创建初始 song_screening 记录，状态为 pending。
9. 前端实现“歌单导入页”，输入歌单 ID 后可开始导入，并显示导入结果。
10. 不要在前端直接调用网易云 API。
11. 完成后提供测试方法。
```

---

## 4. 接入 MusicBrainz 歌手识别

```text
请使用 jmusic-api-adapter，实现 MusicBrainz 歌手识别。

要求：
1. 新增 MusicBrainzModule。
2. 使用环境变量 MUSICBRAINZ_APP_NAME 和 MUSICBRAINZ_CONTACT_EMAIL 构造 User-Agent。
3. 实现 searchArtist(artistName)。
4. 保存原始匹配结果到 external_matches。
5. 如果候选歌手 area/country 是 Japan 或 JP，则写入 artist_identity。
6. 匹配歧义时不要强行确认，状态设为 pending。
7. 实现接口 POST /api/admin/artists/:artistId/lookup-musicbrainz。
8. 支持 worker 在筛选歌曲时自动调用该逻辑。
9. 用 Aimer、YOASOBI、米津玄師、LiSA 做样例验证。
10. 完成后说明修改文件和验证方法。
```

---

## 5. 接入 Wikidata 补充识别

```text
请实现 Wikidata 补充识别功能。

要求：
1. 新增 WikidataModule。
2. 支持通过 MusicBrainz Artist ID 查询 Wikidata 实体。
3. 支持通过歌手名查询 Wikidata 实体作为兜底。
4. 解析国家 / 国籍 / 来源国家相关证据。
5. 如果 Wikidata 明确指向 Japan，则增加 artist_identity 置信度。
6. 保存原始响应到 external_matches。
7. 匹配歧义时进入 pending。
8. 不要覆盖人工确认过的 artist_identity。
9. 添加接口 POST /api/admin/artists/:artistId/lookup-wikidata。
10. 完成后提供样例验证。
```

---

## 6. 接入 Last.fm 标签识别

```text
请实现 Last.fm 标签识别功能。

要求：
1. 新增 LastfmModule。
2. 使用 LASTFM_API_KEY 环境变量。
3. 实现 getArtistTopTags(artistName)。
4. 实现 getTrackTopTags(artistName, trackName)。
5. 根据 docs/screening-rules.md 中的日系标签白名单和负向标签进行判断。
6. 保存 artist tags 和 track tags 原始响应到 external_matches。
7. 命中 japanese / j-pop / anime / vocaloid / city pop 等标签时生成正向证据。
8. 命中 k-pop / mandopop / c-pop / cantopop 时生成负向证据。
9. 添加接口 POST /api/admin/songs/:songId/lookup-lastfm。
10. 完成后提供样例验证。
```

---

## 7. 实现筛选 Worker

```text
请使用 jmusic-screening-worker 的思路，实现歌曲日音候选筛选 worker。

要求：
1. 读取 song、artists、album、playlist_sources。
2. 先检查本地 artist_identity。
3. 如果歌手已确认日本歌手，直接加分。
4. 如果未知，则依次调用 MusicBrainz、Wikidata、Last.fm。
5. 外部 API 无法判断时，再调用网易云歌词做简单假名检测兜底。
6. 根据 docs/screening-rules.md 计算 score。
7. 写入 song_screening.status、score、is_japanese_candidate、reason。
8. score >= 80 为 accepted，50-79 为 pending，<50 为 rejected。
9. 如果 song_screening.reviewed_at 不为空，不允许覆盖人工审核状态。
10. 添加接口 POST /api/admin/screening/song/:songId 和 POST /api/admin/screening/retry-pending。
11. 完成后用 YOASOBI、Aimer、米津玄師、LiSA、普通中文歌、普通 K-Pop 做样例验证。
```

---

## 8. 实现管理后台基础页面

```text
请使用 jmusic-admin-ui 和 jmusic-polished-frontend 的思路，实现第一阶段管理后台。

要求：
1. 页面要美观，不要只是普通默认表格。
2. 实现歌单导入页。
3. 实现候选歌曲列表页。
4. 实现待审核页面。
5. 实现歌曲详情页。
6. 实现歌手身份页。
7. 使用卡片、状态徽章、分数条、证据面板。
8. 每个异步操作都有 loading / success / error 状态。
9. 待审核页要展示可读的 reason 摘要，不要只展示 raw JSON。
10. 支持确认收录、暂不收录、重新筛选、确认日本歌手、确认非日本歌手。
11. 不要实现在线播放和音频下载。
12. 完成后运行前端 typecheck / lint，并说明如何访问页面。
```

---

## 9. 美化前端页面

```text
请使用 jmusic-polished-frontend skill 对当前前端进行美化。

目标：
让页面看起来像现代音乐数据库 / 内容审核工作台，而不是默认后台 CRUD。

要求：
1. 建立统一 PageHeader、StatCard、StatusBadge、SourceBadge、ScoreBar、AlbumCover、EvidencePanel、ReviewActionBar、EmptyState、LoadingSkeleton、ErrorState、FilterToolbar 组件。
2. 候选歌曲列表要有封面、状态徽章、分数条、来源徽章。
3. 待审核页要使用卡片式布局，突出判断证据和审核操作。
4. 歌曲详情页要有封面 Hero 区、证据面板、审核历史。
5. 歌手身份页要清楚展示国家、置信度、来源证据。
6. 所有页面要有 loading / empty / error 状态。
7. 适配 1366px 桌面宽度和平板宽度。
8. 不引入新 UI 库，除非项目已经安装或我明确要求。
9. 完成后截图或说明视觉改动，并运行前端验证。
```

---

## 10. 实现审核接口

```text
请实现人工审核接口和前端交互。

要求：
1. POST /api/admin/review/song/:songId/approve
2. POST /api/admin/review/song/:songId/reject
3. POST /api/admin/review/song/:songId/pending
4. POST /api/admin/review/artist/:artistId/approve-japanese
5. POST /api/admin/review/artist/:artistId/reject-japanese
6. 所有审核操作写入 review_records。
7. 审核后更新 reviewed_by 和 reviewed_at。
8. 自动筛选任务不得覆盖人工审核状态。
9. 前端操作成功后显示 toast，并更新当前列表。
10. 请求失败要恢复 UI 状态并显示错误。
```

---

## 11. 实现验证脚本

```text
请使用 jmusic-verification 的思路，为项目添加验证脚本。

要求：
1. 添加 lint 命令。
2. 添加 typecheck 命令。
3. 添加 migration 检查命令。
4. 添加 API smoke test。
5. 添加 screening sample test。
6. smoke test 至少验证 health、歌单导入、screening job、pending 查询。
7. screening sample test 至少包含 Aimer、YOASOBI、米津玄師、LiSA。
8. 输出验证报告。
9. 完成后运行验证，并列出通过和失败项。
```

---

## 12. 一次性验收提示词

```text
请作为项目验收 Agent，检查当前项目是否满足 docs/build-plan.md 的第一阶段要求。

重点检查：
1. 是否能导入网易云歌单。
2. 是否能保存 songs、artists、albums、playlists、playlist_songs。
3. 是否能调用 MusicBrainz / Wikidata / Last.fm。
4. 是否能生成 song_screening.score、status、reason。
5. 是否支持 accepted / pending / rejected。
6. 是否支持人工审核，并且自动任务不会覆盖人工审核。
7. 管理后台是否包含歌单导入、候选歌曲、待审核、歌曲详情、歌手身份页面。
8. 前端是否有基本美观度，而不是默认表格。
9. 是否没有实现在线播放、音频下载、公开歌词展示。
10. 是否有 README、.env.example、docker-compose、验证命令。

请输出：
- 已满足项
- 未满足项
- 关键风险
- 下一步修复顺序
```

---

## 13. 修 bug 通用提示词

```text
请根据报错修复当前问题。修复前先定位相关模块，不要大规模重构。

要求：
1. 说明错误原因。
2. 给出最小修改方案。
3. 修改代码。
4. 运行相关验证。
5. 如果验证失败，继续修复直到该问题解决或说明阻塞原因。
6. 不要引入与当前 bug 无关的新功能。
```

---

## 14. 代码审查提示词

```text
请审查当前变更是否符合 AGENTS.md 和 docs/build-plan.md。

重点检查：
1. 是否违反第一阶段边界。
2. 是否有前端直接调用外部 API。
3. 是否泄露密钥或 cookie。
4. 是否没有保存 external_matches.raw_json。
5. 是否没有保存 song_screening.reason。
6. 是否可能覆盖人工审核状态。
7. 是否缺少错误处理。
8. 是否缺少 loading / empty / error 状态。
9. 是否有重复组件或重复逻辑。
10. 是否需要补测试或验证脚本。

请给出具体文件级建议。
```
