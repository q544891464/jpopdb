import { describe, expect, it, vi } from 'vitest'

import { ScreeningRepository } from '../src/screening/screening.repository'

describe('ScreeningRepository', () => {
  it('upserts external matches by target and source', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }
    const repository = new ScreeningRepository(pool as never)

    await repository.saveExternalMatch('artist', '42', {
      source: 'lastfm',
      externalId: 'lastfm:Aimer',
      matchedName: 'Aimer',
      confidence: 85,
      raw: { name: 'Aimer' },
      evidence: { tags: ['j-pop'] },
    })

    expect(String(pool.query.mock.calls[0]?.[0])).toContain(
      'ON CONFLICT (target_type, target_id, source) DO UPDATE',
    )
    expect(pool.query.mock.calls[0]?.[1]).toEqual([
      'artist',
      '42',
      'lastfm',
      'lastfm:Aimer',
      'Aimer',
      85,
      JSON.stringify({ raw: { name: 'Aimer' }, evidence: { tags: ['j-pop'] } }),
    ])
  })
})
