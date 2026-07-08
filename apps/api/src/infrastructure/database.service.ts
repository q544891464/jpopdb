import { Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import { Pool } from 'pg'
import type { QueryResult, QueryResultRow } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://jmusic:jmusic@localhost:5432/jmusic',
    max: readPositiveInteger(process.env.DB_POOL_MAX, 10),
    connectionTimeoutMillis: 3_000,
    statement_timeout: readPositiveInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 15_000),
  })

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1')
  }

  async query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values])
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
