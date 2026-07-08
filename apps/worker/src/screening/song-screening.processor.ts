import type { Job } from 'bullmq'

import { ExternalApiError, isRecoverableExternalError } from '../external/external-api-error'
import type { LastfmClient } from '../external/lastfm.client'
import type { MusicBrainzClient } from '../external/musicbrainz.client'
import type { WikidataClient } from '../external/wikidata.client'
import type { NeteaseClient } from '../netease/netease.client'
import type { ScreeningRepository } from './screening.repository'
import type {
  ArtistIdentity,
  ScreeningCandidate,
  ScreeningArtistIdentityEvidence,
  ScreeningReason,
  ScreeningStatus,
  SongScreeningJobData,
} from './screening.types'

export const SONG_SCREENING_JOB = 'screen-songs'

type EvidenceItem = Record<string, unknown> & { score: number }
type LyricFallbackReason = ScreeningReason['fallback']
type LyricAnalysis = {
  rawLrc: string | null
  translatedLrc: string | null
  kanaCount: number
  kanaRatio: number
  languageGuess: string
  cached: boolean
}

export class SongScreeningProcessor {
  constructor(
    private readonly repository: ScreeningRepository,
    private readonly musicBrainz: MusicBrainzClient,
    private readonly wikidata: WikidataClient,
    private readonly lastfm: LastfmClient,
    private readonly netease: NeteaseClient,
  ) {}

  async process(job: Job<SongScreeningJobData>): Promise<void> {
    const { syncJobId, status = 'pending', limit = 5, songId, artistId } = job.data
    try {
      await this.repository.markRunning(syncJobId)
      const candidates = songId
        ? [await this.repository.findCandidateBySongId(songId)].filter((candidate): candidate is ScreeningCandidate => candidate !== null)
        : artistId
          ? await this.repository.findCandidatesByArtistId(artistId, Math.min(Math.max(limit, 1), 200))
        : await this.repository.findCandidates(status, Math.min(Math.max(limit, 1), 50))
      await this.repository.setTotal(syncJobId, candidates.length)

      let successCount = 0
      let failedCount = 0
      const errors: string[] = []
      for (const candidate of candidates) {
        try {
          await this.screenOne(candidate)
          successCount += 1
        } catch (error) {
          failedCount += 1
          errors.push(`${candidate.songName}: ${this.describeError(error)}`)
          if (isRecoverableExternalError(error)) {
            throw error
          }
        }
        await this.repository.updateProgress(syncJobId, successCount, failedCount)
        await job.updateProgress({ successCount, failedCount })
      }

      const finalStatus = failedCount === 0 ? 'success' : successCount > 0 ? 'partial_success' : 'failed'
      await this.repository.markFinished(
        syncJobId,
        finalStatus,
        successCount,
        failedCount,
        errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      )
    } catch (error) {
      const message = this.describeError(error)
      const maxAttempts = job.opts.attempts ?? 1
      const isRetrying = isRecoverableExternalError(error) && job.attemptsMade + 1 < maxAttempts
      if (isRetrying) {
        await this.repository.markRetry(syncJobId, `${message}; screening job will retry automatically`)
      } else {
        await this.repository.markFinished(syncJobId, 'failed', 0, 0, message)
      }
      if (error instanceof ExternalApiError && !isRecoverableExternalError(error)) {
        job.discard()
      }
      throw error
    }
  }

  private async screenOne(candidate: ScreeningCandidate): Promise<void> {
    const positive: EvidenceItem[] = []
    let negative: EvidenceItem[] = []
    const skipped: string[] = []
    const artistLookups: NonNullable<ScreeningReason['external']['artistLookups']> = []
    const identityEvidences: ScreeningArtistIdentityEvidence[] = []
    const artists = candidate.artists
    const primaryArtist = artists[0]
    let firstMusicbrainz: ScreeningReason['external']['musicbrainz'] = null
    let firstWikidata: ScreeningReason['external']['wikidata'] = null
    let lastfmArtist: ScreeningReason['external']['lastfmArtist'] = null
    let lastfmTrack: ScreeningReason['external']['lastfmTrack'] = null

    if (artists.length === 0) {
      skipped.push('artist identity skipped because the song has no linked artists')
    }

    let unknownArtistLookups = 0
    for (const artist of artists) {
      let existingIdentity = artist.identity ?? await this.repository.getArtistIdentity(artist.artistId)
      if (existingIdentity) {
        existingIdentity = { ...existingIdentity, artistName: existingIdentity.artistName ?? artist.artistName }
      }

      if (existingIdentity && this.shouldReuseIdentity(existingIdentity)) {
        this.scoreIdentity(
          existingIdentity,
          positive,
          negative,
          existingIdentity.reviewedAt ? 'manual_artist_identity' : 'artist_identity',
        )
        identityEvidences.push(toIdentityEvidence(existingIdentity, true))
        skipped.push(`${artist.artistName}: ${existingIdentity.reviewedAt ? 'manual artist identity reused' : 'artist identity cache reused'}`)
        continue
      }

      if (unknownArtistLookups >= 5) {
        skipped.push(`${artist.artistName}: external artist lookup skipped because the per-song limit is 5`)
        continue
      }
      unknownArtistLookups += 1

      const lookupPositive: EvidenceItem[] = []
      const lookupNegative: EvidenceItem[] = []
      let musicbrainz: ScreeningReason['external']['musicbrainz'] = null
      let wikidata: ScreeningReason['external']['wikidata'] = null
      try {
        musicbrainz = await this.musicBrainz.searchArtist(artist.artistName)
      } catch (error) {
        skipped.push(`${artist.artistName}: MusicBrainz skipped: ${this.describeError(error)}`)
      }
      if (musicbrainz) {
        await this.repository.saveExternalMatch('artist', artist.artistId, musicbrainz)
        firstMusicbrainz ??= musicbrainz
        if (musicbrainz.isJapanese === true) {
          lookupPositive.push({
            source: 'musicbrainz',
            type: 'artist_country',
            artistId: artist.artistId,
            artistName: artist.artistName,
            value: musicbrainz.country ?? 'JP',
            score: 90,
          })
        } else if (musicbrainz.isJapanese === false) {
          lookupNegative.push({
            source: 'musicbrainz',
            type: 'non_japanese_artist',
            artistId: artist.artistId,
            artistName: artist.artistName,
            value: musicbrainz.country ?? 'non-JP',
            score: -80,
          })
        }
      }

      const wikidataEntityId = extractWikidataEntityId(musicbrainz?.wikidataUrl)
      try {
        wikidata = wikidataEntityId
          ? await this.wikidata.getArtistCountry(wikidataEntityId)
          : musicbrainz?.mbid
            ? await this.wikidata.findArtistByMusicBrainzId(musicbrainz.mbid)
            : await this.wikidata.findArtistByName(artist.artistName)
      } catch (error) {
        skipped.push(`${artist.artistName}: Wikidata skipped: ${this.describeError(error)}`)
      }
      if (wikidata) {
        await this.repository.saveExternalMatch('artist', artist.artistId, wikidata)
        firstWikidata ??= wikidata
        if (wikidata.isJapanese === true) {
          lookupPositive.push({
            source: 'wikidata',
            type: 'artist_country',
            artistId: artist.artistId,
            artistName: artist.artistName,
            value: 'JP',
            score: 90,
          })
        } else if (wikidata.isJapanese === false) {
          lookupNegative.push({
            source: 'wikidata',
            type: 'non_japanese_artist',
            artistId: artist.artistId,
            artistName: artist.artistName,
            value: wikidata.country ?? 'non-JP',
            score: -80,
          })
        }
      }

      positive.push(...lookupPositive)
      negative.push(...lookupNegative)
      artistLookups.push({
        artistId: artist.artistId,
        artistName: artist.artistName,
        musicbrainz,
        wikidata,
      })

      const identity = this.buildIdentity(artist.artistId, musicbrainz?.isJapanese ?? wikidata?.isJapanese ?? null, musicbrainz?.country ?? wikidata?.country, lookupPositive, lookupNegative, {
        musicbrainz,
        wikidata,
      })
      await this.repository.upsertArtistIdentity(artist.artistId, identity)
      existingIdentity = {
        artistId: artist.artistId,
        artistName: artist.artistName,
        isJapanese: identity.isJapanese,
        country: identity.country ?? null,
        confidence: identity.confidence,
        status: identity.status,
        reviewedAt: null,
      }
      identityEvidences.push(toIdentityEvidence(existingIdentity, false))
    }

    if (hasJapaneseArtistEvidence(identityEvidences, positive)) {
      const removed = negative.filter(isStrongArtistNegative)
      if (removed.length > 0) {
        skipped.push(`ignored ${removed.length} negative co-artist evidence item(s) because a Japanese artist identity was confirmed`)
        negative = negative.filter((item) => !isStrongArtistNegative(item))
      }
    }

    if (this.lastfm.isConfigured() && primaryArtist) {
      try {
        lastfmArtist = await this.lastfm.getArtistTopTags(primaryArtist.artistName)
      } catch (error) {
        skipped.push(`Last.fm artist tags skipped: ${this.describeError(error)}`)
      }
      if (lastfmArtist) {
        await this.repository.saveExternalMatch('artist', primaryArtist.artistId, lastfmArtist)
        if (lastfmArtist.positiveTags.length > 0) {
          positive.push({
            source: 'lastfm',
            type: 'artist_tags',
            artistId: primaryArtist.artistId,
            artistName: primaryArtist.artistName,
            value: lastfmArtist.positiveTags,
            score: 70,
          })
        }
        if (lastfmArtist.negativeTags.length > 0) {
          negative.push({
            source: 'lastfm',
            type: 'artist_tags_negative',
            artistId: primaryArtist.artistId,
            artistName: primaryArtist.artistName,
            value: lastfmArtist.negativeTags,
            score: -60,
          })
        }
      }

      try {
        lastfmTrack = await this.lastfm.getTrackTopTags(primaryArtist.artistName, candidate.songName)
      } catch (error) {
        skipped.push(`Last.fm track tags skipped: ${this.describeError(error)}`)
      }
      if (lastfmTrack) {
        await this.repository.saveExternalMatch('song', candidate.songId, lastfmTrack)
        if (lastfmTrack.positiveTags.length > 0) {
          positive.push({ source: 'lastfm', type: 'track_tags', value: lastfmTrack.positiveTags, score: 70 })
        }
        if (lastfmTrack.negativeTags.length > 0) {
          negative.push({ source: 'lastfm', type: 'track_tags_negative', value: lastfmTrack.negativeTags, score: -60 })
        }
      }
    } else {
      skipped.push(primaryArtist ? 'Last.fm skipped because LASTFM_API_KEY is not configured' : 'Last.fm skipped because the song has no linked artists')
    }

    const playlistHit = candidate.playlistNames.find(hasPlaylistKeyword)
    if (playlistHit) {
      positive.push({ source: 'netease', type: 'playlist_keyword', value: playlistHit, score: 30 })
    }
    if (hasKana(candidate.songName) || hasKana(candidate.albumName ?? '')) {
      positive.push({ source: 'local', type: 'kana_title_or_album', value: candidate.songName, score: 30 })
    }
    const interimScore = normalizeScore(positive, negative)
    const fallback = await this.applyLyricFallback(candidate, interimScore, positive, negative, skipped)
    const score = positive.reduce((sum, item) => sum + item.score, 0) + negative.reduce((sum, item) => sum + item.score, 0)
    const normalizedScore = Math.max(0, Math.min(100, score))
    const screeningStatus = toStatus(normalizedScore)
    const summary = summarize(screeningStatus, normalizedScore, positive, negative)
    const reason: ScreeningReason = {
      score: normalizedScore,
      status: screeningStatus,
      positive,
      negative,
      fallback,
      external: {
        musicbrainz: firstMusicbrainz,
        wikidata: firstWikidata,
        lastfmArtist,
        lastfmTrack,
        artistLookups,
        skipped,
      },
      artist_identity: pickStrongestIdentityEvidence(identityEvidences),
      artist_identities: identityEvidences,
      summary,
      latest_auto_suggestion: {
        score: normalizedScore,
        status: screeningStatus,
        summary,
        suggestedAt: new Date().toISOString(),
      },
    }
    await this.repository.saveScreening(candidate.songId, normalizedScore, screeningStatus, reason)
  }

  private shouldReuseIdentity(identity: ArtistIdentity): boolean {
    return identity.reviewedAt !== null ||
      identity.status === 'confirmed_by_api' ||
      identity.status === 'confirmed_by_manual' ||
      identity.status === 'rejected'
  }

  private buildIdentity(
    artistId: string,
    isJapanese: boolean | null,
    country: string | undefined,
    positive: EvidenceItem[],
    negative: EvidenceItem[],
    sourceSummary: unknown,
  ): Parameters<ScreeningRepository['upsertArtistIdentity']>[1] {
    const hasJapanEvidence = positive.some((item) => item.type === 'artist_country')
    const hasNegativeArtistEvidence = negative.some((item) => item.type === 'non_japanese_artist')
    return {
      isJapanese: hasJapanEvidence ? true : hasNegativeArtistEvidence ? false : isJapanese,
      country: hasJapanEvidence ? 'JP' : country,
      confidence: hasJapanEvidence ? 90 : hasNegativeArtistEvidence ? 80 : 30,
      status: hasJapanEvidence
        ? 'confirmed_by_api'
        : hasNegativeArtistEvidence
          ? 'rejected'
          : isJapanese === null
            ? 'unknown'
            : 'pending',
      sourceSummary: { artistId, ...asObject(sourceSummary) },
    }
  }

  private scoreIdentity(
    identity: ArtistIdentity,
    positive: EvidenceItem[],
    negative: EvidenceItem[],
    source: string,
  ): void {
    if (identity.isJapanese === true) {
      positive.push({
        source,
        type: 'artist_identity',
        artistId: identity.artistId,
        artistName: identity.artistName,
        value: identity.status,
        score: 90,
      })
    } else if (identity.isJapanese === false && identity.status === 'rejected') {
      negative.push({
        source,
        type: 'artist_identity',
        artistId: identity.artistId,
        artistName: identity.artistName,
        value: identity.status,
        score: -80,
      })
    }
  }

  private async applyLyricFallback(
    candidate: ScreeningCandidate,
    interimScore: number,
    positive: EvidenceItem[],
    negative: EvidenceItem[],
    skipped: string[],
  ): Promise<LyricFallbackReason> {
    if (interimScore >= 80) {
      return { lyric_checked: false, skipped_reason: 'external or local evidence already accepted the song' }
    }
    if (hasStrongNegativeArtistEvidence(negative)) {
      return { lyric_checked: false, skipped_reason: 'strong negative artist evidence present' }
    }

    try {
      const analysis = await this.getLyricAnalysis(candidate)
      const passed = analysis.kanaCount >= 30 && analysis.kanaRatio >= 0.1
      const reason: LyricFallbackReason = {
        lyric_checked: true,
        passed,
        kana_count: analysis.kanaCount,
        kana_ratio: analysis.kanaRatio,
        language_guess: analysis.languageGuess,
        source: 'netease_lyric',
        cached: analysis.cached,
      }
      if (passed) {
        positive.push({
          source: 'netease',
          type: 'lyric_kana_fallback',
          value: {
            kana_count: analysis.kanaCount,
            kana_ratio: analysis.kanaRatio,
            language_guess: analysis.languageGuess,
            cached: analysis.cached,
          },
          score: 60,
        })
      } else {
        reason.skipped_reason = analysis.kanaCount < 10
          ? 'lyric has too little kana evidence'
          : 'lyric kana ratio did not pass fallback threshold'
      }
      return reason
    } catch (error) {
      const message = this.describeError(error)
      skipped.push(`Netease lyric fallback skipped: ${message}`)
      return { lyric_checked: false, skipped_reason: message }
    }
  }

  private async getLyricAnalysis(candidate: ScreeningCandidate): Promise<LyricAnalysis> {
    const cached = await this.repository.getLyricsCache(candidate.songId)
    if (cached) {
      return {
        rawLrc: cached.rawLrc,
        translatedLrc: cached.translatedLrc,
        kanaCount: cached.kanaCount ?? 0,
        kanaRatio: cached.kanaRatio ?? 0,
        languageGuess: cached.languageGuess ?? 'unknown',
        cached: true,
      }
    }

    const lyric = await this.netease.getLyric(candidate.neteaseSongId)
    const analysis = analyzeLyric(lyric.rawLrc, lyric.translatedLrc)
    await this.repository.saveLyricsCache(candidate.songId, analysis)
    return { ...analysis, cached: false }
  }

  private describeError(error: unknown): string {
    if (error instanceof ExternalApiError) {
      return `${error.source}: ${error.message} [${error.category}]`
    }
    return error instanceof Error ? error.message : 'unknown screening error'
  }
}

function normalizeScore(positive: EvidenceItem[], negative: EvidenceItem[]): number {
  const score = positive.reduce((sum, item) => sum + item.score, 0) + negative.reduce((sum, item) => sum + item.score, 0)
  return Math.max(0, Math.min(100, score))
}

function toStatus(score: number): ScreeningStatus {
  if (score >= 80) return 'accepted'
  if (score >= 50) return 'pending'
  return 'rejected'
}

function hasStrongNegativeArtistEvidence(negative: EvidenceItem[]): boolean {
  return negative.some((item) => (item.type === 'artist_identity' || item.type === 'non_japanese_artist') && item.score <= -80)
}

function isStrongArtistNegative(item: EvidenceItem): boolean {
  return (item.type === 'artist_identity' || item.type === 'non_japanese_artist') && item.score <= -80
}

function hasJapaneseArtistEvidence(
  identities: ScreeningArtistIdentityEvidence[],
  positive: EvidenceItem[],
): boolean {
  return identities.some(
    (identity) =>
      identity.isJapanese === true &&
      (identity.status === 'confirmed_by_api' || identity.status === 'confirmed_by_manual'),
  ) || positive.some((item) => item.type === 'artist_identity' || item.type === 'artist_country')
}

function pickStrongestIdentityEvidence(
  identities: ScreeningArtistIdentityEvidence[],
): ScreeningArtistIdentityEvidence | null {
  return identities.find(
    (identity) =>
      identity.isJapanese === true &&
      (identity.status === 'confirmed_by_manual' || identity.status === 'confirmed_by_api'),
  ) ?? identities.find((identity) => identity.manual) ?? identities[0] ?? null
}

function analyzeLyric(rawLrc: string | null, translatedLrc: string | null): Omit<LyricAnalysis, 'cached'> {
  const text = stripLrcTimeTags(rawLrc ?? '')
  const kanaCount = countMatches(text, /[\u3040-\u30ff]/gu)
  const signalLength = text.replace(/[\s\p{P}\p{S}]/gu, '').length
  const kanaRatio = signalLength === 0 ? 0 : Number((kanaCount / signalLength).toFixed(4))
  return {
    rawLrc,
    translatedLrc,
    kanaCount,
    kanaRatio,
    languageGuess: kanaCount >= 30 && kanaRatio >= 0.1 ? 'ja' : 'unknown',
  }
}

function stripLrcTimeTags(value: string): string {
  return value.replace(/\[[^\]]*\]/gu, ' ')
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length
}

function hasKana(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value)
}

function hasPlaylistKeyword(value: string): boolean {
  return /日语|日音|日本|j-?pop|j-?rock|acg|anime|vocaloid|city pop|动画|动漫|アニメ|ボカロ/iu.test(value)
}

function summarize(status: ScreeningStatus, score: number, positive: EvidenceItem[], negative: EvidenceItem[]): string {
  const positiveText = positive.map((item) => `${item.source}:${item.type}`).join(', ') || 'no positive evidence'
  const negativeText = negative.map((item) => `${item.source}:${item.type}`).join(', ') || 'no negative evidence'
  return `auto screening ${status} with score ${score}. Positive: ${positiveText}. Negative: ${negativeText}.`
}

function extractWikidataEntityId(url: string | undefined): string | undefined {
  const match = url?.match(/(Q\d+)$/u)
  return match?.[1]
}

function toIdentityEvidence(identity: ArtistIdentity, reused: boolean): ScreeningArtistIdentityEvidence {
  return {
    ...identity,
    reviewedAt: identity.reviewedAt,
    reused,
    manual: identity.reviewedAt !== null,
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
