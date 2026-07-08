# 前端 UI 设计规范

## 1. 目标

本项目第一阶段是一个日音数据库管理后台，不是传统后台 CRUD 系统。

界面应该像：

```text
现代音乐资料库
内容审核工作台
音乐元数据管理系统
轻量 SaaS Dashboard
```

不要做成：

```text
默认表格后台
密密麻麻的管理系统
只有按钮和表格的 CRUD 页面
```

---

## 2. 视觉方向

推荐风格：

```text
现代、清爽、音乐资料库感、轻日系、卡片式、留白充足
```

关键词：

```text
album artwork
soft background
status badges
evidence panels
score bar
review cards
compact metadata
```

## 3. 页面布局

### 3.1 桌面端

```text
页面最大宽度：可用 1200px - 1440px
页面 padding：24px
主要区块间距：24px
卡片内部 padding：16px - 24px
```

### 3.2 平板端

```text
使用卡片列表
隐藏低优先级列
保留主要操作按钮
```

### 3.3 移动端

```text
纵向堆叠
避免横向滚动
审核按钮可放到底部操作区
```

---

## 4. 核心组件

建议抽象以下组件：

```text
PageHeader
StatCard
StatusBadge
SourceBadge
ScoreBar
AlbumCover
EvidencePanel
ReviewActionBar
EmptyState
LoadingSkeleton
ErrorState
FilterToolbar
SongReviewCard
ArtistIdentityCard
```

## 5. 状态徽章

### 5.1 筛选状态

```text
accepted：绿色 / 正向
pending：黄色 / 警示
rejected：灰色或红色 / 排除
```

### 5.2 来源徽章

```text
MusicBrainz：蓝色系
Wikidata：紫色系
Last.fm：红色系
Lyric：灰色系
Netease：红色或品牌色
Manual：黑色 / 高优先级
```

不要只靠颜色区分，徽章内必须有文字。

---

## 6. 必做页面

### 6.1 歌单导入页

内容：

```text
页面标题：歌单导入
说明文本
歌单 ID 输入框
开始导入按钮
最近导入任务
导入进度
失败日志入口
```

状态：

```text
idle
validating
importing
success
failed
```

### 6.2 候选歌曲列表页

内容：

```text
统计卡片
筛选工具栏
歌曲列表
分页
批量操作
```

字段：

```text
封面
歌曲名
歌手
专辑
来源歌单
分数
状态
证据来源
操作
```

### 6.3 待审核页

这是最重要的页面。

每张审核卡片应展示：

```text
封面
歌曲名
歌手
专辑
筛选分数
系统结论
证据摘要
Last.fm 标签
MusicBrainz / Wikidata 结果
歌词兜底信息
来源歌单
审核按钮
```

操作：

```text
确认收录
暂不收录
确认日本歌手
确认非日本歌手
重新筛选
打开网易云链接
```

### 6.4 歌曲详情页

内容：

```text
Hero 区：封面 + 歌名 + 歌手 + 专辑
状态徽章
分数条
证据面板
筛选历史
审核记录
操作按钮
```

### 6.5 歌手身份页

内容：

```text
歌手列表
身份状态
国家 / 地区
置信度
来源摘要
关联歌曲数
人工确认状态
```

操作：

```text
确认日本歌手
确认非日本歌手
重新查询外部 API
合并重复歌手
```

---

## 7. 证据展示规范

不要只展示 raw JSON。

应该把证据转成人能看懂的句子：

```text
Last.fm 歌手标签命中：j-pop, japanese
判断贡献：+70
```

```text
MusicBrainz 匹配到歌手：YOASOBI
地区：Japan
判断贡献：+90
```

raw JSON 可以放到折叠区域：

```text
查看原始数据
```

---

## 8. 交互规范

所有异步操作必须有反馈：

```text
loading
success toast
error message
disabled submitting
empty state
```

删除、排除、覆盖状态前应有确认。

审核操作成功后：

```text
更新当前卡片状态
移动到对应列表
显示成功提示
```

请求失败后：

```text
恢复旧状态
显示错误原因
```

---

## 9. 可访问性

要求：

```text
按钮必须有明确文字
图标按钮必须有 aria-label
输入框必须有 label
状态不能只依赖颜色
错误信息应靠近相关字段
文字对比度要足够
```

## 10. 质量检查

每个页面完成前检查：

```text
是否比默认后台表格更美观？
主要操作是否明显？
状态和分数是否清楚？
证据是否可读？
是否有 loading / empty / error？
1366px 宽度是否正常？
平板宽度是否正常？
重复 UI 是否抽成组件？
```
---

## Catalog browse/query UI

The app should add a catalog browse/search surface after the admin review
workflow is stable.

### Page types

```text
Catalog search landing page
Song search results
Song detail page
Artist detail page
Album detail page
```

### UX requirements

Every catalog page should include:

```text
loading state
empty state
error state
pagination
song title and aliases
artist and album metadata
release date and duration
Netease popularity, red count, and comment count when available
outbound source links
```

Song detail should open in a modal or side drawer instead of being appended to
the bottom of the result list. The drawer should keep the result position
stable and include a clear close action.

Catalog song detail may show normalized Netease metadata:

```text
song title variants
disc / track number
album type, company, tags, description, track count
Netease red count, comment count, popularity
lyric availability, line counts, kana count/ratio, contributor names
Netease encyclopedia style/tag groups
audio quality metadata such as bitrate and file size
```

Catalog search should support composable filters for:

```text
keyword
artist
album
release year range
duration range
minimum Netease popularity
minimum cached red count
minimum cached comment count
release date / popularity / red count / comment count / title sorting
search relevance sorting with exact song-title matches first
```

Screening status, score, evidence sources, artist identity status, lyric
fallback, and screening reason are admin concepts. They must not be rendered on
the public catalog page or returned by the public catalog API.

### Content boundary

Catalog pages must not render full lyrics, `raw_lrc`, or `translated_lrc`.
Catalog pages must not render romanized lyric text, playback controls, audio
download links, or any audio URL returned from Netease or another unlicensed
source.

If a future licensed lyrics/audio feature is added, it must be designed as a
separate authenticated provider integration, not as a general catalog-field
display.
