# J-Music 日音数据库项目 Markdown 包

本包用于指导 Agent / Codex / Claude Code 实现一个基于网易云 API + 外部 API 初筛的日音数据库 Web 应用。

## 第一阶段目标

第一阶段只做“日音候选库”，不做完整音乐平台。

核心能力：

1. 从网易云歌单 / 搜索 / 指定歌手导入候选歌曲。
2. 保存歌曲、歌手、专辑、歌单来源。
3. 通过 MusicBrainz / Wikidata / Last.fm 初筛日本歌手或日系歌曲。
4. 外部 API 无法判断时，使用网易云歌词做简单日语兜底判断。
5. 将歌曲分为 `accepted`、`pending`、`rejected`。
6. 提供后台人工审核页面。
7. 沉淀日本歌手身份缓存，降低重复 API 调用。

## 不做的事情

第一阶段明确不做：

- 在线播放
- 音频下载
- 公开音频 URL 分发
- 大规模公开歌词展示
- 复杂标签系统
- AI 推荐
- 社交功能

## 推荐技术栈

- Backend：Node.js + NestJS + TypeScript
- Frontend：Vue 3 + Vite + TypeScript + Element Plus 或 Naive UI
- Database：PostgreSQL
- Queue / Cache：Redis + BullMQ
- External APIs：
  - NeteaseCloudMusicApiEnhanced
  - MusicBrainz
  - Wikidata
  - Last.fm

## 文档结构

```text
.
├── README.md
├── AGENTS.md
├── docs/
│   ├── build-plan.md
│   ├── architecture.md
│   ├── db-schema.md
│   ├── api-sources.md
│   ├── screening-rules.md
│   ├── frontend-ui-guidelines.md
│   ├── development-roadmap.md
│   └── agent-prompts.md
└── .agents/
    └── skills/
        ├── jmusic-feature-slice/
        │   └── SKILL.md
        ├── jmusic-api-adapter/
        │   └── SKILL.md
        ├── jmusic-screening-worker/
        │   └── SKILL.md
        ├── jmusic-admin-ui/
        │   └── SKILL.md
        ├── jmusic-polished-frontend/
        │   └── SKILL.md
        └── jmusic-verification/
            └── SKILL.md
```

## 使用方式

1. 将本包解压到你的项目根目录。
2. 把 `AGENTS.md` 放在项目根目录。
3. 把 `.agents/skills/` 保留在项目内。
4. 让 Agent 先阅读：
   - `README.md`
   - `AGENTS.md`
   - `docs/build-plan.md`
   - `docs/db-schema.md`
   - `docs/screening-rules.md`
5. 按 `docs/agent-prompts.md` 中的提示词分阶段执行。

## 推荐执行顺序

```text
1. 初始化项目骨架
2. 实现数据库表结构
3. 实现网易云歌单导入
4. 接入 MusicBrainz
5. 接入 Wikidata
6. 接入 Last.fm
7. 实现筛选 worker
8. 实现管理后台
9. 实现美观前端优化
10. 完成验证和部署
```

## 给 Agent 的总提示

```text
请先阅读 AGENTS.md、docs/build-plan.md、docs/db-schema.md、docs/screening-rules.md，然后按 docs/agent-prompts.md 的阶段提示执行。每次只实现一个完整功能切片，不要一次性重构整个项目。第一阶段禁止实现在线播放、音频下载、公开歌词展示和复杂推荐功能。
```

## Phase 0 快速启动

项目使用 npm workspaces，包含：

```text
apps/api      NestJS 后端与数据库迁移
apps/worker   BullMQ Worker
apps/web      Vue 3 + Vite 管理端
```

复制环境变量后启动完整基础设施：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

服务地址：

```text
Web:    http://localhost:8080
API:    http://localhost:3001
Health: http://localhost:3001/health
```

本地开发命令：

```powershell
npm install
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev:web
```

验证：

```powershell
npm run db:migration:check
npm run verify
```

`NETEASE_API_BASE_URL` 只由后端和 Worker 读取，前端不直接访问网易云 API。

### Windows 本地基础设施

没有 Docker 的 Windows 开发机可以使用用户级 PostgreSQL 和 Redis 兼容服务：

```powershell
npm run local:infra:install
npm run local:infra:start
npm run local:infra:verify
```

运行时安装在 `%LOCALAPPDATA%\jpopdb-runtime`，不会注册 PostgreSQL 系统服务。
Redis 兼容服务使用 Memurai Developer，仅允许开发和测试，不能用于生产部署。

本地连接配置：

```env
DATABASE_URL=postgres://jmusic:jmusic@127.0.0.1:5432/jmusic
REDIS_URL=redis://127.0.0.1:6379
```

查看或停止：

```powershell
npm run local:infra:status
npm run local:infra:stop
```

正式服务器仍使用 `docker compose up --build`。

## Phase 1：网易云歌单导入

管理端访问 `http://localhost:5173`，输入网易云歌单数字 ID 即可创建后台导入任务。

接口：

```text
POST /api/admin/import/playlist
GET  /api/admin/jobs
GET  /api/admin/jobs/:id
```

导入任务会幂等保存歌单、歌曲、歌手、专辑与关联关系，为每首歌曲创建初始
`pending` 筛选记录，并将网易云歌曲原始结果保存到 `external_matches.raw_json`。

真实歌单 smoke test：

```powershell
npm run smoke:phase1
```

可通过 `TEST_PLAYLIST_ID` 和 `API_BASE_URL` 更换测试歌单或 API 地址。

## Phase 2：外部 API 初筛与人工审核

管理端仍访问 `http://localhost:5173`。导入候选歌曲后，可创建初筛任务，后台 Worker 会按以下顺序处理：

```text
本地 artist_identity 缓存
MusicBrainz 艺人查询
Wikidata 国家 / 来源证据
Last.fm 艺人和歌曲标签（需要 LASTFM_API_KEY，未配置时跳过）
本地歌单关键词与假名标题证据
```

新增接口：

```text
POST /api/admin/screening/jobs
GET  /api/admin/screening/candidates?status=pending
POST /api/admin/screening/songs/:songId/review
```

自动筛选会写入 `song_screening.reason`，外部 API 原始响应会写入
`external_matches.raw_json`。如果歌曲已经人工审核，自动流程不会覆盖人工状态，只会写入最新自动建议。

真实初筛 smoke test：

```powershell
npm run smoke:phase2
```

可通过 `SCREENING_LIMIT` 控制单次初筛数量。`LASTFM_API_KEY` 不配置时，Last.fm 证据会跳过，但 MusicBrainz / Wikidata / 本地证据仍会执行。
