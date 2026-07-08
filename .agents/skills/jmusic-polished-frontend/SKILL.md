---
name: jmusic-polished-frontend
description: Use this skill when building or improving frontend pages for the J-Music database app. Focus on polished, modern, clean, responsive, production-quality UI rather than plain admin tables.
---

# J-Music Polished Frontend Skill

## Goal

Build visually polished frontend pages for the J-Music database app.

The UI should look like a modern music database / content management product, not a default CRUD admin system.

Primary goals:

1. Clean visual hierarchy.
2. Modern card-based layout.
3. Good spacing and typography.
4. Useful empty, loading, error, and success states.
5. Responsive layout for desktop and tablet.
6. Clear evidence display for screening results.
7. Good-looking but practical admin workflow.

## Project context

This app is a J-Music database web app.

The first phase focuses on:

1. Importing Netease playlists.
2. Saving songs, artists, albums.
3. Screening high-probability Japanese songs or Japanese artist works.
4. Reviewing accepted / pending / rejected results.
5. Confirming Japanese artist identity.

Do not build music playback, audio download, or public audio URL distribution.

## Recommended visual direction

Use this style:

- Modern Japanese music database
- Clean SaaS dashboard
- Soft neutral background
- Card-based content
- Subtle accent colors
- Album artwork as a visual anchor
- Compact but readable data panels
- Avoid dense enterprise-table-only pages

Avoid:

- Plain default table pages
- Random gradient overuse
- Excessive shadows
- Unlabeled icon-only buttons
- Too many colors
- Dense forms without grouping
- Low-contrast text

## Design system

Use a consistent visual system.

### Layout

Use:

- max width containers
- 24px page padding on desktop
- 16px page padding on smaller screens
- 16px to 24px gaps between major sections
- cards for grouped content
- sticky page header when useful
- two-column layout for detail pages when enough width exists

### Typography

Use clear hierarchy:

- Page title: large and bold
- Section title: medium and semibold
- Metadata: smaller and muted
- Evidence / JSON / technical details: monospaced or compact readable block

Do not make all text the same size.

### Cards

Use cards for:

- playlist import summary
- song screening result
- artist identity
- external evidence
- job status
- pending review item

Cards should include:

- title
- short description
- status badge
- key metadata
- primary action

### Badges

Use badges for:

- accepted
- pending
- rejected
- MusicBrainz
- Wikidata
- Last.fm
- lyric fallback
- Japanese artist
- unknown artist

Status color meaning:

- accepted: positive
- pending: warning / neutral
- rejected: muted / negative
- external source: subtle info style

### Tables

Tables are allowed, but should not be the entire UI.

When using tables:

- Keep columns meaningful.
- Add status badges.
- Add compact row actions.
- Add album thumbnail when relevant.
- Add filter bar above the table.
- Add empty state when no data exists.
- Add loading skeleton while fetching.

## Required pages

### Playlist Import Page

Purpose:

Import candidate songs from a Netease playlist.

Must show:

- playlist ID
- playlist name
- total songs
- imported songs
- failed count
- created screening jobs
- current status

States:

- idle
- validating playlist
- importing
- import success
- import failed

### Candidate Songs Page

Purpose:

Browse all screened songs.

Filters:

- accepted
- pending
- rejected
- source: MusicBrainz / Wikidata / Last.fm / lyric fallback
- score range
- artist identity status
- keyword search

Each song item should show:

- album cover
- song name
- artist name
- album name
- score
- screening status
- evidence sources
- source playlist
- actions

### Pending Review Page

Purpose:

Help admin quickly review uncertain songs.

Each review card should show:

- song name
- artist name
- album cover
- score
- reason summary
- external API evidence
- lyric preview if available
- source playlist
- action buttons

Primary actions:

- 确认收录
- 暂不收录
- 标记歌手为日本歌手
- 标记歌手为非日本歌手
- 重新筛选

The reason must be human-readable.

Do not display raw JSON as the only evidence.

### Song Detail Page

Purpose:

Inspect one song’s screening result.

Layout:

- Hero section with album cover, song name, artist, album
- Status badge and score
- Evidence panels
- Screening history
- Review actions

Evidence panels:

- MusicBrainz
- Wikidata
- Last.fm artist tags
- Last.fm track tags
- lyric fallback
- playlist keyword evidence

### Artist Identity Page

Purpose:

Manage whether artists are Japanese artists.

Fields:

- artist name
- Japanese identity status
- country
- confidence
- source summary
- related song count
- manual review status

Actions:

- confirm Japanese artist
- confirm non-Japanese artist
- rerun external lookup
- merge duplicate artist

## Component guidelines

Build reusable components when possible:

- StatusBadge
- SourceBadge
- ScoreBar
- AlbumCover
- EvidencePanel
- ReviewActionBar
- EmptyState
- LoadingSkeleton
- ErrorState
- FilterToolbar
- PageHeader
- StatCard

Do not duplicate status badge logic across pages.

## Evidence display

Screening evidence should be displayed in a readable way.

Instead of showing only raw JSON, show:

```text
Last.fm 歌手标签命中：j-pop, japanese
判断贡献：+70
```

Raw JSON can be placed inside a collapsible “查看原始数据” section.

## Interaction requirements

Every async operation must have visible feedback.

Required states:

1. Loading state.
2. Success state.
3. Error state.
4. Empty state.
5. Disabled state while submitting.
6. Confirmation before destructive or irreversible actions.

For review actions:

- Show toast after success.
- Optimistically update the row only if safe.
- If request fails, restore previous state.
- Do not silently fail.

## Responsive behavior

Desktop:

- Use two-column layout for detail pages.
- Use table or split-card layout for lists.

Tablet:

- Use compact cards.
- Hide less important columns.
- Keep review actions visible.

Mobile:

- Stack cards.
- Avoid horizontal overflow.
- Use bottom action area if necessary.

## Accessibility

Follow basic accessibility:

- Buttons must have clear text.
- Icon-only buttons need aria-label.
- Status cannot rely on color only.
- Inputs need labels.
- Error messages should be close to the relevant field.
- Text contrast must be readable.

## Verification

If Playwright or browser preview is available:

1. Start the frontend dev server.
2. Open the changed page.
3. Capture screenshot.
4. Check layout, spacing, overflow, and broken states.
5. Fix visible issues before final response.

If Playwright is not available:

1. Run typecheck.
2. Run lint.
3. Review component structure manually.
4. Confirm all states are represented in code.

## Output summary

After completing frontend work, summarize:

1. Pages changed.
2. Components added or modified.
3. API endpoints used.
4. Visual improvements made.
5. Verification performed.
6. Known limitations.
