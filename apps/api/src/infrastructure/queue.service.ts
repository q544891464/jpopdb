import { Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import { Queue } from 'bullmq'

export const JOB_QUEUE_NAME = 'jpopdb-jobs'
export const PLAYLIST_IMPORT_JOB = 'playlist-import'
export const ARTIST_SONG_IMPORT_JOB = 'artist-song-import'
export const SONG_SCREENING_JOB = 'screen-songs'
export const CATALOG_STATS_SYNC_JOB = 'catalog-stats-sync'

export type PlaylistImportJobData = {
  syncJobId: string
  playlistId: string
}

export type SongScreeningJobData = {
  syncJobId: string
  status?: 'accepted' | 'pending' | 'rejected'
  limit?: number
  songId?: string
  artistId?: string
}

export type ArtistSongImportJobData = {
  syncJobId: string
  artistId: string
  neteaseArtistId: string
  artistName: string
  maxSongs: number
  offset?: number
}

export type CatalogStatsSyncJobData = {
  syncJobId: string
  limit: number | null
  missingOnly: boolean
  all: boolean
}

function getConnectionOptions(redisUrlValue: string): {
  host: string
  port: number
  username?: string
  password?: string
  db: number
} {
  const redisUrl = new URL(redisUrlValue)
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
  }
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue = new Queue<
    PlaylistImportJobData | ArtistSongImportJobData | SongScreeningJobData | CatalogStatsSyncJobData
  >(JOB_QUEUE_NAME, {
    connection: getConnectionOptions(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  })

  async enqueuePlaylistImport(data: PlaylistImportJobData): Promise<void> {
    await this.queue.add(PLAYLIST_IMPORT_JOB, data, {
      jobId: `${PLAYLIST_IMPORT_JOB}-${data.syncJobId}`,
    })
  }

  async enqueueSongScreening(data: SongScreeningJobData): Promise<void> {
    await this.queue.add(SONG_SCREENING_JOB, data, {
      jobId: `${SONG_SCREENING_JOB}-${data.syncJobId}`,
    })
  }

  async enqueueArtistSongImport(data: ArtistSongImportJobData): Promise<void> {
    await this.queue.add(ARTIST_SONG_IMPORT_JOB, data, {
      jobId: `${ARTIST_SONG_IMPORT_JOB}-${data.syncJobId}`,
    })
  }

  async enqueueCatalogStatsSync(data: CatalogStatsSyncJobData): Promise<void> {
    await this.queue.add(CATALOG_STATS_SYNC_JOB, data, {
      jobId: `${CATALOG_STATS_SYNC_JOB}-${data.syncJobId}`,
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
