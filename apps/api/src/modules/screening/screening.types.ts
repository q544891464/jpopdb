export type ScreeningStatus = 'accepted' | 'pending' | 'rejected'

export type ScreeningJobRequest = {
  status?: ScreeningStatus
  limit?: number
}

export type CandidateFilter =
  | 'all'
  | 'manual_artist'
  | 'needs_artist_review'
  | 'manual_artist_pending'
  | 'high_score_pending'
  | 'lyric_fallback'

export type ScreeningStatsResponse = {
  totalSongs: number
  acceptedSongs: number
  pendingSongs: number
  rejectedSongs: number
  unscreenedSongs: number
  manuallyReviewedSongs: number
  manualArtistSongs: number
  needsArtistReviewSongs: number
  manualArtistPendingSongs: number
  highScorePendingSongs: number
  lyricFallbackSongs: number
  confirmedArtists: number
  manualConfirmedArtists: number
  lastfmConfigured: boolean
}

export type CandidateArtistIdentityResponse = {
  artistId: string
  artistName: string
  neteaseArtistId: string | null
  isJapanese: boolean | null
  country: string | null
  confidence: number | null
  status: 'confirmed_by_api' | 'confirmed_by_manual' | 'pending' | 'rejected' | 'unknown'
  reviewedBy: string | null
  reviewedAt: string | null
}

export type CandidateSongResponse = {
  songId: string
  neteaseSongId: string
  songName: string
  artistNames: string[]
  artistIdentities: CandidateArtistIdentityResponse[]
  albumName: string | null
  playlistNames: string[]
  score: number
  status: ScreeningStatus
  isJapaneseCandidate: boolean
  reason: unknown
  reviewedBy: string | null
  reviewedAt: string | null
  updatedAt: string
}

export type CandidateListResponse = {
  items: CandidateSongResponse[]
}

export type ManualReviewRequest = {
  status: ScreeningStatus
  reviewer?: string
  reason?: string
}
