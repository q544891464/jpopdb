import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'

import {
  CatalogStatsSyncProcessor,
  type CatalogStatsSyncJobData,
} from '../src/catalog/catalog-stats-sync.processor'
import type { CatalogStatsSyncRepository } from '../src/catalog/catalog-stats-sync.repository'
import type { NeteaseClient } from '../src/netease/netease.client'

describe('CatalogStatsSyncProcessor', () => {
  it('updates song stats and records processed song items', async () => {
    const target = {
      songId: '1',
      neteaseSongId: '99',
      songName: 'アイドル',
      artistNames: ['YOASOBI'],
      albumId: '2',
      neteaseAlbumId: '20',
    }
    const stats = {
      publishTime: new Date('2024-01-02T00:00:00.000Z'),
      popularity: 88,
      redCount: 12345,
      commentCount: 678,
      raw: { detail: {}, red: {}, comments: {} },
    }
    const repository = {
      markRunning: vi.fn().mockResolvedValue(undefined),
      findTargets: vi.fn().mockResolvedValue([target]),
      setTotal: vi.fn().mockResolvedValue(undefined),
      updateJobMetadata: vi.fn().mockResolvedValue(undefined),
      updateStats: vi.fn().mockResolvedValue(undefined),
      recordSongItem: vi.fn().mockResolvedValue(undefined),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      markFinished: vi.fn().mockResolvedValue(undefined),
      markRetry: vi.fn().mockResolvedValue(undefined),
    }
    const netease = { getCatalogStats: vi.fn().mockResolvedValue(stats) }
    const processor = new CatalogStatsSyncProcessor(
      netease as unknown as NeteaseClient,
      repository as unknown as CatalogStatsSyncRepository,
    )
    const job = {
      data: { syncJobId: '88', limit: 100, missingOnly: true },
      updateProgress: vi.fn().mockResolvedValue(undefined),
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job<CatalogStatsSyncJobData>

    await processor.process(job)

    expect(repository.findTargets).toHaveBeenCalledWith(100, true)
    expect(netease.getCatalogStats).toHaveBeenCalledWith('99', '20')
    expect(repository.updateStats).toHaveBeenCalledWith(target, stats)
    expect(repository.recordSongItem).toHaveBeenCalledWith('88', expect.objectContaining({
      songId: '1',
      neteaseSongId: '99',
      songName: 'アイドル',
      artistNames: ['YOASOBI'],
      status: 'success',
    }))
    expect(repository.markFinished).toHaveBeenCalledWith('88', 'success', 1, 0, null)
  })
})
