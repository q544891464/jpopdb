export type ExternalSource = 'musicbrainz' | 'wikidata' | 'lastfm'

export type ExternalErrorCategory =
  | 'network_error'
  | 'timeout'
  | 'rate_limited'
  | 'not_found'
  | 'ambiguous_match'
  | 'parse_error'
  | 'unknown_error'

export type ExternalMatchResult = {
  source: ExternalSource
  externalId?: string
  matchedName?: string
  confidence: number
  raw: unknown
  evidence: Record<string, unknown>
}

export type MusicBrainzArtistResult = ExternalMatchResult & {
  source: 'musicbrainz'
  mbid?: string
  isJapanese: boolean | null
  country?: string
  wikidataUrl?: string
}

export type WikidataArtistResult = ExternalMatchResult & {
  source: 'wikidata'
  entityId?: string
  isJapanese: boolean | null
  country?: string
}

export type LastfmTagsResult = ExternalMatchResult & {
  source: 'lastfm'
  tags: string[]
  positiveTags: string[]
  negativeTags: string[]
}
