import type { SyncJobResponse } from '../import/sync-job.types'

export type ArtistIdentityStatus =
  | 'confirmed_by_api'
  | 'confirmed_by_manual'
  | 'pending'
  | 'rejected'
  | 'unknown'

export type ArtistIdentityResponse = {
  artistId: string
  neteaseArtistId: string | null
  artistName: string
  songCount: number
  isJapanese: boolean | null
  country: string | null
  confidence: number | null
  status: ArtistIdentityStatus
  sourceSummary: unknown
  reviewedBy: string | null
  reviewedAt: string | null
  updatedAt: string | null
  rescreenJob?: SyncJobResponse | null
  rescreenSongCount?: number
  importJob?: SyncJobResponse | null
}

export type ArtistIdentityListResponse = {
  items: ArtistIdentityResponse[]
}

export type ArtistIdentityReviewRequest = {
  isJapanese: boolean
  reviewer?: string
  reason?: string
  rescreenSongs?: boolean
}
