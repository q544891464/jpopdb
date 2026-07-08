import type { LastfmTagsResult } from './external.types'
import { HttpJsonClient } from './http-json.client'

type LastfmTagResponse = {
  toptags?: {
    tag?: Array<{ name?: string; count?: number }>
  }
  error?: number
  message?: string
}

export const POSITIVE_TAGS = new Set([
  'japanese',
  'j-pop',
  'jpop',
  'j-rock',
  'jrock',
  'japanese pop',
  'japanese rock',
  'anime',
  'anime song',
  'anisong',
  'vocaloid',
  'city pop',
  'utaite',
  'doujin',
  'game music',
  'soundtrack',
])

export const NEGATIVE_TAGS = new Set([
  'k-pop',
  'kpop',
  'mandopop',
  'c-pop',
  'cpop',
  'cantopop',
  'korean',
  'chinese',
  'taiwanese pop',
])

export class LastfmClient {
  private readonly http: HttpJsonClient

  constructor(private readonly apiKey?: string) {
    this.http = new HttpJsonClient({
      source: 'lastfm',
      baseUrl: 'https://ws.audioscrobbler.com/2.0/',
      timeoutMs: 5_000,
      retries: 1,
      minDelayMs: 250,
      headers: { Accept: 'application/json' },
    })
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async getArtistTopTags(artistName: string): Promise<LastfmTagsResult | null> {
    if (!this.apiKey) {
      return null
    }
    const raw = await this.http.get<LastfmTagResponse>('', {
      method: 'artist.getTopTags',
      artist: artistName,
      api_key: this.apiKey,
      format: 'json',
      autocorrect: 1,
    })
    return this.mapTags(raw, artistName, 'artist')
  }

  async getTrackTopTags(artistName: string, trackName: string): Promise<LastfmTagsResult | null> {
    if (!this.apiKey) {
      return null
    }
    const raw = await this.http.get<LastfmTagResponse>('', {
      method: 'track.getTopTags',
      artist: artistName,
      track: trackName,
      api_key: this.apiKey,
      format: 'json',
      autocorrect: 1,
    })
    return this.mapTags(raw, `${artistName} - ${trackName}`, 'track')
  }

  private mapTags(raw: LastfmTagResponse, matchedName: string, kind: 'artist' | 'track'): LastfmTagsResult {
    const tags = (raw.toptags?.tag ?? [])
      .map((tag) => tag.name?.toLowerCase().trim())
      .filter((tag): tag is string => Boolean(tag))
    const positiveTags = tags.filter((tag) => POSITIVE_TAGS.has(tag))
    const negativeTags = tags.filter((tag) => NEGATIVE_TAGS.has(tag))
    return {
      source: 'lastfm',
      externalId: matchedName,
      matchedName,
      confidence: positiveTags.length > 0 ? 70 : negativeTags.length > 0 ? 60 : 30,
      raw,
      tags,
      positiveTags,
      negativeTags,
      evidence: {
        kind,
        tags,
        positiveTags,
        negativeTags,
      },
    }
  }
}
