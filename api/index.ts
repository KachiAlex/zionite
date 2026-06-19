import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/webm']
    cb(null, allowed.includes(file.mimetype))
  }
})

// ── Express setup ──────────────────────────────────────────────
const app = express()
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Strip /api prefix from Vercel rewrite
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4)
  next()
})

// ── Database ───────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || ''
const sql = dbUrl ? neon(dbUrl) : null

async function dbQuery(query: string, params?: any[]) {
  if (!sql) throw new Error('DATABASE_URL not configured')
  return sql.query(query, params) as Promise<any[]>
}

async function dbGet(query: string, params?: any[]) {
  const rows = await dbQuery(query, params)
  return rows[0]
}

// ── Schema init (lazy) ───────────────────────────────────────
let _dbInit = false
async function initDb() {
  if (_dbInit || !sql) return
  await dbQuery(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'listener', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled', started_at TIMESTAMP, ended_at TIMESTAMP,
    broadcaster_id TEXT NOT NULL, audio_path TEXT, stream_key TEXT, stream_type TEXT DEFAULT 'church_online',
    church_online_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS sermons (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    speaker TEXT, series TEXT, audio_url TEXT NOT NULL, date TEXT NOT NULL, duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, broadcast_id TEXT, user_id TEXT, user_name TEXT,
    message TEXT NOT NULL, is_private BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, day_of_week INTEGER NOT NULL,
    time TEXT NOT NULL, type TEXT DEFAULT 'service', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT, album TEXT, genre TEXT,
    audio_url TEXT NOT NULL, cover_url TEXT, duration INTEGER, lyrics TEXT,
    file_format TEXT, file_size INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS stream_chunks (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    chunk_data TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  // Add stream config columns if missing (safe for existing tables)
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS rtmp_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_key TEXT`) } catch {}

  const sched = await dbGet('SELECT * FROM schedule LIMIT 1')
  if (!sched) {
    await dbQuery(`INSERT INTO schedule (id, title, day_of_week, time, type) VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10),($11,$12,$13,$14,$15)`,
      [uuidv4(), 'Sunday Gathering', 0, '10:00', 'service', uuidv4(), 'Midweek Study', 3, '19:00', 'study', uuidv4(), 'Prayer Meeting', 5, '18:00', 'prayer'])
  }

  const admin = await dbGet('SELECT * FROM users WHERE role=$1', ['admin'])
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10)
    await dbQuery(`INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)`,
      ['admin-1', 'admin@zionite.online', hash, 'Admin User', 'admin'])
  }
  _dbInit = true
}

// ── Auth middleware ────────────────────────────────────────────
interface AuthReq extends Request { user?: any }

function auth(req: AuthReq, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'No token' }); return }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev')
    next()
  } catch { res.status(401).json({ error: 'Invalid token' }); return }
}

function requireRole(role: string) {
  return (req: AuthReq, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) { res.status(403).json({ error: 'Forbidden' }); return }
    next()
  }
}

// ── Auth routes ────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  try {
    await initDb()
    const { email, password, name } = req.body
    if (!email || !password || !name) { res.status(400).json({ error: 'Missing fields' }); return }
    const existing = await dbGet('SELECT * FROM users WHERE email=$1', [email])
    if (existing) { res.status(409).json({ error: 'Email taken' }); return }
    const hash = await bcrypt.hash(password, 10)
    const id = uuidv4()
    await dbQuery(`INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)`,
      [id, email, hash, name, 'listener'])
    res.json({ id, email, name, role: 'listener' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/auth/login', async (req, res) => {
  try {
    await initDb()
    const { email, password } = req.body
    if (!email || !password) { res.status(400).json({ error: 'Missing credentials' }); return }
    const user = await dbGet('SELECT * FROM users WHERE email=$1', [email])
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' }); return
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'dev', { expiresIn: '7d' })
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/auth/verify', auth, (req: AuthReq, res) => {
  res.json({ user: req.user })
})

app.get('/auth/users', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC')
    res.json({ users: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/auth/users/:id/role', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { role } = req.body
    await dbQuery('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/auth/change-password', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Missing passwords' }); return }
    const user = await dbGet('SELECT * FROM users WHERE id=$1', [req.user.id])
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      res.status(401).json({ error: 'Current password incorrect' }); return
    }
    const hash = await bcrypt.hash(newPassword, 10)
    await dbQuery('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Broadcast routes ─────────────────────────────────────────
app.get('/broadcasts', async (_req, res) => {
  try { await initDb(); const rows = await dbQuery('SELECT * FROM broadcasts ORDER BY created_at DESC'); res.json({ broadcasts: rows }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/broadcasts/active', async (_req, res) => {
  try { await initDb(); const row = await dbGet("SELECT * FROM broadcasts WHERE status='live' ORDER BY started_at DESC LIMIT 1"); res.json({ broadcast: row }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/broadcasts/:id', async (req, res) => {
  try { await initDb(); const row = await dbGet('SELECT * FROM broadcasts WHERE id=$1', [req.params.id]); res.json({ broadcast: row }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/broadcasts', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, rtmp_url, stream_key } = req.body
    const id = uuidv4()
    await dbQuery(`INSERT INTO broadcasts (id, title, description, scripture_reference, status, broadcaster_id, church_online_url, rtmp_url, stream_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, title, description || '', scripture_reference || '', 'scheduled', req.user.id, req.body.church_online_url || null, rtmp_url || null, stream_key || null])
    res.status(201).json({ id, title, status: 'scheduled' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/end', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='ended', ended_at=NOW() WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/start', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='live', started_at=NOW() WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/pause', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='paused' WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/resume', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='live' WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/broadcasts/stats/overview', async (_req, res) => {
  try {
    await initDb()
    const total = await dbGet('SELECT COUNT(*) as count FROM broadcasts')
    const live = await dbGet("SELECT COUNT(*) as count FROM broadcasts WHERE status='live'")
    res.json({ total: Number(total?.count || 0), live: Number(live?.count || 0) })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Sermon routes ──────────────────────────────────────────────
app.get('/sermons', async (req, res) => {
  try {
    await initDb()
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
    const rows = await dbQuery('SELECT * FROM sermons ORDER BY date DESC LIMIT $1', [limit])
    res.json({ sermons: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/sermons', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, speaker, series, audio_url, date, duration } = req.body
    if (!title || !audio_url || !date) { res.status(400).json({ error: 'Missing fields' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, date, duration) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, title, description || '', scripture_reference || '', speaker || '', series || '', audio_url, date, duration || 0])
    res.status(201).json({ id, title })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Schedule routes ────────────────────────────────────────────
app.get('/schedule', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM schedule ORDER BY day_of_week, time')
    const today = new Date().getDay()
    const result = rows.map((s: any) => {
      const daysUntil = (s.day_of_week - today + 7) % 7
      const next = new Date(); next.setDate(next.getDate() + daysUntil)
      return { ...s, next_date: next.toISOString().split('T')[0], days_until: daysUntil }
    })
    res.json({ schedule: result })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Chat routes ───────────────────────────────────────────────
app.get('/chat/:broadcastId', async (req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM chat_messages WHERE broadcast_id=$1 ORDER BY created_at DESC LIMIT 100', [req.params.broadcastId])
    res.json({ messages: rows.reverse() })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/chat/:broadcastId', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { message } = req.body
    const id = uuidv4()
    await dbQuery(`INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, message) VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.broadcastId, req.user.id, req.user.email, message])
    res.status(201).json({ id, message })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/chat/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM chat_messages WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Music routes ─────────────────────────────────────────────
app.get('/music', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, file_format, file_size, created_at FROM music ORDER BY created_at DESC')
    res.json({ music: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/music', auth, requireRole('admin'), upload.single('audio'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, artist, album, genre, cover_url, duration, lyrics } = req.body
    if (!title) { res.status(400).json({ error: 'Title required' }); return }

    let audio_url = req.body.audio_url || ''
    let file_format = req.body.file_format || ''
    let file_size = 0

    if (req.file) {
      file_format = req.file.mimetype
      file_size = req.file.size
      const base64 = req.file.buffer.toString('base64')
      audio_url = `data:${req.file.mimetype};base64,${base64}`
    }
    if (!audio_url) { res.status(400).json({ error: 'Audio file or URL required' }); return }

    const id = uuidv4()
    await dbQuery(`INSERT INTO music (id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, file_format, file_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, artist || '', album || '', genre || '', audio_url, cover_url || '', parseInt(duration) || 0, lyrics || '', file_format, file_size])
    res.status(201).json({ id, title })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/music/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM music WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Streaming endpoints ──────────────────────────────────────
app.post('/stream/:id/chunk', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { chunkIndex, chunkData } = req.body
    if (typeof chunkData !== 'string' || chunkData.length === 0) {
      res.status(400).json({ error: 'Invalid chunk data' }); return
    }
    const chunkId = uuidv4()
    await dbQuery(`INSERT INTO stream_chunks (id, broadcast_id, chunk_index, chunk_data) VALUES ($1,$2,$3,$4)`,
      [chunkId, req.params.id, chunkIndex, chunkData])
    // Keep only last 30 chunks (~60 seconds at 2s interval)
    await dbQuery(`DELETE FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index < $2`,
      [req.params.id, chunkIndex - 30])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/stream/:id/chunk/:index', async (req, res) => {
  try {
    await initDb()
    const row = await dbGet(`SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=$2`,
      [req.params.id, req.params.index])
    if (!row) { res.status(404).json({ error: 'Chunk not found' }); return }
    const buffer = (globalThis as any).Buffer.from(row.chunk_data, 'base64')
    res.setHeader('Content-Type', 'audio/webm')
    res.send(buffer)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/stream/:id/info', async (req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`SELECT chunk_index FROM stream_chunks WHERE broadcast_id=$1 ORDER BY chunk_index DESC LIMIT 1`,
      [req.params.id])
    const count = await dbGet(`SELECT COUNT(*) as count FROM stream_chunks WHERE broadcast_id=$1`, [req.params.id])
    res.json({
      latestChunk: rows[0]?.chunk_index ?? -1,
      totalChunks: Number(count?.count || 0),
      isLive: rows.length > 0
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/stream/:id', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    await dbQuery(`DELETE FROM stream_chunks WHERE broadcast_id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Status / Health ────────────────────────────────────────────
app.get('/ping', (_req, res) => res.json({ ok: true }))

app.get('/debug', (_req, res) => {
  res.json({
    dbUrlPresent: !!process.env.DATABASE_URL,
    jwtSecretPresent: !!process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    timestamp: new Date().toISOString()
  })
})

app.get('/status', async (_req, res) => {
  try {
    await initDb()
    const dbStatus = sql ? 'connected' : 'not configured'
    res.json({ database: dbStatus, streaming: false, timestamp: new Date().toISOString() })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── 404 & Error handlers ─────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERR]', err.message || err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

export default app
