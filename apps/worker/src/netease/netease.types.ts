export type NeteaseArtist = {
  id: number
  name: string
  alias?: unknown
  tns?: unknown
}

export type NeteaseAlbum = {
  id: number
  name: string
  picUrl?: string | null
  tns?: unknown
}

export type NeteaseSong = {
  id: number
  name: string
  alia?: unknown
  tns?: unknown
  ar: NeteaseArtist[]
  al: NeteaseAlbum
  dt?: number | null
  pop?: number | null
  publishTime?: number | null
}

export type NeteasePlaylist = {
  id: number
  name: string
  description?: string | null
  coverImgUrl?: string | null
  trackCount?: number
  creator?: { nickname?: string | null } | null
  tracks?: NeteaseSong[]
  trackIds?: Array<{ id: number }>
}

export type NeteasePlaylistResult = {
  playlist: NeteasePlaylist
  trackIds: string[]
  raw: unknown
}

export type NeteaseSongResult = {
  songs: NeteaseSong[]
  raw: unknown
}

export type NeteaseArtistSongsResult = {
  songs: NeteaseSong[]
  total: number
  truncated: boolean
  rawPages: unknown[]
}

export type NeteaseLyricResult = {
  rawLrc: string | null
  translatedLrc: string | null
  raw: unknown
}

export type ExternalErrorCategory =
  | 'network_error'
  | 'timeout'
  | 'rate_limited'
  | 'not_found'
  | 'parse_error'
  | 'unknown_error'
