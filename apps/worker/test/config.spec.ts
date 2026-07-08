import { describe, expect, it } from 'vitest'

import { loadWorkerConfig } from '../src/config'

describe('loadWorkerConfig', () => {
  it('loads explicit infrastructure URLs', () => {
    expect(
      loadWorkerConfig({
        DATABASE_URL: 'postgres://example/database',
        REDIS_URL: 'redis://example:6379',
        NETEASE_API_BASE_URL: 'http://netease.example',
        MUSICBRAINZ_APP_NAME: 'jmusic-test',
        MUSICBRAINZ_CONTACT_EMAIL: 'dev@example.com',
        LASTFM_API_KEY: 'lastfm-key',
      }),
    ).toEqual({
      databaseUrl: 'postgres://example/database',
      redisUrl: 'redis://example:6379',
      neteaseApiBaseUrl: 'http://netease.example',
      musicBrainzAppName: 'jmusic-test',
      musicBrainzContactEmail: 'dev@example.com',
      lastfmApiKey: 'lastfm-key',
    })
  })
})
