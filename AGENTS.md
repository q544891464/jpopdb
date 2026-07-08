# AGENTS.md

## Project overview

This project is a J-Music database web app.

The first phase focuses on importing candidate songs from Netease Cloud Music and screening high-probability Japanese songs or Japanese artist works by using external APIs.

The app is not a music streaming platform. It is a music metadata, screening, and review tool.

## Product boundaries

Do not implement:

1. Music playback.
2. Audio download.
3. Public audio URL distribution.
4. Large-scale public lyric display.
5. Recommendation algorithm.
6. Social features.
7. Payment features.

Lyrics may be used only for backend language fallback screening during phase one.

Do not expose Netease cookies, Last.fm API keys, MusicBrainz contact identity, or other secrets to the frontend.

## Tech stack

Preferred stack:

- Backend: Node.js + NestJS + TypeScript
- Frontend: Vue 3 + Vite + TypeScript
- UI: Element Plus or Naive UI
- Database: PostgreSQL
- Cache / queue: Redis + BullMQ
- External APIs:
  - NeteaseCloudMusicApiEnhanced
  - MusicBrainz
  - Wikidata
  - Last.fm

If the existing project already uses a different but reasonable stack, inspect it first and avoid unnecessary rewrites.

## First-phase entities

Core entities:

- songs
- artists
- albums
- song_artists
- playlists
- playlist_songs
- external_matches
- artist_identity
- song_screening
- review_records
- sync_jobs

## Screening status

Use only these first-phase screening statuses:

- accepted
- pending
- rejected

Use only these first-phase artist identity statuses:

- confirmed_by_api
- confirmed_by_manual
- pending
- rejected
- unknown

## Manual review priority

Manual decisions always have priority over automatic screening.

Do not silently overwrite manual review results during automatic rescreening.

If an automated process wants to change a manually reviewed item, it must create a separate review suggestion instead of changing the status directly.

## Required development workflow

For every feature:

1. Inspect existing files before creating new modules.
2. Read relevant docs under `docs/`.
3. Implement the smallest complete vertical slice.
4. Add database migration if schema changes.
5. Add backend service and API.
6. Add worker logic if async processing is needed.
7. Add frontend admin UI only if the feature needs manual operation.
8. Save external API raw responses in `external_matches.raw_json`.
9. Save screening reasons in `song_screening.reason`.
10. Add or update validation scripts.
11. Run verification before final summary.
12. Summarize changed files, commands run, and how to test.

## External API rules

All external API calls must go through backend services.

Never call external APIs directly from the frontend.

Adapters must provide:

- timeout handling
- retry handling
- rate limit handling
- normalized output
- raw response persistence when useful
- clear error classification

## Frontend rules

Build a polished but practical admin UI.

Avoid plain default admin tables as the only UI.

All list and detail pages should show:

- loading state
- empty state
- error state
- success feedback
- status badges
- readable evidence summary
- clear primary action

## Security rules

Never hardcode credentials.

Use environment variables for:

- database URL
- Redis URL
- Netease API base URL
- Last.fm API key
- proxy config if needed

Do not log cookies or API keys.

## Completion criteria

A feature is complete only when:

1. It works through the intended API.
2. Data is persisted correctly.
3. Errors are handled.
4. UI is usable if UI is required.
5. Verification command passes or failures are explained.
6. The final summary includes how to test.
