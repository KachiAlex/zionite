import { Pool, PoolClient, QueryResult } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_n9ep6PLNzBIS@ep-wandering-block-ahfs3q45-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
})

export interface DbClient {
  query(sql: string, params?: any[]): Promise<QueryResult>
  get<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T | undefined>
  all<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T[]>
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>
}

function createDbClient(client: PoolClient): DbClient {
  return {
    async query(sql: string, params?: any[]): Promise<QueryResult> {
      return client.query(sql, params)
    },
    async get<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T | undefined> {
      const result = await client.query(sql, params)
      return result.rows[0] as T
    },
    async all<T extends Record<string, any> = any>(sql: string, params?: any[]): Promise<T[]> {
      const result = await client.query(sql, params)
      return result.rows as T[]
    },
    async run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }> {
      const result = await client.query(sql, params)
      return { lastID: 0, changes: result.rowCount || 0 }
    }
  }
}

export async function getDb(): Promise<DbClient> {
  const client = await pool.connect()
  return createDbClient(client)
}

export async function initDb() {
  const client = await pool.connect()
  const db = createDbClient(client)

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'listener',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        scripture_reference TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        broadcaster_id TEXT NOT NULL,
        audio_path TEXT,
        stream_key TEXT,
        stream_type TEXT DEFAULT 'sse',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcaster_id) REFERENCES users(id)
      )
    `)

    await db.query(`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_key TEXT
    `)
    await db.query(`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_type TEXT DEFAULT 'sse'
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS sermons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        scripture_reference TEXT,
        speaker TEXT,
        series TEXT,
        audio_url TEXT NOT NULL,
        date TEXT NOT NULL,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
      )
    `)

    // Create chat_messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT,
        user_id TEXT,
        user_name TEXT,
        message TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
      )
    `)

    // Create prayer_requests table
    await db.query(`
      CREATE TABLE IF NOT EXISTS prayer_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT,
        request TEXT NOT NULL,
        is_private BOOLEAN DEFAULT TRUE,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create schedule table for recurring services
    await db.query(`
      CREATE TABLE IF NOT EXISTS schedule (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        time TEXT NOT NULL,
        type TEXT DEFAULT 'service',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Seed default schedule
    const existingSchedule = await db.get('SELECT * FROM schedule LIMIT 1')
    if (!existingSchedule) {
      await db.run(`
        INSERT INTO schedule (id, title, day_of_week, time, type) VALUES 
        ($1, 'Sunday Gathering', 0, '10:00', 'service'),
        ($2, 'Midweek Study', 3, '19:00', 'study'),
        ($3, 'Prayer Meeting', 5, '18:00', 'prayer')
      `, [uuidv4(), uuidv4(), uuidv4()])
    }

    // Seed an admin user if none exists
    const admin = await db.get('SELECT * FROM users WHERE role = $1', ['admin'])
    if (!admin) {
      const bcrypt = await import('bcryptjs')
      const hash = await bcrypt.hash('admin123', 10)
      await db.run(
        `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)`,
        ['admin-1', 'admin@zionitefm.com', hash, 'Admin User', 'admin']
      )
    }
  } finally {
    client.release()
  }
}
