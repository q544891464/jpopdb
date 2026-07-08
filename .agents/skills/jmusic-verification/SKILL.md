---
name: jmusic-verification
description: Use this skill after code changes to verify the J-Music database app, including linting, type checks, migrations, API smoke tests, and screening sample tests.
---

# J-Music Verification Skill

## Goal

Verify that the app still works after changes.

## Required checks

1. Install dependencies if needed.
2. Run lint.
3. Run type check.
4. Run database migration check.
5. Run backend tests.
6. Run worker tests.
7. Run API smoke tests.
8. Run screening sample tests.

## Smoke test examples

Test these flows:

1. Health check endpoint.
2. Playlist import endpoint with a test playlist ID.
3. Screening job creation.
4. Artist identity lookup.
5. Pending review query.

## Screening samples

Check known examples:

- Aimer
- YOASOBI
- 米津玄師
- LiSA
- 初音ミク

## Output

At the end, report:

1. Commands run.
2. Passed checks.
3. Failed checks.
4. Files likely involved in failures.
5. Recommended next fix.
