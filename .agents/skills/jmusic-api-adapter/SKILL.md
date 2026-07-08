---
name: jmusic-api-adapter
description: Use this skill when adding or modifying external API integrations for Netease, MusicBrainz, Wikidata, or Last.fm in the J-Music database app.
---

# J-Music API Adapter Skill

## Goal

Implement stable external API adapters.

## Supported sources

1. NeteaseCloudMusicApiEnhanced
2. MusicBrainz
3. Wikidata
4. Last.fm

## Rules

1. Never call external APIs directly from the frontend.
2. All external API calls must go through backend services.
3. Add timeout handling.
4. Add retry handling for temporary network failures.
5. Handle 429 rate limits gracefully.
6. Save useful raw responses into `external_matches`.
7. Normalize API results before passing them to screening logic.
8. Do not throw raw external API errors to the frontend.
9. Do not hardcode secrets.
10. Use environment variables.

## Adapter output format

Every adapter should return a normalized result:

```ts
type ExternalMatchResult = {
  source: 'netease' | 'musicbrainz' | 'wikidata' | 'lastfm'
  externalId?: string
  matchedName?: string
  confidence: number
  raw: unknown
  evidence: Record<string, unknown>
}
```

## Verification

After implementation:

1. Add one sample script under `scripts/` or test directory.
2. Test with known artists:
   - Aimer
   - YOASOBI
   - 米津玄師
   - LiSA
3. Confirm no secret is hardcoded.
4. Confirm raw results can be saved into `external_matches`.
