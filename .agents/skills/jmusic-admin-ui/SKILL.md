---
name: jmusic-admin-ui
description: Use this skill when building or modifying the admin frontend for importing playlists, reviewing screening results, and confirming artist identity.
---

# J-Music Admin UI Skill

## Goal

Build simple admin pages for managing the first-phase screening workflow.

## UI principles

1. Prefer clarity over visual complexity.
2. Every screening result must show the reason.
3. Every pending item must be actionable.
4. Avoid hiding important evidence behind too many clicks.
5. Do not build public playback features.
6. Do not expose external API secrets.

## Required pages

1. Playlist import page.
2. Candidate song list.
3. Pending review list.
4. Song detail page.
5. Artist identity page.
6. Screening job status page.

## Candidate song list fields

Show:

- song name
- artist name
- album name
- source playlist
- score
- status
- evidence source
- created time
- actions

## Pending review actions

Support:

- approve song
- reject song
- confirm Japanese artist
- confirm non-Japanese artist
- rerun screening
- open Netease link

## Evidence display

Display reason JSON in a readable format:

- MusicBrainz evidence
- Wikidata evidence
- Last.fm tags
- lyric fallback result
- playlist keyword evidence

Raw JSON can be collapsed under “查看原始数据”.
