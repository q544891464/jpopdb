import { Pool } from 'pg'

import { readMigrationFiles } from './migration-files'

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://jmusic:jmusic@localhost:5432/jmusic',
  })
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query('SELECT pg_advisory_lock($1)', [728104])

    const migrations = await readMigrationFiles()
    const appliedResult = await client.query<{ name: string }>('SELECT name FROM schema_migrations')
    const applied = new Set(appliedResult.rows.map((row) => row.name))

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name])
        await client.query('COMMIT')
        console.log(`Applied ${migration.name}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [728104]).catch(() => undefined)
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed')
  process.exitCode = 1
})
