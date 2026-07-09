export type CatalogArtistSummary = {
  artistId: string
  artistName: string
  neteaseArtistId: string | null
}

export type CatalogSongTag = {
  source: string
  group: string
  name: string
}

export type CatalogArtistListItem = CatalogArtistSummary & {
  songCount: number
  albumCount: number
  latestPublishTime: string | null
  coverUrl: string | null
  updatedAt: string
}

export type CatalogSongSummary = {
  songId: string
  neteaseSongId: string
  songName: string
  aliases: string[]
  artists: CatalogArtistSummary[]
  albumId: string | null
  albumName: string | null
  publishTime: string | null
  durationMs: number | null
  coverUrl: string | null
  neteaseUrl: string | null
  popularity: number | null
  redCount: number | null
  commentCount: number | null
  tags: CatalogSongTag[]
  statsUpdatedAt: string | null
  updatedAt: string
}

export type CatalogSongQuality = {
  level: 'low' | 'medium' | 'high' | 'lossless' | 'hires'
  label: string
  bitrate: number | null
  size: number | null
  extension: string | null
}

export type CatalogLyricSummary = {
  hasOriginal: boolean
  hasTranslation: boolean
  hasRomanization: boolean
  originalLineCount: number
  translatedLineCount: number
  romanizedLineCount: number
  kanaCount: number
  kanaRatio: number
  languageGuess: 'ja' | 'unknown'
  lyricContributor: string | null
  translationContributor: string | null
  lyricUpdatedAt: string | null
  translationUpdatedAt: string | null
}

export type CatalogAlbumDetail = {
  neteaseAlbumId: string | null
  name: string | null
  type: string | null
  subType: string | null
  company: string | null
  publishTime: string | null
  size: number | null
  aliases: string[]
  tags: string[]
  description: string | null
  artistName: string | null
  coverUrl: string | null
}

export type CatalogWikiTag = {
  group: string
  values: string[]
}

export type CatalogNeteaseDetail = {
  mainTitle: string | null
  additionalTitle: string | null
  disc: string | null
  trackNo: number | null
  mvId: string | null
  fee: number | null
  copyright: number | null
  availability: {
    playable: boolean | null
    message: string | null
  }
  qualities: CatalogSongQuality[]
  album: CatalogAlbumDetail | null
  lyric: CatalogLyricSummary | null
  wikiTags: CatalogWikiTag[]
  fetchedAt: string
  availableSources: string[]
}

export type CatalogSongDetail = CatalogSongSummary & {
  neteaseDetail: CatalogNeteaseDetail | null
}

export type CatalogSongListResponse = {
  items: CatalogSongSummary[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export type CatalogArtistListResponse = {
  items: CatalogArtistListItem[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export type CatalogArtistDetail = CatalogArtistListItem & {
  songs: CatalogSongListResponse
}

export type CatalogAlbumPage = {
  albumId: string
  neteaseAlbumId: string | null
  albumName: string | null
  publishTime: string | null
  coverUrl: string | null
  songCount: number
  updatedAt: string
  artists: CatalogArtistSummary[]
  songs: CatalogSongListResponse
}
