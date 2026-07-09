import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import Redis from 'ioredis'
import { Pool } from 'pg'

import { loadWorkerConfig } from './config'
import {
  CatalogStatsSyncProcessor,
  CATALOG_STATS_SYNC_JOB,
  type CatalogStatsSyncJobData,
} from './catalog/catalog-stats-sync.processor'
import { CatalogStatsSyncRepository } from './catalog/catalog-stats-sync.repository'
import { PlaylistImportProcessor, PLAYLIST_IMPORT_JOB } from './import/playlist-import.processor'
import type { PlaylistImportJobData } from './import/playlist-import.processor'
import {
  ArtistSongImportProcessor,
  ARTIST_SONG_IMPORT_JOB,
} from './import/artist-song-import.processor'
import type { ArtistSongImportJobData } from './import/artist-song-import.processor'
import { PlaylistImportRepository } from './import/playlist-import.repository'
import { NeteaseClient } from './netease/netease.client'
import { LastfmClient } from './external/lastfm.client'
import { MusicBrainzClient } from './external/musicbrainz.client'
import { WikidataClient } from './external/wikidata.client'
import { ScreeningRepository } from './screening/screening.repository'
import { SongScreeningProcessor, SONG_SCREENING_JOB } from './screening/song-screening.processor'
import type { SongScreeningJobData } from './screening/screening.types'
import { recoverStuckSyncJobs } from './sync-job-recovery'

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig()
  const redisUrl = new URL(config.redisUrl)
  const database = new Pool({
    connectionString: config.databaseUrl,
    max: readPositiveInteger(process.env.WORKER_DB_POOL_MAX, 5),
    statement_timeout: readPositiveInteger(process.env.WORKER_DB_STATEMENT_TIMEOUT_MS, 60_000),
  })
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null })

  connection.on('error', (error) => {
    console.error(`Worker Redis connection error: ${error.message}`)
  })

  await database.query('SELECT 1')
  await connection.ping()
  const queueConnectionOptions = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  }
  const recoveryQueue = new Queue<
    PlaylistImportJobData | ArtistSongImportJobData | SongScreeningJobData | CatalogStatsSyncJobData
  >('jpopdb-jobs', {
    connection: queueConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  })

  const recoveredJobs = await recoverStuckSyncJobs(database, recoveryQueue)
  if (recoveredJobs > 0) {
    console.log(`Recovered ${recoveredJobs} pending sync job(s) into Redis queue`)
  }

  const neteaseClient = new NeteaseClient(config.neteaseApiBaseUrl)
  const playlistImports = new PlaylistImportProcessor(
    neteaseClient,
    new PlaylistImportRepository(database),
  )
  const artistSongImports = new ArtistSongImportProcessor(
    neteaseClient,
    new PlaylistImportRepository(database),
  )
  const catalogStatsSync = new CatalogStatsSyncProcessor(
    neteaseClient,
    new CatalogStatsSyncRepository(database),
  )
  const songScreening = new SongScreeningProcessor(
    new ScreeningRepository(database),
    new MusicBrainzClient(config.musicBrainzAppName, config.musicBrainzContactEmail),
    new WikidataClient(),
    new LastfmClient(config.lastfmApiKey),
    neteaseClient,
  )

  const worker = new Worker<
    PlaylistImportJobData | ArtistSongImportJobData | SongScreeningJobData | CatalogStatsSyncJobData
  >(
    'jpopdb-jobs',
    async (job) => {
      if (job.name === PLAYLIST_IMPORT_JOB) {
        await playlistImports.process(job as Job<PlaylistImportJobData>)
        return
      }
      if (job.name === ARTIST_SONG_IMPORT_JOB) {
        await artistSongImports.process(job as Job<ArtistSongImportJobData>)
        return
      }
      if (job.name === SONG_SCREENING_JOB) {
        await songScreening.process(job as Job<SongScreeningJobData>)
        return
      }
      if (job.name === CATALOG_STATS_SYNC_JOB) {
        await catalogStatsSync.process(job as Job<CatalogStatsSyncJobData>)
        return
      }
      throw new Error(`Unknown job type: ${job.name}`)
    },
    {
      connection: queueConnectionOptions,
      concurrency: 1,
    },
  )

  worker.on('error', (error) => {
    console.error(`Worker queue error: ${error.message}`)
  })

  const shutdown = async (): Promise<void> => {
    await worker.close()
    await recoveryQueue.close()
    await database.end()
    connection.disconnect()
  }

  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())

  console.log('J-Pop DB worker is ready')
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Worker failed to start')
  process.exitCode = 1
})
