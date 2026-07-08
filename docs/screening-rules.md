# 日音候选筛选规则

## 1. 目标

本规则用于将网易云导入的候选歌曲分为：

```text
accepted：自动通过
pending：待人工审核
rejected：暂不入库
```

第一阶段目标不是 100% 判断歌曲语言，而是筛出高概率日音候选。

---

## 2. 核心原则

```text
日本歌手作品 → 收
Last.fm 明确 J-Pop / Japanese / Anime / Vocaloid → 收
MusicBrainz / Wikidata 明确日本来源 → 收
外部 API 查不到，但歌词明显日语 → 收
其他 → 待审核或暂不收
```

---

## 3. 分数规则

### 3.1 正向分数

```text
MusicBrainz 判断歌手为 Japan：+90
Wikidata 判断歌手国籍 / 来源为 Japan：+90
Last.fm artist tags 命中 japanese / j-pop / j-rock：+70
Last.fm track tags 命中 japanese / j-pop / anime / vocaloid / city pop：+70
网易云来源歌单名包含 日语 / JPOP / ACG / 动漫 / Vocaloid：+30
歌名 / 专辑名包含明显日文假名：+30
歌词假名检测通过：+60
```

### 3.2 负向分数

```text
MusicBrainz / Wikidata 明确为中国、韩国、欧美歌手：-80
Last.fm 标签命中 k-pop / mandopop / c-pop / cantopop：-60
歌词明显为中文 / 韩文，且歌手非日本：-60
```

### 3.3 最终阈值

```text
score >= 80：accepted
50 <= score < 80：pending
score < 50：rejected
```

---

## 4. 日系标签白名单

标准化为小写后匹配：

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

## 5. 负向标签

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

---

## 6. 歌词兜底规则

歌词兜底只在外部 API 无法判断时使用。

### 6.1 基础检测

检测平假名和片假名：

```text
平假名范围：ぁ-ゖ
片假名范围：ァ-ヺ
```

### 6.2 通过条件

```text
假名数量 >= 30 且 假名比例 >= 10% → 歌词明显日语
```

### 6.3 不通过条件

```text
假名数量 < 10 → 不作为日语依据
```

### 6.4 注意事项

网易云歌词可能包含中文翻译。检测前应尽量分离原文歌词与翻译歌词。

不要把中文翻译算入日语比例。

---

## 7. 歌手身份规则

### 7.1 自动确认为日本歌手

满足任一条件：

```text
MusicBrainz artist.area.name = Japan
MusicBrainz artist.country = JP
Wikidata P27 = Japan
Wikidata P495 = Japan
Last.fm artist tags 命中 japanese / j-pop / j-rock
```

### 7.2 待确认歌手

```text
歌手名存在多个 MusicBrainz 候选
只命中弱标签
只有歌单来源证据
没有外部 API 结果，但歌手名含日文字符
```

### 7.3 暂不认为是日本歌手

```text
MusicBrainz / Wikidata 明确非 Japan
Last.fm 明确为 k-pop / c-pop / mandopop
无外部结果且无日文特征
```

---

## 8. reason JSON 结构

每次筛选必须保存判断原因。

示例：

```json
{
  "score": 100,
  "status": "accepted",
  "positive": [
    {
      "source": "musicbrainz",
      "type": "artist_country",
      "value": "JP",
      "score": 90
    },
    {
      "source": "lastfm",
      "type": "artist_tags",
      "value": ["j-pop", "japanese"],
      "score": 70
    }
  ],
  "negative": [],
  "fallback": {
    "lyric_checked": false
  },
  "summary": "MusicBrainz 判断歌手为日本，Last.fm 标签命中 j-pop / japanese。"
}
```

## 9. 手工审核优先级

如果歌曲已经被人工审核：

```text
song_screening.reviewed_at IS NOT NULL
```

自动筛选不得覆盖：

```text
status
is_japanese_candidate
reviewed_by
reviewed_at
```

可以追加：

```text
reason.latest_auto_suggestion
```

如果歌手身份已经被人工审核：

```text
artist_identity.reviewed_at IS NOT NULL
```

自动任务不得覆盖该歌手身份状态。

## 10. 样例验收

预期结果：

```text
YOASOBI - 夜に駆ける → accepted
Aimer - 残響散歌 → accepted
米津玄師 - Lemon → accepted
LiSA - 紅蓮華 → accepted
初音ミク 相关歌曲 → accepted 或 pending
普通中文流行歌 → rejected 或 pending
普通 K-Pop → rejected
外部 API 查不到但歌词明显日语 → pending 或 accepted
无歌词且歌手未知 → pending
```
