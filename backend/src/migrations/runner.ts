import { readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { db } from '../db.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const migrationDir = join(__dirname)
  const files = readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const name = basename(file, '.sql')
    const existing = await db.get('SELECT * FROM migrations WHERE name = $1', [name])
    if (existing) continue

    console.log(`[MIGRATION] applying ${name}...`)
    const sql = readFileSync(join(migrationDir, file), 'utf-8')
    // Strip single-line and block comments before splitting
    const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const statements = cleanSql.split(';').map(s => s.trim()).filter(s => s.length > 0)

    for (const stmt of statements) {
      try {
        await db.query(stmt)
      } catch (err: any) {
        if (err.message?.includes('already exists') || err.message?.includes('duplicate column')) {
          console.log(`[MIGRATION] ${name} skipped (already applied): ${err.message}`)
        } else {
          throw err
        }
      }
    }

    await db.query('INSERT INTO migrations (name) VALUES ($1)', [name])
    console.log(`[MIGRATION] ${name} applied`)
  }
}
