import { readMigrationFiles } from './migration-files'

const requiredTables = [
  'songs',
  'artists',
  'albums',
  'song_artists',
  'playlists',
  'playlist_songs',
  'external_matches',
  'artist_identity',
  'song_screening',
  'review_records',
  'sync_jobs',
  'sync_job_items',
]

async function main(): Promise<void> {
  const migrations = await readMigrationFiles()

  if (migrations.length === 0) {
    throw new Error('No migration files found')
  }

  const combinedSql = migrations.map((migration) => migration.sql).join('\n')
  const missingTables = requiredTables.filter(
    (table) => !new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`,
      'iu',
    ).test(combinedSql),
  )

  if (missingTables.length > 0) {
    throw new Error(`Migrations are missing required tables: ${missingTables.join(', ')}`)
  }

  console.log(`Migration check passed (${migrations.length} file).`)
}

void main()
