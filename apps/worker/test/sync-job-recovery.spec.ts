import type { Queue } from 'bullmq'
import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { recoverStuckSyncJobs } from '../src/sync-job-recovery'

describe('recoverStuckSyncJobs', () => {
  it('requeues recoverable pending sync jobs with deterministic job ids', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { id: '1', job_type: 'playlist_import', source_id: '60198', metadata: {} },
            { id: '2', job_type: 'artist_song_import', source_id: 'artist:10:netease:20', metadata: {} },
            { id: '3', job_type: 'song_screening', source_id: 'pending:50', metadata: {} },
            { id: '4', job_type: 'song_screening', source_id: 'song:100', metadata: {} },
            { id: '5', job_type: 'song_screening', source_id: 'artist:10', metadata: {} },
            {
              id: '6',
              job_type: 'catalog_stats_sync',
              source_id: 'catalog_stats',
              metadata: { limit: 100, missingOnly: true },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: '10', netease_artist_id: '20', name: 'Aimer' }],
        }),
    } as unknown as Pool
    const queue = { add: vi.fn().mockResolvedValue({}) } as unknown as Queue

    const recovered = await recoverStuckSyncJobs(database, queue)

    expect(recovered).toBe(6)
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'playlist-import',
      { syncJobId: '1', playlistId: '60198' },
      { jobId: 'playlist-import-1' },
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'artist-song-import',
      {
        syncJobId: '2',
        artistId: '10',
        neteaseArtistId: '20',
        artistName: 'Aimer',
        maxSongs: 500,
        offset: 0,
      },
      { jobId: 'artist-song-import-2' },
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      3,
      'screen-songs',
      { syncJobId: '3', status: 'pending', limit: 50 },
      { jobId: 'screen-songs-3' },
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      4,
      'screen-songs',
      { syncJobId: '4', songId: '100', limit: 1 },
      { jobId: 'screen-songs-4' },
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      5,
      'screen-songs',
      { syncJobId: '5', artistId: '10', limit: 200 },
      { jobId: 'screen-songs-5' },
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      6,
      'catalog-stats-sync',
      { syncJobId: '6', limit: 100, missingOnly: true },
      { jobId: 'catalog-stats-sync-6' },
    )
  })

  it('skips malformed artist import jobs that cannot be reconstructed safely', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ id: '9', job_type: 'artist_song_import', source_id: 'artist:bad', metadata: {} }],
      }),
    } as unknown as Pool
    const queue = { add: vi.fn().mockResolvedValue({}) } as unknown as Queue

    const recovered = await recoverStuckSyncJobs(database, queue)

    expect(recovered).toBe(0)
    expect(queue.add).not.toHaveBeenCalled()
  })
})
