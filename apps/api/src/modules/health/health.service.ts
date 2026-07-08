import { Inject, Injectable } from '@nestjs/common'

import { DatabaseService } from '../../infrastructure/database.service'
import { RedisService } from '../../infrastructure/redis.service'
import type { DependencyStatus, HealthResponse } from './health.types'

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.checkDependency(() => this.database.ping()),
      this.checkDependency(() => this.redis.ping()),
    ])

    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      service: 'jpopdb-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: { database, redis },
    }
  }

  private async checkDependency(check: () => Promise<void>): Promise<DependencyStatus> {
    const startedAt = performance.now()

    try {
      await check()
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) }
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Dependency unavailable',
      }
    }
  }
}
