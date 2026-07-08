---
name: jmusic-screening-worker
description: Use this skill when implementing or modifying the Japanese music screening logic, scoring rules, worker jobs, and screening result storage.
---

# J-Music Screening Worker Skill

## Goal

Classify imported songs into:

1. accepted
2. pending
3. rejected

## Scoring rules

Use the first-phase scoring system:

- MusicBrainz artist country Japan: +90
- Wikidata Japan evidence: +90
- Last.fm artist tags include japanese / j-pop / j-rock: +70
- Last.fm track tags include japanese / j-pop / anime / vocaloid / city pop: +70
- Netease playlist name contains 日语 / JPOP / ACG / 动漫 / Vocaloid: +30
- Title or album contains kana: +30
- Lyric kana fallback passes: +60
- External source confirms non-Japanese artist: -80
- Last.fm tags include k-pop / mandopop / c-pop / cantopop: -60

Final status:

- score >= 80: accepted
- 50 <= score < 80: pending
- score < 50: rejected

## Required behavior

1. Check local `artist_identity` before external calls.
2. Reuse confirmed artist identity whenever possible.
3. Save all evidence into `song_screening.reason`.
4. Do not silently overwrite manual review results.
5. If external APIs fail, mark the job retryable.
6. If matching is ambiguous, use pending instead of accepted.
7. Lyrics are fallback only, not the primary screening method.

## Verification

Test with:

- YOASOBI - 夜に駆ける → accepted
- Aimer - 残響散歌 → accepted
- 米津玄師 - Lemon → accepted
- LiSA - 紅蓮華 → accepted
- Random C-Pop song → rejected or pending
- Random K-Pop song → rejected
- Unknown no-lyrics song → pending
