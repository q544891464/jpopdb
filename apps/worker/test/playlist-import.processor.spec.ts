import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'

import {
  PlaylistImportProcessor,
  type PlaylistImportJobData,
} from '../src/import/playlist-import.processor'
import type { PlaylistImportRepository } from '../src/import/playlist-import.repository'
import type { NeteaseClient } from '../src/netease/netease.client'

describe('PlaylistImportProcessor', () => {
  it('persists imported songs with best-effort catalog stats', async () => {
    const song = {
      id: 99,
      name: 'アイドル',
      ar: [{ id: 10, name: 'YOASOBI' }],
      al: { id: 20, name: 'THE BOOK 3', picUrl: 'https://example.test/cover.jpg' },
      dt: 213000,
      pop: 98,
    }
    const stats = {
      publishTime: new Date('2024-01-02T00:00:00.000Z'),
      popularity: 98,
      redCount: 12345,
      commentCount: 678,
      raw: { detail: {}, red: {}, comments: {} },
    }
    const netease = {
      getPlaylistDetail: vi.fn().mockResolvedValue({
        playlist: { id: 1, name: 'J-Pop', trackIds: [{ id: 99 }] },
        trackIds: ['99'],
        raw: {},
      }),
      getSongDetails: vi.fn().mockResolvedValue([{ songs: [song], raw: {} }]),
      getSongWikiSummary: vi.fn().mockResolvedValue({ tags: [{ group: '曲风', value: 'J-Pop', raw: {} }] }),
      getCatalogStats: vi.fn().mockResolvedValue(stats),
    }
    const repository = {
      markRunning: vi.fn().mockResolvedValue(undefined),
      upsertPlaylist: vi.fn().mockResolvedValue('1'),
      setTotal: vi.fn().mockResolvedValue(undefined),
      persistSong: vi.fn().mockResolvedValue('99'),
      recordSongJobItem: vi.fn().mockResolvedValue(undefined),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      prunePlaylistSongs: vi.fn().mockResolvedValue(undefined),
      markFinished: vi.fn().mockResolvedValue(undefined),
      markRetry: vi.fn().mockResolvedValue(undefined),
    }
    const processor = new PlaylistImportProcessor(
      netease as unknown as NeteaseClient,
      repository as unknown as PlaylistImportRepository,
    )
    const job = {
      data: { syncJobId: '7', playlistId: '1' },
      updateProgress: vi.fn().mockResolvedValue(undefined),
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job<PlaylistImportJobData>

    await processor.process(job)

    expect(netease.getCatalogStats).toHaveBeenCalledWith('99', '20')
    expect(repository.persistSong).toHaveBeenCalledWith(
      '1',
      song,
      0,
      [{ group: '曲风', value: 'J-Pop', raw: {} }],
      stats,
    )
    expect(repository.recordSongJobItem).toHaveBeenCalledWith('7', expect.objectContaining({
      songId: '99',
      status: 'success',
      message: expect.stringContaining('红心 12345'),
    }))
  })
})
