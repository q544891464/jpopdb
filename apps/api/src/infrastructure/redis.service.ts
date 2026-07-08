import { Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
  )

  constructor() {
    // Health checks report availability; this listener prevents ioredis from
    // treating an expected local Redis restart as an unhandled error event.
    this.client.on('error', () => undefined)
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect()
    }
    await this.client.ping()
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      this.client.disconnect()
    }
  }
}
