import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { config as loadDotenv } from 'dotenv'

export type WorkerConfig = {
  databaseUrl: string
  redisUrl: string
  neteaseApiBaseUrl: string
  musicBrainzAppName: string
  musicBrainzContactEmail?: string
  lastfmApiKey?: string
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  loadWorkerDotenv()
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://jmusic:jmusic@localhost:5432/jmusic',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    neteaseApiBaseUrl: env.NETEASE_API_BASE_URL ?? 'http://182.92.153.82:3000',
    musicBrainzAppName: env.MUSICBRAINZ_APP_NAME ?? 'jpopdb-local',
    musicBrainzContactEmail: env.MUSICBRAINZ_CONTACT_EMAIL,
    lastfmApiKey: env.LASTFM_API_KEY,
  }
}

function loadWorkerDotenv(): void {
  for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '..', '.env')]) {
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false, quiet: true })
    }
  }
}
