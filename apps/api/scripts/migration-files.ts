import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export type MigrationFile = {
  name: string
  sql: string
}

export async function readMigrationFiles(): Promise<MigrationFile[]> {
  const migrationsDirectory = path.resolve(process.cwd(), 'migrations')
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()

  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(path.join(migrationsDirectory, name), 'utf8'),
    })),
  )
}
