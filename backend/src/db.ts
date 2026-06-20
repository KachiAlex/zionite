import { neon } from '@neondatabase/serverless'
import { v4 as uuidv4 } from 'uuid'

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
    church_online_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sermons (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    speaker TEXT, series TEXT, audio_url TEXT, video_url TEXT, thumbnail_url TEXT, date TEXT NOT NULL, duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, broadcast_id TEXT, user_id TEXT, user_name TEXT,
    recipient_id TEXT, guest_name TEXT, message TEXT NOT NULL, is_private BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, day_of_week INTEGER NOT NULL,
    time TEXT NOT NULL, type TEXT DEFAULT 'service', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS guest_speakers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT, photo_url TEXT,
    topic TEXT, date TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS podcasts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, speaker TEXT, duration TEXT,
    audio_url TEXT, description TEXT, date TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    file_format TEXT, file_size INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stream_listeners (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, session_id TEXT NOT NULL,
    platform TEXT DEFAULT 'web', last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  )`
]

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

  // Migration: add video_url and thumbnail_url to sermons if missing
  try {
    await db.query(`ALTER TABLE sermons ADD COLUMN video_url TEXT`)
    console.log('[DB] migration: added video_url to sermons')
  } catch { /* already exists */ }
  try {
    await db.query(`ALTER TABLE sermons ADD COLUMN thumbnail_url TEXT`)
    console.log('[DB] migration: added thumbnail_url to sermons')
  } catch { /* already exists */ }

  const existingSchedule = await db.get('SELECT * FROM schedule LIMIT 1')
  if (!existingSchedule) {
    await db.run(`
      INSERT INTO schedule (id, title, day_of_week, time, type) VALUES
      ($1, 'Sunday Gathering', 0, '10:00', 'service'),
      ($2, 'Midweek Study', 3, '19:00', 'study'),
      ($3, 'Prayer Meeting', 5, '18:00', 'prayer')
    `, [uuidv4(), uuidv4(), uuidv4()])
    console.log('[DB] schedule seeded')
  }

  const admin = await db.get('SELECT * FROM users WHERE role = $1', ['admin'])
  if (!admin) {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('admin123', 10)
    await db.run(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)`,
      ['admin-1', 'admin@zionite.online', hash, 'Admin User', 'admin']
    )
    console.log('[DB] admin seeded')
  }
  console.log('[DB] init complete')
  _dbInitDone = true
}
