import { neon } from '@neondatabase/serverless'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

const rawDbUrl = process.env.DATABASE_URL?.trim()
const dbUrl = rawDbUrl?.startsWith('psql ') ? rawDbUrl.slice(5) : rawDbUrl

console.log('[DB] NODE_ENV:', process.env.NODE_ENV)
console.log('[DB] VERCEL:', process.env.VERCEL || 'undefined')
console.log('[DB] DATABASE_URL present:', !!process.env.DATABASE_URL)
console.log('[DB] dbUrl present:', !!dbUrl)

export let dbReady = !!dbUrl
let _sqlInitError: string | null = null
let _sql: ReturnType<typeof neon> | null = null

function getSql(): ReturnType<typeof neon> {
  if (_sql) return _sql
  if (!dbReady) throw new Error('DATABASE_URL not configured')
  try {
    const u = new URL(dbUrl!)
    console.log(`[DB] host: ${u.hostname}, protocol: ${u.protocol}, pathname: ${u.pathname}`)
    _sql = neon(dbUrl!)
    console.log('[DB] neon client created OK')
    return _sql
  } catch (e: any) {
    console.error('[DB] Failed to create neon client:', e?.message || e)
    _sqlInitError = e?.message || String(e)
    dbReady = false
    throw new Error('Failed to create database client: ' + _sqlInitError)
  }
}

export interface DbClient {
  query(sqlStr: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }>
  get<T extends Record<string, any> = any>(sqlStr: string, params?: any[]): Promise<T | undefined>
  all<T extends Record<string, any> = any>(sqlStr: string, params?: any[]): Promise<T[]>
  run(sqlStr: string, params?: any[]): Promise<{ lastID: number; changes: number }>
}

export const db: DbClient = {
  async query(sqlStr: string, params?: any[]) {
    if (!dbReady) throw new Error('DATABASE_URL not configured')
    const rows = await getSql().query(sqlStr, params)
    return { rows: rows as any[], rowCount: (rows as any[]).length }
  },
  async get<T extends Record<string, any> = any>(sqlStr: string, params?: any[]) {
    if (!dbReady) throw new Error('DATABASE_URL not configured')
    const rows = await getSql().query(sqlStr, params)
    return (rows as unknown as T[])[0] as T | undefined
  },
  async all<T extends Record<string, any> = any>(sqlStr: string, params?: any[]) {
    if (!dbReady) throw new Error('DATABASE_URL not configured')
    const rows = await getSql().query(sqlStr, params)
    return rows as T[]
  },
  async run(sqlStr: string, params?: any[]) {
    if (!dbReady) throw new Error('DATABASE_URL not configured')
    const rows = await getSql().query(sqlStr, params)
    return { lastID: 0, changes: (rows as any[]).length }
  }
}

export async function getDb(): Promise<DbClient> {
  return db
}

const SCHEMA_QUERIES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'listener', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled', started_at TIMESTAMP, ended_at TIMESTAMP,
    broadcaster_id TEXT NOT NULL, audio_path TEXT, stream_key TEXT, stream_type TEXT DEFAULT 'church_online',
    church_online_url TEXT, thumbnail_url TEXT, speaker TEXT, init_segment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS init_segment TEXT`,
  `CREATE TABLE IF NOT EXISTS sermons (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    speaker TEXT, series TEXT, audio_url TEXT, video_url TEXT, thumbnail_url TEXT, date TEXT NOT NULL, duration INTEGER,
    is_featured BOOLEAN DEFAULT FALSE, play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, broadcast_id TEXT, user_id TEXT, user_name TEXT,
    recipient_id TEXT, guest_name TEXT, message TEXT NOT NULL, is_private BOOLEAN DEFAULT FALSE, reactions TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions TEXT`,
  `CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, day_of_week INTEGER NOT NULL,
    time TEXT NOT NULL, type TEXT DEFAULT 'service', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS guest_speakers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT, photo_url TEXT,
    topic TEXT, date TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS prayer_requests (
    id TEXT PRIMARY KEY, name TEXT, request TEXT NOT NULL, is_anonymous BOOLEAN DEFAULT FALSE,
    prayers_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT,
    time TEXT, location TEXT, image_url TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS featured_sermons (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL UNIQUE, display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT, album TEXT, genre TEXT,
    audio_url TEXT NOT NULL, cover_url TEXT, duration INTEGER, lyrics TEXT,
    file_format TEXT, file_size INTEGER, play_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE music ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS stream_chunks (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    chunk_data TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `DELETE FROM stream_chunks WHERE id NOT IN (SELECT MIN(id) FROM stream_chunks GROUP BY broadcast_id, chunk_index)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_chunks_broadcast_chunk ON stream_chunks (broadcast_id, chunk_index)`,
  `CREATE TABLE IF NOT EXISTS stream_listeners (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, session_id TEXT NOT NULL,
    platform TEXT DEFAULT 'web', last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip TEXT, country TEXT, region TEXT, city TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, amount NUMERIC NOT NULL,
    message TEXT, is_anonymous BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS testimonies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, content TEXT NOT NULL,
    status TEXT DEFAULT 'pending', is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, goal_amount NUMERIC NOT NULL,
    current_amount NUMERIC DEFAULT 0, end_date TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    user_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS fcm_tokens (
    id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, user_id TEXT, platform TEXT DEFAULT 'android',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL, counter INTEGER DEFAULT 0, device_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS daily_verses (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, reference TEXT, type TEXT DEFAULT 'verse',
    created_by TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
]

// ── Multi-tenant schema ────────────────────────────────────────
async function _initTenantSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#c9a227',
    custom_domain TEXT,
    plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  const tablesNeedingTenant = [
    'users','broadcasts','sermons','chat_messages','schedule','music',
    'stream_chunks','stream_listeners','featured_sermons','transcripts',
    'guest_speakers','donations','prayer_requests','prayer_interactions',
    'events','event_rsvps','testimonies','campaigns','newsletter_subscribers',
    'push_subscriptions','webauthn_credentials','fcm_tokens',
    'notification_preferences','notification_log','spiritual_health',
    'playlists','playlist_items','radio_schedules','radio_state','daily_verses'
  ]
  for (const tbl of tablesNeedingTenant) {
    try { await db.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS tenant_id TEXT`) } catch {}
  }

  const defaultTenant = await db.get(`SELECT * FROM tenants WHERE slug=$1`, ['zionite'])
  let defaultTenantId: string
  if (!defaultTenant) {
    defaultTenantId = uuidv4()
    await db.query(`INSERT INTO tenants (id, slug, name, primary_color, plan, status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [defaultTenantId, 'zionite', 'Zionite', '#c9a227', 'pro', 'active'])
  } else {
    defaultTenantId = defaultTenant.id
  }

  for (const tbl of tablesNeedingTenant) {
    try { await db.query(`UPDATE ${tbl} SET tenant_id=$1 WHERE tenant_id IS NULL`, [defaultTenantId]) } catch {}
  }

  return defaultTenantId
}

let _dbInitPromise: Promise<void> | null = null
let _dbInitDone = false

export async function initDb() {
  if (_dbInitDone) return
  if (_dbInitPromise) return _dbInitPromise

  _dbInitPromise = _initDbInternal()
  return _dbInitPromise
}

async function _initDbInternal() {
  console.log('[DB] init starting...')
  try {
    console.log('[DB] testing connection with SELECT 1...')
    await db.query('SELECT 1 as test')
    console.log('[DB] connection OK')
  } catch (e: any) {
    console.error('[DB] connection test failed:', e.message)
    throw e
  }

  for (let i = 0; i < SCHEMA_QUERIES.length; i++) {
    await db.query(SCHEMA_QUERIES[i])
  }
  console.log('[DB] schema OK')

  // Run structured migrations
  const { runMigrations } = await import('./migrations/runner.js')
  await runMigrations()

  // Initialize multi-tenant schema and backfill
  const defaultTenantId = await _initTenantSchema()
  console.log('[DB] tenant schema OK')

  const existingSchedule = await db.get('SELECT * FROM schedule LIMIT 1')
  if (!existingSchedule) {
    await db.run(`
      INSERT INTO schedule (id, title, day_of_week, time, type, tenant_id) VALUES
      ($1, 'Sunday Gathering', 0, '10:00', 'service', $4),
      ($2, 'Midweek Study', 3, '19:00', 'study', $4),
      ($3, 'Prayer Meeting', 5, '18:00', 'prayer', $4)
    `, [uuidv4(), uuidv4(), uuidv4(), defaultTenantId])
    console.log('[DB] schedule seeded')
  }

  const admin = await db.get('SELECT * FROM users WHERE role = $1', ['super_admin'])
  if (!admin) {
    try {
      const hash = await bcrypt.hash('admin123', 10)
      await db.run(
        `INSERT INTO users (id, email, password_hash, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        ['admin-1', 'admin@zionite.online', hash, 'Admin User', 'super_admin', defaultTenantId]
      )
      console.log('[DB] admin seeded')
    } catch (e: any) {
      if (e.code === '23505') {
        console.log('[DB] admin already exists, skipping seed')
      } else {
        console.error('[DB] admin seed error:', e.message)
      }
    }
  }
  console.log('[DB] init complete')
  _dbInitDone = true
}
