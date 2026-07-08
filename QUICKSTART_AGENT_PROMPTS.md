# 快速 Agent 提示词

## 第一次启动

```text
请先阅读 README.md、AGENTS.md、docs/build-plan.md、docs/architecture.md、docs/db-schema.md、docs/api-sources.md、docs/screening-rules.md、docs/frontend-ui-guidelines.md。

本项目是日音数据库 Web 应用。第一阶段只做网易云候选歌曲导入、外部 API 初筛、后台人工审核。禁止实现在线播放、音频下载、公开音频 URL 分发、大规模公开歌词展示、复杂推荐系统。

请先检查当前项目结构，给出分阶段实现计划。不要马上大规模改代码。
```

## 开始开发第一个功能

```text
请实现第一阶段的“网易云歌单导入”功能。

要求：
1. 输入网易云歌单 ID。
2. 调用后端 Netease API adapter。
3. 保存 playlists、songs、artists、albums、song_artists、playlist_songs。
4. 去重。
5. 创建 sync_jobs。
6. 为每首歌创建 pending 状态的 song_screening。
7. 实现前端歌单导入页。
8. 不要实现在线播放、音频下载、公开歌词展示。
9. 完成后运行验证，并说明测试方法。
```

## 开始筛选逻辑

```text
请实现歌曲日音候选筛选 worker。

要求：
1. 先查本地 artist_identity。
2. 再依次查 MusicBrainz、Wikidata、Last.fm。
3. 外部 API 无法判断时，用网易云歌词假名检测兜底。
4. 根据 docs/screening-rules.md 计算分数。
5. 写入 song_screening.status、score、reason。
6. score >= 80 为 accepted，50-79 为 pending，<50 为 rejected。
7. 不得覆盖人工审核结果。
8. 完成后用 Aimer、YOASOBI、米津玄師、LiSA 做验证。
```

## 美化前端

```text
请使用 .agents/skills/jmusic-polished-frontend/SKILL.md 的规范，美化当前管理后台。

要求：
1. 页面看起来像现代音乐数据库 / 内容审核工作台。
2. 不要只是默认表格。
3. 使用卡片、状态徽章、分数条、证据面板。
4. 待审核页重点优化。
5. 所有异步操作有 loading / success / error。
6. 适配桌面和平板宽度。
```
