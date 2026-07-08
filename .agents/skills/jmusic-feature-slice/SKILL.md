---
name: jmusic-feature-slice
description: Use this skill when implementing a complete vertical feature for the J-Music database app, including database changes, backend API, worker logic, admin UI, and verification.
---

# J-Music Feature Slice Skill

## Goal

Implement one complete vertical feature at a time.

A feature is not complete unless it includes:

1. Database schema or migration if needed.
2. Backend service logic.
3. API endpoint.
4. Worker or queue logic if needed.
5. Admin UI changes if needed.
6. Basic validation or test script.
7. Short change summary.

## Project boundaries

Do not implement music playback, audio download, or public audio URL distribution.

Do not expose Netease API cookies, Last.fm API keys, or other credentials to the frontend.

Lyrics may be used for backend screening only. Do not build public large-scale lyric display in the first phase.

## Required workflow

1. Read `AGENTS.md`.
2. Read `docs/build-plan.md`.
3. Read `docs/db-schema.md`.
4. Identify existing modules before creating new ones.
5. Implement the smallest complete feature slice.
6. Keep API responses explicit and easy for the admin UI to consume.
7. Store external API raw results in `external_matches.raw_json`.
8. Store screening reasons in `song_screening.reason`.
9. Add or update validation scripts.
10. Run the project verification command.
11. Summarize changed files and how to test.
