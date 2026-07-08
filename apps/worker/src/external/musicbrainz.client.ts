import { ExternalApiError } from './external-api-error'
import type { MusicBrainzArtistResult } from './external.types'
import { HttpJsonClient } from './http-json.client'

type MusicBrainzSearchResponse = {
  artists?: Array<{
    id?: string
    name?: string
    score?: number
    country?: string
    area?: { name?: string; 'iso-3166-1-codes'?: string[] }
    'begin-area'?: { name?: string; 'iso-3166-1-codes'?: string[] }
    relations?: Array<{
      type?: string
      url?: { resource?: string }
    }>
  }>
}

export class MusicBrainzClient {
  private readonly http: HttpJsonClient

  constructor(appName: string, contactEmail?: string) {
    const contact = contactEmail ? ` (${contactEmail})` : ''
    this.http = new HttpJsonClient({
      source: 'musicbrainz',
      baseUrl: 'https://musicbrainz.org/ws/2/',
      timeoutMs: 6_000,
      retries: 1,
      minDelayMs: 1_100,
      headers: {
        'User-Agent': `${appName}/0.1${contact}`,
        Accept: 'application/json',
      },
    })
  }

  async searchArtist(artistName: string): Promise<MusicBrainzArtistResult | null> {
    const raw = await this.http.get<MusicBrainzSearchResponse>('artist', {
      query: `artist:"${artistName.replaceAll('"', '')}"`,
      fmt: 'json',
      limit: 5,
      inc: 'url-rels',
    })
    const candidates = raw.artists ?? []
    if (candidates.length === 0) {
      return null
    }

    const top = candidates[0]
    if (!top?.id) {
      throw new ExternalApiError('MusicBrainz artist response is invalid', 'musicbrainz', 'parse_error')
    }
    const confidence = Math.max(0, Math.min(100, Number(top.score ?? 0)))
    const country = top.country ?? top.area?.['iso-3166-1-codes']?.[0]
    const isJapanArea =
      country === 'JP' ||
      top.area?.name?.toLowerCase() === 'japan' ||
      top['begin-area']?.name?.toLowerCase() === 'japan'
    const wikidataUrl = top.relations?.find((relation) => relation.type === 'wikidata')?.url?.resource

    return {
      source: 'musicbrainz',
      mbid: top.id,
      externalId: top.id,
      matchedName: top.name,
      confidence,
      raw,
      isJapanese: isJapanArea ? true : country ? false : null,
      country,
      wikidataUrl,
      evidence: {
        searchedName: artistName,
        score: top.score ?? null,
        country: country ?? null,
        area: top.area?.name ?? null,
        beginArea: top['begin-area']?.name ?? null,
        candidateCount: candidates.length,
        wikidataUrl: wikidataUrl ?? null,
      },
    }
  }
}
