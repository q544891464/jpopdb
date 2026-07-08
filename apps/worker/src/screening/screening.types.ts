import type {
  LastfmTagsResult,
  MusicBrainzArtistResult,
  WikidataArtistResult,
} from '../external/external.types'

export type ScreeningStatus = 'accepted' | 'pending' | 'rejected'

export type SongScreeningJobData = {
  syncJobId: string
  status?: ScreeningStatus
  limit?: number
  songId?: string
  artistId?: string
}

export type ScreeningCandidate = {
  songId: string
  neteaseSongId: string
  songName: string
  albumName: string | null
  artists: ScreeningCandidateArtist[]
  playlistNames: string[]
  reviewedAt: Date | null
}

export type ScreeningCandidateArtist = {
  artistId: string
  artistName: string
  identity: ArtistIdentity | null
}

export type LyricsCache = {
  songId: string
  rawLrc: string | null
  translatedLrc: string | null
  kanaCount: number | null
  kanaRatio: number | null
  languageGuess: string | null
  lastFetchAt: Date
}

export type ArtistIdentity = {
  artistId: string
  artistName?: string
  isJapanese: boolean | null
  country: string | null
  confidence: number | null
  status: 'confirmed_by_api' | 'confirmed_by_manual' | 'pending' | 'rejected' | 'unknown'
  reviewedAt: Date | null
}

export type ScreeningArtistIdentityEvidence = ArtistIdentity & {
  reused: boolean
  manual: boolean
}

export type ScreeningReason = {
  score: number
  status: ScreeningStatus
  positive: Array<Record<string, unknown>>
  negative: Array<Record<string, unknown>>
  fallback: {
    lyric_checked: boolean
    skipped_reason?: string
    passed?: boolean
    kana_count?: number
    kana_ratio?: number
    language_guess?: string
    source?: 'netease_lyric'
    cached?: boolean
  }
  external: {
    musicbrainz?: MusicBrainzArtistResult | null
    wikidata?: WikidataArtistResult | null
    lastfmArtist?: LastfmTagsResult | null
    lastfmTrack?: LastfmTagsResult | null
    artistLookups?: Array<{
      artistId: string
      artistName: string
      musicbrainz?: MusicBrainzArtistResult | null
      wikidata?: WikidataArtistResult | null
    }>
    skipped?: string[]
  }
  artist_identity?: ScreeningArtistIdentityEvidence | null
  artist_identities?: ScreeningArtistIdentityEvidence[]
  summary: string
  latest_auto_suggestion?: {
    score: number
    status: ScreeningStatus
    summary: string
    suggestedAt: string
  }
}
