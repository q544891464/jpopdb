import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../src/infrastructure/database.service'
import type { RedisService } from '../src/infrastructure/redis.service'
import { HealthService } from '../src/modules/health/health.service'

describe('HealthService', () => {
  it('reports healthy dependencies', async () => {
    const database = { ping: vi.fn().mockResolvedValue(undefined) }
    const redis = { ping: vi.fn().mockResolvedValue(undefined) }
    const service = new HealthService(
      database as unknown as DatabaseService,
      redis as unknown as RedisService,
    )

    const result = await service.check()

    expect(result.status).toBe('ok')
    expect(result.dependencies.database.status).toBe('up')
    expect(result.dependencies.redis.status).toBe('up')
  })

  it('reports a degraded dependency without leaking configuration', async () => {
    const database = { ping: vi.fn().mockRejectedValue(new Error('connection refused')) }
    const redis = { ping: vi.fn().mockResolvedValue(undefined) }
    const service = new HealthService(
      database as unknown as DatabaseService,
      redis as unknown as RedisService,
    )

    const result = await service.check()

    expect(result.status).toBe('degraded')
    expect(result.dependencies.database.error).toBe('connection refused')
  })
})
