import { db, initDb, dbReady } from '../db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function runMigrations() {
  if (!dbReady) { console.error('Database not configured'); process.exit(1) }
  await initDb()

  // Ensure migrations table exists
  await db.run(`CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  const applied = await db.all('SELECT name FROM migrations')
  const appliedSet = new Set(applied.map((a: any) => a.name))

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[MIGRATION] Skipping ${file} (already applied)`)
      continue
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`[MIGRATION] Applying ${file}...`)
    await db.run(sql)
    await db.run('INSERT INTO migrations (name) VALUES ($1)', [file])
    console.log(`[MIGRATION] Applied ${file}`)
  }

  console.log('[MIGRATION] All migrations up to date')
  process.exit(0)
}

runMigrations().catch(err => {
  console.error('[MIGRATION] Error:', err)
  process.exit(1)
})
