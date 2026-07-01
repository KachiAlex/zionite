import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import crypto from 'crypto'
import webpush from 'web-push'
import nodemailer from 'nodemailer'

// Cloudinary auto-configures from CLOUDINARY_URL env var
// Parse URL so we can expose cloud_name + api_key to clients for signed uploads
function parseCloudinaryUrl() {
  const url = process.env.CLOUDINARY_URL || ''
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
  if (!match) return null
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] }
}
const cloudConfig = parseCloudinaryUrl()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/webm']
    cb(null, allowed.includes(file.mimetype))
  }
})

const uploadRecording = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'video/webm']
    cb(null, allowed.includes(file.mimetype))
  }
})

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  }
})

function uploadToCloudinary(buffer: Buffer, folder: string, resourceType: 'auto' | 'image' | 'video' = 'auto'): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder, resource_type: resourceType }, (err, result) => {
      if (err || !result) reject(err || new Error('Cloudinary upload failed'))
      else resolve(result.secure_url)
    }).end(buffer)
  })
}

function generateCloudinarySignature(folder: string, timestamp: number) {
  if (!cloudConfig) return null
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}${cloudConfig.apiSecret}`
  return crypto.createHash('sha1').update(paramsToSign).digest('hex')
}

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
let _dbInitPromise: Promise<void> | null = null
async function _doInitDb() {
  if (!sql) return
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
    speaker TEXT, series TEXT, audio_url TEXT, video_url TEXT, thumbnail_url TEXT, date TEXT NOT NULL, duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, broadcast_id TEXT, user_id TEXT, user_name TEXT,
    recipient_id TEXT, guest_name TEXT, message TEXT NOT NULL, is_private BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  await dbQuery(`CREATE TABLE IF NOT EXISTS stream_listeners (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, session_id TEXT NOT NULL,
    platform TEXT DEFAULT 'web', last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  // Add chat_messages columns if missing
  try { await dbQuery(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS guest_name TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS recipient_id TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE`) } catch {}
  try { await dbQuery(`UPDATE chat_messages SET is_private=FALSE WHERE is_private IS NULL`) } catch {}
  try { await dbQuery(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'`) } catch {}
  try { await dbQuery(`UPDATE chat_messages SET reactions='{}' WHERE reactions IS NULL`) } catch {}
  // Add geo columns to stream_listeners
  try { await dbQuery(`ALTER TABLE stream_listeners ADD COLUMN IF NOT EXISTS country TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE stream_listeners ADD COLUMN IF NOT EXISTS region TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE stream_listeners ADD COLUMN IF NOT EXISTS city TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE stream_listeners ADD COLUMN IF NOT EXISTS ip TEXT`) } catch {}

  // Add stream config columns if missing (safe for existing tables)
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS rtmp_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_key TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS speaker TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recording_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP`) } catch {}

  // Auto-delete broadcast recordings older than 90 days
  try {
    const expired = await dbQuery(
      `SELECT id, recording_url FROM broadcasts WHERE recording_url IS NOT NULL AND recorded_at < NOW() - INTERVAL '90 days'`
    )
    for (const row of (expired || [])) {
      try {
        // Extract Cloudinary public_id from URL and destroy
        const match = (row.recording_url as string).match(/\/v\d+\/(.+?)(?:\.[a-z0-9]+)?$/i)
        if (match) {
          await cloudinary.uploader.destroy(match[1], { resource_type: 'video' })
        }
      } catch {}
      await dbQuery(`UPDATE broadcasts SET recording_url=NULL, recorded_at=NULL WHERE id=$1`, [row.id])
    }
  } catch {}

  // Add sermon columns if missing
  try { await dbQuery(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS video_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`) } catch {}
  try { await dbQuery(`UPDATE sermons SET play_count = 0 WHERE play_count IS NULL`) } catch {}
  try { await dbQuery(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`) } catch {}
  try { await dbQuery(`UPDATE sermons SET is_featured=FALSE WHERE is_featured IS NULL`) } catch {}

  // Add music columns if missing
  try { await dbQuery(`ALTER TABLE music ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`) } catch {}
  try { await dbQuery(`UPDATE music SET play_count = 0 WHERE play_count IS NULL`) } catch {}

  // Add event columns if missing
  try { await dbQuery(`ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT`) } catch {}

  // New tables
  await dbQuery(`CREATE TABLE IF NOT EXISTS featured_sermons (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL, order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL, content TEXT NOT NULL,
    language TEXT DEFAULT 'en', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS guest_speakers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT, photo_url TEXT,
    topic TEXT, date TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, amount NUMERIC NOT NULL,
    message TEXT, is_anonymous BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS prayer_requests (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT, request TEXT NOT NULL, is_anonymous BOOLEAN DEFAULT FALSE,
    prayers_count INTEGER DEFAULT 0, is_answered BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS prayer_interactions (
    id TEXT PRIMARY KEY, prayer_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(prayer_id, user_id)
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT, time TEXT,
    location TEXT, image_url TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS event_rsvps (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
    phone TEXT, guests INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS testimonies (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, email TEXT, content TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'pending', is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, goal_amount NUMERIC NOT NULL,
    current_amount NUMERIC DEFAULT 0, end_date TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0, device_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  // Notification tables
  await dbQuery(`CREATE TABLE IF NOT EXISTS fcm_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT,
    platform TEXT DEFAULT 'android',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY,
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS notification_log (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    push_count INTEGER DEFAULT 0,
    email_count INTEGER DEFAULT 0,
    fcm_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS spiritual_health (
    id TEXT PRIMARY KEY,
    scripture TEXT NOT NULL,
    message TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  // Sermon radio tables
  await dbQuery(`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    repeat_mode TEXT DEFAULT 'none',
    shuffle BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS playlist_items (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('sermon', 'music')),
    content_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS radio_schedules (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await dbQuery(`CREATE TABLE IF NOT EXISTS radio_state (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    schedule_id TEXT,
    current_item_id TEXT,
    offset_seconds INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  // Migrations for existing tables
  try { await dbQuery(`ALTER TABLE stream_listeners ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web'`) } catch {}
  try { await dbQuery(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS user_id TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS name TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS request TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS prayers_count INTEGER DEFAULT 0`) } catch {}
  try { await dbQuery(`ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_answered BOOLEAN DEFAULT FALSE`) } catch {}
  try { await dbQuery(`ALTER TABLE testimonies ADD COLUMN IF NOT EXISTS user_id TEXT`) } catch {}
  try { await dbQuery(`ALTER TABLE testimonies ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE`) } catch {}
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
}

async function initDb() {
  if (_dbInit || !sql) return
  if (_dbInitPromise) {
    await _dbInitPromise
    return
  }
  _dbInitPromise = _doInitDb()
  try {
    await _dbInitPromise
    _dbInit = true
  } catch (e) {
    _dbInitPromise = null
    throw e
  }
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

function optionalAuth(req: AuthReq, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev') } catch {}
  }
  next()
}

function requireRole(...roles: string[]) {
  return (req: AuthReq, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) { res.status(403).json({ error: 'Forbidden' }); return }
    next()
  }
}

// ── Notification helpers ───────────────────────────────────────
let _vapidConfigured = false
function configureVapid() {
  if (_vapidConfigured) return
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ''
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zionite.online'
  if (vapidPrivate) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    _vapidConfigured = true
  }
}

let _emailTransporter: nodemailer.Transporter | null = null
function getEmailTransporter() {
  if (_emailTransporter) return _emailTransporter
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null
  _emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  })
  return _emailTransporter
}

async function sendWebPush(title: string, body: string, url: string) {
  configureVapid()
  if (!_vapidConfigured) return { sent: 0, failed: 0 }
  const subs = await dbQuery('SELECT endpoint, p256dh, auth FROM push_subscriptions')
  let sent = 0, failed = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url, icon: '/logo.png', badge: '/logo.png' })
      )
      sent++
    } catch (e: any) {
      failed++
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { await dbQuery('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]) } catch {}
      }
    }
  }
  return { sent, failed }
}

async function sendEmailNotifications(subject: string, body: string, _url: string) {
  const transporter = getEmailTransporter()
  if (!transporter) return { sent: 0, failed: 0 }
  const users = await dbQuery('SELECT email FROM users WHERE email IS NOT NULL')
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  let sent = 0, failed = 0
  for (const user of users) {
    try {
      await transporter.sendMail({ from, to: user.email, subject, text: body + '\n\nVisit ZioniteFM: https://www.zionite.online' + _url })
      sent++
    } catch { failed++ }
  }
  return { sent, failed }
}

async function sendFcmNotifications(title: string, body: string, url: string) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { sent: 0, failed: 0 }
  }
  try {
    const { default: admin } = await import('firebase-admin')
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      })
    }
    const tokens = await dbQuery('SELECT token FROM fcm_tokens')
    if (tokens.length === 0) return { sent: 0, failed: 0 }
    const messages = tokens.map((t: any) => ({
      token: t.token,
      notification: { title, body },
      data: { url, title, body }
    }))
    const response = await admin.messaging().sendEach(messages)
    return { sent: response.successCount, failed: response.failureCount }
  } catch (e: any) {
    console.error('FCM send error:', e.message)
    return { sent: 0, failed: 0 }
  }
}

async function broadcastNotification(type: string, title: string, body: string, url: string) {
  await initDb()
  const push = await sendWebPush(title, body, url)
  const email = await sendEmailNotifications(title, body, url)
  const fcm = await sendFcmNotifications(title, body, url)
  const id = uuidv4()
  await dbQuery(
    `INSERT INTO notification_log (id, type, title, body, url, push_count, email_count, fcm_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, type, title, body, url, push.sent, email.sent, fcm.sent]
  )
  return { id, push, email, fcm }
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
    const token = jwt.sign({ id, email, name, role: 'listener' }, process.env.JWT_SECRET || 'dev', { expiresIn: '7d' })
    res.json({ token, user: { id, email, name, role: 'listener' } })
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
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role },
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

app.post('/broadcasts', auth, requireRole('admin', 'broadcaster'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, rtmp_url, stream_key, thumbnail_url, speaker } = req.body
    if (!title) { res.status(400).json({ error: 'Title is required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO broadcasts (id, title, description, scripture_reference, status, broadcaster_id, church_online_url, rtmp_url, stream_key, thumbnail_url, speaker) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, description || '', scripture_reference || '', 'scheduled', req.user.id, req.body.church_online_url || null, rtmp_url || null, stream_key || null, thumbnail_url || null, speaker || null])
    res.status(201).json({ id, title, status: 'scheduled', thumbnail_url, speaker })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/end', auth, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='ended', ended_at=NOW() WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/start', auth, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    await initDb()
    const broadcast = await dbGet('SELECT title FROM broadcasts WHERE id=$1', [req.params.id])
    await dbQuery("UPDATE broadcasts SET status='live', started_at=NOW() WHERE id=$1", [req.params.id])
    res.json({ success: true })
    // Notify subscribers asynchronously
    broadcastNotification('broadcast_live', broadcast?.title || 'Live Broadcast', 'A broadcast is now live on ZioniteFM', `/live/${req.params.id}`).catch(() => {})
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/pause', auth, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    await initDb()
    await dbQuery("UPDATE broadcasts SET status='paused' WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/resume', auth, requireRole('admin', 'broadcaster'), async (req, res) => {
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
app.get('/sermons/featured', async (_req, res) => {
  try {
    await initDb()
    // Return explicitly featured sermons; if none, fall back to the 4 newest
    let rows = await dbQuery(`SELECT * FROM sermons WHERE is_featured=TRUE ORDER BY date DESC`)
    if (!rows || rows.length === 0) {
      rows = await dbQuery(`SELECT * FROM sermons ORDER BY date DESC LIMIT 4`)
    }
    res.json({ sermons: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/sermons', async (req, res) => {
  try {
    await initDb()
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
    const rows = await dbQuery('SELECT * FROM sermons ORDER BY date DESC LIMIT $1', [limit])
    res.json({ sermons: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/sermons/:id/featured', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { is_featured } = req.body
    if (is_featured) {
      // Enforce max 4: if already 4 featured, unfeature the oldest by date
      const current = await dbQuery(`SELECT id FROM sermons WHERE is_featured=TRUE ORDER BY date DESC`)
      if (current.length >= 4) {
        // Unfeature the one with the oldest date (last in DESC order)
        const oldest = current[current.length - 1]
        await dbQuery(`UPDATE sermons SET is_featured=FALSE WHERE id=$1`, [oldest.id])
      }
      await dbQuery(`UPDATE sermons SET is_featured=TRUE WHERE id=$1`, [req.params.id])
    } else {
      await dbQuery(`UPDATE sermons SET is_featured=FALSE WHERE id=$1`, [req.params.id])
    }
    res.json({ success: true, is_featured: !!is_featured })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/sermons/:id', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, speaker, scripture_reference, series, description, duration, video_url, audio_url, thumbnail_url, date } = req.body
    await dbQuery(
      `UPDATE sermons SET
        title = COALESCE($1, title),
        speaker = COALESCE($2, speaker),
        scripture_reference = COALESCE($3, scripture_reference),
        series = COALESCE($4, series),
        description = COALESCE($5, description),
        duration = COALESCE($6, duration),
        video_url = COALESCE($7, video_url),
        audio_url = COALESCE($8, audio_url),
        thumbnail_url = COALESCE($9, thumbnail_url),
        date = COALESCE($10, date)
      WHERE id=$11`,
      [title||null, speaker||null, scripture_reference||null, series||null, description||null,
       duration ? parseInt(duration) : null, video_url||null, audio_url||null, thumbnail_url||null, date||null, req.params.id]
    )
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/sermons/:id', async (req, res) => {
  try {
    await initDb()
    const row = await dbGet('SELECT * FROM sermons WHERE id=$1', [req.params.id])
    if (!row) { res.status(404).json({ error: 'Sermon not found' }); return }
    res.json({ sermon: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/sermons/:id/play', async (req, res) => {
  try {
    await initDb()
    await dbQuery('UPDATE sermons SET play_count = COALESCE(play_count, 0) + 1 WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/sermons', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, speaker, series, audio_url, video_url, thumbnail_url, date, duration } = req.body
    if (!title) { res.status(400).json({ error: 'Title is required' }); return }
    const id = uuidv4()
    const sermonDate = date || new Date().toISOString().split('T')[0]
    await dbQuery(`INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, video_url, thumbnail_url, date, duration) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, description || null, scripture_reference || null, speaker || null, series || null,
       audio_url || null, video_url || null, thumbnail_url || null, sermonDate, duration || 0])
    res.status(201).json({ sermon: { id, title, description, scripture_reference, speaker, series, audio_url, video_url, thumbnail_url, date: sermonDate, duration } })
    broadcastNotification('sermon', 'New Sermon Available', `${title} by ${speaker || 'ZioniteFM'}`, `/sermons/${id}`).catch(() => {})
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
app.get('/chat/:broadcastId', optionalAuth, async (req, res) => {
  try {
    await initDb()
    const userId = (req as any).user?.id || null
    // Public + private where user is sender or recipient
    let rows
    if (userId) {
      rows = await dbQuery(
        `SELECT * FROM chat_messages WHERE broadcast_id=$1 AND (
          is_private=FALSE OR user_id=$2 OR recipient_id=$2
        ) ORDER BY created_at DESC LIMIT 200`,
        [req.params.broadcastId, userId])
    } else {
      rows = await dbQuery(
        `SELECT * FROM chat_messages WHERE broadcast_id=$1 AND is_private=FALSE ORDER BY created_at DESC LIMIT 200`,
        [req.params.broadcastId])
    }
    res.json({ messages: rows.reverse() })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/chat/:broadcastId', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { message, recipientId } = req.body
    if (!message?.trim()) { res.status(400).json({ error: 'Empty message' }); return }
    const id = uuidv4()
    const isPrivate = !!recipientId
    await dbQuery(
      `INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, recipient_id, message, is_private) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.params.broadcastId, req.user.id, req.user.name || req.user.email, recipientId || null, message.trim(), isPrivate])
    res.status(201).json({ id, message, isPrivate })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/chat/:broadcastId/guest', async (req, res) => {
  try {
    await initDb()
    const { message, guestName } = req.body
    if (!message?.trim()) { res.status(400).json({ error: 'Empty message' }); return }
    if (!guestName?.trim()) { res.status(400).json({ error: 'Guest name required' }); return }
    const id = uuidv4()
    await dbQuery(
      `INSERT INTO chat_messages (id, broadcast_id, guest_name, message, is_private) VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.broadcastId, guestName.trim(), message.trim(), false])
    res.status(201).json({ id, message })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/chat/:broadcastId/users', async (req, res) => {
  try {
    await initDb()
    // Active users who posted in this broadcast in the last 30 min
    const rows = await dbQuery(
      `SELECT DISTINCT user_id, user_name FROM chat_messages
       WHERE broadcast_id=$1 AND user_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 minutes'
       ORDER BY user_name`,
      [req.params.broadcastId])
    res.json({ users: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/chat/:id/react', async (req, res) => {
  try {
    await initDb()
    const { emoji } = req.body
    const allowed = ['👍','❤️','🙏','😂','🔥','😮']
    if (!emoji || !allowed.includes(emoji)) { res.status(400).json({ error: 'Invalid emoji' }); return }
    const msg = await dbGet('SELECT reactions FROM chat_messages WHERE id=$1', [req.params.id])
    if (!msg) { res.status(404).json({ error: 'Not found' }); return }
    const reactions = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : (msg.reactions || {})
    reactions[emoji] = (reactions[emoji] || 0) + 1
    await dbQuery(`UPDATE chat_messages SET reactions=$1 WHERE id=$2`, [JSON.stringify(reactions), req.params.id])
    res.json({ reactions })
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
    const rows = await dbQuery('SELECT id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, file_format, file_size, play_count, created_at FROM music ORDER BY created_at DESC')
    res.json({ music: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/music/:id/play', async (req, res) => {
  try {
    await initDb()
    await dbQuery('UPDATE music SET play_count = COALESCE(play_count, 0) + 1 WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/music/signature', auth, requireRole('admin'), (req: AuthReq, res) => {
  if (!cloudConfig) {
    res.status(500).json({ error: 'Cloudinary not configured' })
    return
  }
  const folder = (req.query.folder as string) || 'zionite/uploads'
  const timestamp = Math.round(Date.now() / 1000)
  const signature = generateCloudinarySignature(folder, timestamp)
  if (!signature) {
    res.status(500).json({ error: 'Failed to generate upload signature' })
    return
  }
  res.json({
    signature,
    timestamp,
    apiKey: cloudConfig.apiKey,
    cloudName: cloudConfig.cloudName,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudConfig.cloudName}/auto/upload`
  })
})

app.post('/music', auth, requireRole('admin'), upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req: AuthReq, res) => {
  try {
    if (!process.env.CLOUDINARY_URL) {
      res.status(500).json({ error: 'Cloudinary is not configured. Set CLOUDINARY_URL env var.' })
      return
    }
    await initDb()
    const { title, artist, album, genre, cover_url, duration, lyrics } = req.body
    if (!title) { res.status(400).json({ error: 'Title required' }); return }

    const files = req.files as { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] } | undefined
    let audio_url = req.body.audio_url || ''
    let file_format = req.body.file_format || ''
    let file_size = 0

    if (files?.audio && files.audio[0]) {
      const audioFile = files.audio[0]
      file_format = audioFile.mimetype
      file_size = audioFile.size
      audio_url = await uploadToCloudinary(audioFile.buffer, 'zionite/music/audio', 'video')
    }
    if (!audio_url) { res.status(400).json({ error: 'Audio file or URL required' }); return }

    let finalCoverUrl = cover_url || req.body.cover_url || ''
    if (files?.cover && files.cover[0]) {
      const coverFile = files.cover[0]
      finalCoverUrl = await uploadToCloudinary(coverFile.buffer, 'zionite/music/covers', 'image')
    }

    const id = uuidv4()
    await dbQuery(`INSERT INTO music (id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, file_format, file_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, artist || '', album || '', genre || '', audio_url, finalCoverUrl || '', parseInt(duration) || 0, lyrics || '', file_format, file_size])
    res.status(201).json({ id, title })
    broadcastNotification('music', 'New Music on ZioniteFM', `${title} by ${artist || 'ZioniteFM'}`, `/music`).catch(() => {})
  } catch (e: any) { res.status(500).json({ error: e.message || 'Upload failed' }) }
})

app.post('/uploads/image', auth, requireRole('admin'), uploadImage.single('image'), async (req: AuthReq, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Image file required' }); return }
    const image_url = await uploadToCloudinary(req.file.buffer, 'zionite/uploads', 'image')
    res.json({ image_url })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/uploads/audio', auth, requireRole('admin'), upload.single('audio'), async (req: AuthReq, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Audio file required' }); return }
    const audio_url = await uploadToCloudinary(req.file.buffer, 'zionite/audio', 'video')
    res.json({ audio_url })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/broadcasts/:id/recording', auth, requireRole('admin', 'broadcaster'), uploadRecording.single('recording'), async (req: AuthReq, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Recording file required' }); return }
    await initDb()
    const recording_url = await new Promise<string>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'zionite/broadcasts', resource_type: 'video', tags: ['broadcast_recording'] },
        (err, result) => {
          if (err || !result) reject(err || new Error('Upload failed'))
          else resolve(result.secure_url)
        }
      ).end(req.file!.buffer)
    })
    await dbQuery(`UPDATE broadcasts SET recording_url=$1, recorded_at=NOW() WHERE id=$2`, [recording_url, req.params.id])
    res.json({ recording_url })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/broadcasts/:id/recording/download', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const row = await dbGet(`SELECT title, recording_url FROM broadcasts WHERE id=$1`, [req.params.id])
    if (!row?.recording_url) { res.status(404).json({ error: 'No recording found' }); return }
    const response = await fetch(row.recording_url)
    if (!response.ok) { res.status(502).json({ error: 'Could not fetch recording' }); return }
    const safe = (row.title as string).replace(/[^a-z0-9]/gi, '_').toLowerCase()
    res.setHeader('Content-Type', 'audio/webm')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.webm"`)
    const reader = response.body as any
    if (reader?.pipe) { reader.pipe(res) } else {
      const buf = Buffer.from(await response.arrayBuffer())
      res.send(buf)
    }
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/broadcasts/:id/recording', auth, requireRole('admin', 'broadcaster'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { recording_url } = req.body
    if (!recording_url) { res.status(400).json({ error: 'recording_url required' }); return }
    await dbQuery(`UPDATE broadcasts SET recording_url=$1 WHERE id=$2`, [recording_url, req.params.id])
    res.json({ success: true })
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
    // Keep last 300 chunks (~10 minutes at 2s interval) for background audio
    await dbQuery(`DELETE FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index < $2`,
      [req.params.id, chunkIndex - 300])
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
    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.send(buffer)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Concat endpoint: returns chunks as a single continuous blob for <audio> element
// Query: ?from={chunkIndex} — only include chunks from that index onward (max 120 for ~4min buffer)
app.get('/stream/:id/concat', async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const fromIndex = parseInt(req.query.from as string || '0', 10)
    const rows = await dbQuery(
      `SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index >= $2 ORDER BY chunk_index ASC LIMIT 120`,
      [id, fromIndex]
    )
    if (!rows.length) { res.status(404).json({ error: 'No stream data' }); return }

    const chunks: Buffer[] = []
    let latestIndex = -1
    for (const row of rows) {
      chunks.push((globalThis as any).Buffer.from(row.chunk_data, 'base64'))
      latestIndex = Math.max(latestIndex, row.chunk_index)
    }
    const combined = (globalThis as any).Buffer.concat(chunks)

    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Access-Control-Expose-Headers', 'X-Latest-Chunk')
    res.setHeader('X-Latest-Chunk', String(latestIndex))
    res.send(combined)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// HLS playlist endpoint: live M3U8 with last 8 chunks (~16s buffer)
app.get('/stream/:id/playlist.m3u8', async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const rows = await dbQuery(
      `SELECT chunk_index FROM stream_chunks WHERE broadcast_id=$1 ORDER BY chunk_index DESC LIMIT 8`,
      [id]
    )
    if (!rows.length) { res.status(404).json({ error: 'No stream data' }); return }

    const indices = rows.map(r => r.chunk_index).sort((a: number, b: number) => a - b)
    const mediaSeq = indices[0]

    let m3u8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:' + mediaSeq + '\n'
    for (const idx of indices) {
      m3u8 += '#EXTINF:2.0,\nchunk/' + idx + '\n'
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.send(m3u8)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/stream/:id/info', async (req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`SELECT chunk_index FROM stream_chunks WHERE broadcast_id=$1 ORDER BY chunk_index DESC LIMIT 1`,
      [req.params.id])
    const count = await dbGet(`SELECT COUNT(*) as count FROM stream_chunks WHERE broadcast_id=$1`, [req.params.id])
    const listeners = await dbGet(`SELECT COUNT(*) as count FROM stream_listeners WHERE broadcast_id=$1`, [req.params.id])
    res.json({
      latestChunk: rows[0]?.chunk_index ?? -1,
      totalChunks: Number(count?.count || 0),
      isLive: rows.length > 0,
      listenerCount: Number(listeners?.count || 0)
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/stream/:id/join', async (req, res) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    // Get real IP (works behind Vercel/proxies)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] as string ||
               req.socket?.remoteAddress || ''
    let country = '', region = '', city = ''
    if (ip && ip !== '::1' && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,status`)
        const geo = await geoRes.json() as any
        if (geo.status === 'success') { country = geo.country || ''; region = geo.regionName || ''; city = geo.city || '' }
      } catch {}
    }
    await dbQuery(`INSERT INTO stream_listeners (id, broadcast_id, session_id, last_seen, ip, country, region, city) VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7)`,
      [uuidv4(), req.params.id, sessionId, ip, country, region, city])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Relay stream (continuous HTTP stream for <audio> background playback) ──────────────────────────────────────
// NOTE: Vercel serverless functions have execution time limits (10s hobby / 60s pro).
// For a real live broadcast, deploy the backend Express app on a persistent host.
// This endpoint exists so the URL structure is consistent if you proxy /relay to a persistent backend.

app.get('/relay/:broadcastId/stream', async (req, res) => {
  const { broadcastId } = req.params
  try {
    await initDb()
    const broadcast = await dbGet('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    if (broadcast.status !== 'live') { res.status(404).json({ error: 'Broadcast not live' }); return }

    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Start near live
    const latestRow = await dbGet<{ chunk_index: number }>(
      'SELECT chunk_index FROM stream_chunks WHERE broadcast_id = $1 ORDER BY chunk_index DESC LIMIT 1',
      [broadcastId]
    )
    let nextIndex = latestRow ? Math.max(0, latestRow.chunk_index - 3) : 0
    let ended = false

    const fetchTimer = setInterval(async () => {
      try {
        const bc = await dbGet('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
        if (!bc || bc.status !== 'live') {
          ended = true
          clearInterval(fetchTimer)
          res.end()
          return
        }
        const rows = await dbQuery(
          'SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id = $1 AND chunk_index >= $2 ORDER BY chunk_index ASC LIMIT 30',
          [broadcastId, nextIndex]
        )
        for (const row of rows) {
          const buf = Buffer.from(row.chunk_data, 'base64')
          res.write(buf)
          nextIndex = row.chunk_index + 1
        }
      } catch {
        ended = true
        clearInterval(fetchTimer)
        res.end()
      }
    }, 1500)

    req.on('close', () => { clearInterval(fetchTimer); if (!ended) res.end() })
    req.on('error', () => { clearInterval(fetchTimer); if (!ended) res.end() })
  } catch (e: any) {
    console.error('[RELAY] stream error:', e.message)
    if (!res.headersSent) res.status(500).json({ error: 'Stream error' })
    else res.end()
  }
})

app.get('/relay/:broadcastId/status', async (req, res) => {
  try {
    await initDb()
    const { broadcastId } = req.params
    const broadcast = await dbGet('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
    res.json({ live: broadcast?.status === 'live' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/stream/:id/listeners/geo', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const rows = await dbQuery(
      `SELECT country, region, city, COUNT(*) as count FROM stream_listeners
       WHERE broadcast_id=$1 AND last_seen > NOW() - INTERVAL '5 minutes'
         AND country IS NOT NULL AND country != ''
       GROUP BY country, region, city ORDER BY count DESC LIMIT 50`,
      [req.params.id])
    const byCountry = await dbQuery(
      `SELECT country, COUNT(*) as count FROM stream_listeners
       WHERE broadcast_id=$1 AND last_seen > NOW() - INTERVAL '5 minutes'
         AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY count DESC LIMIT 20`,
      [req.params.id])
    res.json({ locations: rows, byCountry })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/stream/:id/heartbeat', async (req, res) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    await dbQuery(`UPDATE stream_listeners SET last_seen=NOW() WHERE broadcast_id=$1 AND session_id=$2`,
      [req.params.id, sessionId])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/stream/:id/leave', async (req, res) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    await dbQuery(`DELETE FROM stream_listeners WHERE broadcast_id=$1 AND session_id=$2`,
      [req.params.id, sessionId])
    res.json({ success: true })
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

// ── Guest Speakers ─────────────────────────────────────────────
app.get('/guest-speakers', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM guest_speakers WHERE is_active = TRUE ORDER BY date DESC, created_at DESC')
    res.json({ speakers: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/guest-speakers', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { name, bio, photo_url, topic, date, is_active } = req.body
    if (!name) { res.status(400).json({ error: 'Name is required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO guest_speakers (id, name, bio, photo_url, topic, date, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, bio || '', photo_url || '', topic || '', date || '', is_active !== false])
    res.status(201).json({ speaker: { id, name, bio, photo_url, topic, date, is_active: is_active !== false } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/guest-speakers/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const existing = await dbGet('SELECT * FROM guest_speakers WHERE id=$1', [req.params.id])
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    const { is_active } = req.body
    await dbQuery('UPDATE guest_speakers SET is_active=$1 WHERE id=$2', [is_active ?? existing.is_active, req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/guest-speakers/:id', auth, requireRole('admin'), async (req, res) => {
  try { await initDb(); await dbQuery('DELETE FROM guest_speakers WHERE id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Events ─────────────────────────────────────────────────────
app.get('/events', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM events WHERE is_active = TRUE ORDER BY date ASC, time ASC')
    res.json({ events: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/events/:id', async (req, res) => {
  try {
    await initDb()
    const row = await dbGet('SELECT * FROM events WHERE id=$1', [req.params.id])
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ event: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/events', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, date, time, location, image_url, is_active, category } = req.body
    if (!title) { res.status(400).json({ error: 'Title is required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO events (id, title, description, date, time, location, image_url, is_active, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, title, description || '', date || '', time || '', location || '', image_url || '', is_active !== false, category || ''])
    res.status(201).json({ event: { id, title, description, date, time, location, image_url, is_active: is_active !== false, category: category || '' } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/events/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const existing = await dbGet('SELECT * FROM events WHERE id=$1', [req.params.id])
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    const { title, description, date, time, location, image_url, is_active, category } = req.body
    await dbQuery(`UPDATE events SET title=$1, description=$2, date=$3, time=$4, location=$5, image_url=$6, is_active=$7, category=$8 WHERE id=$9`,
      [title ?? existing.title, description ?? existing.description, date ?? existing.date,
       time ?? existing.time, location ?? existing.location, image_url ?? existing.image_url,
       is_active ?? existing.is_active, category ?? existing.category, req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/events/:id', auth, requireRole('admin'), async (req, res) => {
  try { await initDb(); await dbQuery('DELETE FROM events WHERE id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Event RSVPs ────────────────────────────────────────────────
app.post('/events/:id/rsvp', async (req, res) => {
  try {
    await initDb()
    const { name, email, phone, guests } = req.body
    if (!name || !email) { res.status(400).json({ error: 'Name and email are required' }); return }
    const eventId = req.params.id
    const exists = await dbGet('SELECT 1 FROM events WHERE id=$1', [eventId])
    if (!exists) { res.status(404).json({ error: 'Event not found' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO event_rsvps (id, event_id, name, email, phone, guests) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, eventId, name, email, phone || '', parseInt(guests || '0', 10)])
    res.status(201).json({ success: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/events/:id/rsvps', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, name, email, phone, guests, created_at FROM event_rsvps WHERE event_id=$1 ORDER BY created_at DESC', [req.params.id])
    const countRow = await dbGet('SELECT COUNT(*) as total, COALESCE(SUM(guests),0) as guest_total FROM event_rsvps WHERE event_id=$1', [req.params.id])
    res.json({ rsvps: rows, total: countRow?.total || 0, guestTotal: countRow?.guest_total || 0 })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Prayer Wall ────────────────────────────────────────────────
app.get('/prayer', optionalAuth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`
      SELECT p.id, p.user_id, p.name, p.request, p.is_anonymous, p.is_answered, p.created_at,
        (SELECT COUNT(*) FROM prayer_interactions WHERE prayer_id = p.id) as prayers_count
      FROM prayer_requests p
      ORDER BY p.created_at DESC
    `)
    let prayers = rows
    if (req.user?.id) {
      const userId = req.user.id
      const interactions = await dbQuery('SELECT prayer_id FROM prayer_interactions WHERE user_id=$1', [userId])
      const prayedIds = new Set(interactions.map((i: any) => i.prayer_id))
      prayers = rows.map((r: any) => ({ ...r, has_prayed: prayedIds.has(r.id) }))
    }
    res.json({ prayers })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/prayer', optionalAuth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { name, request, is_anonymous } = req.body
    if (!request?.trim()) { res.status(400).json({ error: 'Request is required' }); return }
    const id = uuidv4()
    const userId = req.user?.id || null
    await dbQuery(`INSERT INTO prayer_requests (id, user_id, name, request, is_anonymous) VALUES ($1,$2,$3,$4,$5)`,
      [id, userId, name || 'Anonymous', request.trim(), is_anonymous || false])
    res.status(201).json({ prayer: { id, user_id: userId, name: name || 'Anonymous', request, is_anonymous: is_anonymous || false, prayers_count: 0, is_answered: false } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/prayer/:id/pray', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
    const userId = req.user.id
    const prayerId = req.params.id
    const existing = await dbGet('SELECT id FROM prayer_interactions WHERE prayer_id=$1 AND user_id=$2', [prayerId, userId])
    if (existing) { res.status(409).json({ error: 'You have already prayed for this request' }); return }
    await dbQuery(`INSERT INTO prayer_interactions (id, prayer_id, user_id) VALUES ($1,$2,$3)`,
      [uuidv4(), prayerId, userId])
    await dbQuery('UPDATE prayer_requests SET prayers_count = prayers_count + 1 WHERE id=$1', [prayerId])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/prayer/:id/answered', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }
    const prayer = await dbGet('SELECT user_id FROM prayer_requests WHERE id=$1', [req.params.id])
    if (!prayer) { res.status(404).json({ error: 'Prayer request not found' }); return }
    if (prayer.user_id !== req.user.id) { res.status(403).json({ error: 'Only the creator can mark this prayer as answered' }); return }
    const { is_answered } = req.body
    await dbQuery('UPDATE prayer_requests SET is_answered=$1 WHERE id=$2', [is_answered === true, req.params.id])
    res.json({ ok: true, is_answered: is_answered === true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/prayer/:id', auth, requireRole('admin'), async (req, res) => {
  try { await initDb(); await dbQuery('DELETE FROM prayer_requests WHERE id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/prayer/admin/all', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`
      SELECT p.id, p.user_id, p.name, p.request, p.is_anonymous, p.is_answered, p.created_at,
        (SELECT COUNT(*) FROM prayer_interactions WHERE prayer_id = p.id) as prayers_count
      FROM prayer_requests p
      ORDER BY p.created_at DESC
    `)
    res.json({ prayers: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Donations ────────────────────────────────────────────────
app.get('/donations', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, name, email, amount, message, is_anonymous, status, created_at FROM donations ORDER BY created_at DESC LIMIT 50')
    res.json({ donations: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/donations', async (req, res) => {
  try {
    await initDb()
    const { name, email, amount, message, is_anonymous } = req.body
    if (!amount || parseFloat(amount) <= 0) { res.status(400).json({ error: 'Valid amount is required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO donations (id, name, email, amount, message, is_anonymous) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name || null, email || null, parseFloat(amount), message || null, is_anonymous === true])
    const row = await dbGet('SELECT * FROM donations WHERE id=$1', [id])
    res.status(201).json({ donation: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/donations/admin/all', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM donations ORDER BY created_at DESC')
    const totalResult = await dbGet('SELECT COALESCE(SUM(amount),0) as total FROM donations WHERE status=$1', ['completed'])
    res.json({ donations: rows, total: totalResult?.total || 0 })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Testimonies ──────────────────────────────────────────────
app.get('/testimonies', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`SELECT id, user_id, name, content, is_anonymous, status, is_featured, created_at FROM testimonies WHERE status='approved' ORDER BY created_at DESC LIMIT 50`)
    const testimonies = rows.map((t: any) => ({ ...t, name: t.is_anonymous ? 'Anonymous' : t.name }))
    res.json({ testimonies })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/testimonies', optionalAuth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { name, email, content, is_anonymous } = req.body
    if (!name || !content) { res.status(400).json({ error: 'Name and content are required' }); return }
    const id = uuidv4()
    const userId = req.user?.id || null
    const displayName = is_anonymous ? 'Anonymous' : name
    await dbQuery(`INSERT INTO testimonies (id, user_id, name, email, content, is_anonymous) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, userId, displayName, email || null, content.trim(), is_anonymous === true])
    const row = await dbGet('SELECT * FROM testimonies WHERE id=$1', [id])
    res.status(201).json({ testimony: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/testimonies/admin/all', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, user_id, name, email, content, is_anonymous, status, is_featured, created_at FROM testimonies ORDER BY created_at DESC')
    res.json({ testimonies: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/testimonies/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { status, is_featured } = req.body
    const existing = await dbGet('SELECT * FROM testimonies WHERE id=$1', [req.params.id])
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    await dbQuery('UPDATE testimonies SET status=$1, is_featured=$2 WHERE id=$3',
      [status ?? existing.status, is_featured ?? existing.is_featured, req.params.id])
    const row = await dbGet('SELECT * FROM testimonies WHERE id=$1', [req.params.id])
    res.json({ testimony: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/testimonies/:id', auth, requireRole('admin'), async (req, res) => {
  try { await initDb(); await dbQuery('DELETE FROM testimonies WHERE id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Campaigns ────────────────────────────────────────────────
app.get('/campaigns', async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(`SELECT id, title, description, goal_amount, current_amount, end_date, is_active, created_at FROM campaigns WHERE is_active=TRUE ORDER BY created_at DESC`)
    res.json({ campaigns: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/campaigns', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, goal_amount, end_date } = req.body
    if (!title || !goal_amount) { res.status(400).json({ error: 'Title and goal amount are required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO campaigns (id, title, description, goal_amount, end_date) VALUES ($1,$2,$3,$4,$5)`,
      [id, title, description || null, parseFloat(goal_amount), end_date || null])
    const row = await dbGet('SELECT * FROM campaigns WHERE id=$1', [id])
    res.status(201).json({ campaign: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.patch('/campaigns/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { title, description, goal_amount, current_amount, end_date, is_active } = req.body
    const existing = await dbGet('SELECT * FROM campaigns WHERE id=$1', [req.params.id])
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    await dbQuery(`UPDATE campaigns SET title=$1, description=$2, goal_amount=$3, current_amount=$4, end_date=$5, is_active=$6 WHERE id=$7`,
      [title ?? existing.title, description ?? existing.description, goal_amount ?? existing.goal_amount,
       current_amount ?? existing.current_amount, end_date ?? existing.end_date, is_active ?? existing.is_active, req.params.id])
    const row = await dbGet('SELECT * FROM campaigns WHERE id=$1', [req.params.id])
    res.json({ campaign: row })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/campaigns/:id', auth, requireRole('admin'), async (req, res) => {
  try { await initDb(); await dbQuery('DELETE FROM campaigns WHERE id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Analytics ────────────────────────────────────────────────
app.get('/analytics/dashboard', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const onlineResult = await dbGet(`SELECT COUNT(DISTINCT session_id) as count FROM stream_listeners WHERE last_seen > NOW() - INTERVAL '5 minutes'`)
    const todayResult = await dbGet(`SELECT COUNT(DISTINCT session_id) as count FROM stream_listeners WHERE last_seen > NOW() - INTERVAL '24 hours'`)
    const sermonsResult = await dbGet('SELECT COUNT(*) as count FROM sermons')
    const prayersResult = await dbGet('SELECT COUNT(*) as count FROM prayer_requests')
    const donationsResult = await dbGet('SELECT COALESCE(SUM(amount),0) as total FROM donations WHERE status=$1', ['completed'])
    const platformRows = await dbQuery(`SELECT platform, COUNT(DISTINCT session_id) as count FROM stream_listeners WHERE last_seen > NOW() - INTERVAL '24 hours' GROUP BY platform`)
    const totalPlatform = platformRows.reduce((s: number, r: any) => s + parseInt(r.count), 0) || 1
    const platformBreakdown = platformRows.map((r: any) => ({
      name: r.platform === 'web' ? 'Web Player' : r.platform === 'mobile_app' ? 'Mobile App' : r.platform === 'mobile_web' ? 'Mobile Web' : r.platform === 'smart_speaker' ? 'Smart Speaker' : r.platform,
      value: Math.round((parseInt(r.count) / totalPlatform) * 100), rawCount: parseInt(r.count)
    }))
    const recentSermons = await dbQuery('SELECT id, title, speaker, date FROM sermons ORDER BY date DESC LIMIT 5')
    const pendingTestimonies = await dbQuery(`SELECT id, name, content, created_at FROM testimonies WHERE status='pending' ORDER BY created_at DESC LIMIT 5`)
    const recentDonations = await dbQuery('SELECT id, name, amount, status, created_at FROM donations ORDER BY created_at DESC LIMIT 5')
    const activeCampaigns = await dbQuery('SELECT id, title, goal_amount, current_amount FROM campaigns WHERE is_active=TRUE ORDER BY created_at DESC LIMIT 5')
    const transcripts = await dbQuery('SELECT t.id, s.title as sermon_title, t.created_at FROM transcripts t JOIN sermons s ON t.sermon_id = s.id ORDER BY t.created_at DESC LIMIT 5')
    res.json({
      stats: { listenersOnline: onlineResult?.count || 0, totalListenersToday: todayResult?.count || 0, sermonCount: sermonsResult?.count || 0, prayerCount: prayersResult?.count || 0, totalDonations: donationsResult?.total || 0 },
      platformBreakdown, recentSermons, pendingTestimonies, recentDonations, activeCampaigns, transcripts
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/analytics/ping', async (req, res) => {
  try {
    await initDb()
    const { session_id, broadcast_id, platform } = req.body
    if (!session_id) { res.status(400).json({ error: 'session_id required' }); return }
    const existing = await dbGet('SELECT * FROM stream_listeners WHERE session_id=$1', [session_id])
    if (existing) {
      await dbQuery('UPDATE stream_listeners SET last_seen=NOW(), broadcast_id=$1, platform=$2 WHERE session_id=$3', [broadcast_id || existing.broadcast_id, platform || existing.platform, session_id])
    } else {
      await dbQuery(`INSERT INTO stream_listeners (id, broadcast_id, session_id, platform) VALUES ($1,$2,$3,$4)`, [uuidv4(), broadcast_id || null, session_id, platform || 'web'])
    }
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Newsletter ─────────────────────────────────────────────────
app.post('/newsletter/subscribe', async (req, res) => {
  try {
    await initDb()
    const { email } = req.body
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid email required' }); return
    }
    const existing = await dbGet('SELECT id FROM newsletter_subscribers WHERE email=$1', [email])
    if (existing) { res.json({ ok: true, message: 'Already subscribed' }); return }
    await dbQuery('INSERT INTO newsletter_subscribers (id, email) VALUES ($1,$2)', [uuidv4(), email.toLowerCase()])
    res.json({ ok: true, message: 'Subscribed successfully' })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/newsletter/subscribers', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC')
    res.json({ subscribers: rows, total: rows.length })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Push Notifications ──────────────────────────────────────────
app.post('/push/subscribe', async (req, res) => {
  try {
    await initDb()
    const { endpoint, p256dh, auth, user_id } = req.body
    if (!endpoint || !p256dh || !auth) { res.status(400).json({ error: 'endpoint, p256dh and auth required' }); return }
    const existing = await dbGet('SELECT id FROM push_subscriptions WHERE endpoint=$1', [endpoint])
    if (existing) {
      await dbQuery('UPDATE push_subscriptions SET p256dh=$1, auth=$2, user_id=$3 WHERE endpoint=$4', [p256dh, auth, user_id || null, endpoint])
    } else {
      await dbQuery('INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id) VALUES ($1,$2,$3,$4,$5)', [uuidv4(), endpoint, p256dh, auth, user_id || null])
    }
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/push/unsubscribe', async (req, res) => {
  try {
    await initDb()
    const { endpoint } = req.body
    if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return }
    await dbQuery('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// Admin: broadcast a push notification to all subscribers
app.post('/push/broadcast', auth, requireRole('admin'), async (req, res) => {
  try {
    const { title, body, url } = req.body
    if (!title || !body) { res.status(400).json({ error: 'title and body required' }); return }
    const result = await broadcastNotification('admin_broadcast', title, body, url || '/')
    res.json({ ok: true, ...result, payload: { title, body, url: url || '/' } })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/push/subscribers/count', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const row = await dbGet('SELECT COUNT(*) as count FROM push_subscriptions')
    res.json({ count: Number(row?.count || 0) })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// FCM tokens for native Android push
app.post('/push/fcm-token', async (req, res) => {
  try {
    await initDb()
    const { token, user_id, platform } = req.body
    if (!token) { res.status(400).json({ error: 'token required' }); return }
    const existing = await dbGet('SELECT token FROM fcm_tokens WHERE token=$1', [token])
    if (existing) {
      await dbQuery('UPDATE fcm_tokens SET user_id=$1, platform=$2, updated_at=NOW() WHERE token=$3', [user_id || null, platform || 'android', token])
    } else {
      await dbQuery('INSERT INTO fcm_tokens (token, user_id, platform) VALUES ($1,$2,$3)', [token, user_id || null, platform || 'android'])
    }
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/push/fcm-token', async (req, res) => {
  try {
    await initDb()
    const { token } = req.body
    if (!token) { res.status(400).json({ error: 'token required' }); return }
    await dbQuery('DELETE FROM fcm_tokens WHERE token=$1', [token])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Spiritual Health Monitor ───────────────────────────────────
app.post('/spiritual-health', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    const { scripture, message } = req.body
    if (!scripture?.trim()) { res.status(400).json({ error: 'Scripture is required' }); return }
    const id = uuidv4()
    await dbQuery('INSERT INTO spiritual_health (id, scripture, message, created_by) VALUES ($1,$2,$3,$4)', [id, scripture.trim(), message || null, req.user!.id])
    const result = await broadcastNotification('spiritual_health', 'Spiritual Health Monitor', `${scripture.trim()} — ${message || 'Daily scripture for you'}`, '/')
    res.json({ ok: true, id, ...result })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/spiritual-health', auth, async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM spiritual_health ORDER BY created_at DESC LIMIT 50')
    res.json({ entries: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/spiritual-health/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM spiritual_health WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── WebAuthn / Biometric ──────────────────────────────────────────
app.get('/auth/webauthn/credentials', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const creds = await dbQuery('SELECT id, credential_id, device_name, created_at FROM webauthn_credentials WHERE user_id=$1', [req.user!.id])
    res.json({ credentials: creds })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/auth/webauthn/register', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    const { credential_id, public_key, device_name } = req.body
    if (!credential_id || !public_key) { res.status(400).json({ error: 'credential_id and public_key required' }); return }
    const existing = await dbGet('SELECT id FROM webauthn_credentials WHERE credential_id=$1', [credential_id])
    if (existing) { res.json({ ok: true, message: 'Credential already registered' }); return }
    await dbQuery('INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, device_name) VALUES ($1,$2,$3,$4,$5)',
      [uuidv4(), req.user!.id, credential_id, public_key, device_name || 'My Device'])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/auth/webauthn/credentials/:credId', auth, async (req: AuthReq, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM webauthn_credentials WHERE id=$1 AND user_id=$2', [req.params.credId, req.user!.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── Sermon Radio ─────────────────────────────────────────────
const RADIO_BASE = process.env.RADIO_API_BASE || 'https://zionite.fly.dev'

async function proxyRadio(method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${RADIO_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, text }
}

app.get('/playlists', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery('SELECT * FROM playlists ORDER BY created_at DESC')
    res.json({ playlists: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/playlists', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { title, description, repeat_mode, shuffle } = req.body
    if (!title) { res.status(400).json({ error: 'Title required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO playlists (id, title, description, repeat_mode, shuffle) VALUES ($1,$2,$3,$4,$5)`,
      [id, title, description || null, repeat_mode || 'none', !!shuffle])
    res.status(201).json({ id, title })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/playlists/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const playlist = await dbGet('SELECT * FROM playlists WHERE id=$1', [req.params.id])
    if (!playlist) { res.status(404).json({ error: 'Playlist not found' }); return }
    const items = await dbQuery(
      `SELECT pi.*, COALESCE(s.title, m.title) as content_title, COALESCE(s.speaker, m.artist) as content_speaker
       FROM playlist_items pi
       LEFT JOIN sermons s ON s.id = pi.content_id AND pi.content_type = 'sermon'
       LEFT JOIN music m ON m.id = pi.content_id AND pi.content_type = 'music'
       WHERE pi.playlist_id=$1 ORDER BY pi.order_index ASC`,
      [req.params.id]
    )
    res.json({ playlist, items })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/playlists/:id/items', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { content_type, content_id, order_index, duration_minutes } = req.body
    if (!content_type || !content_id) { res.status(400).json({ error: 'content_type and content_id required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO playlist_items (id, playlist_id, content_type, content_id, order_index, duration_minutes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.params.id, content_type, content_id, order_index || 0, duration_minutes || 30])
    res.status(201).json({ id })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/playlists/:playlistId/items/:itemId', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM playlist_items WHERE id=$1 AND playlist_id=$2', [req.params.itemId, req.params.playlistId])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/playlists/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM playlists WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/radio-schedules', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await dbQuery(
      `SELECT rs.*, p.title as playlist_title FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id ORDER BY rs.start_time DESC`
    )
    res.json({ schedules: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/radio-schedules', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    await initDb()
    const { playlist_id, start_time, end_time } = req.body
    if (!playlist_id || !start_time) { res.status(400).json({ error: 'playlist_id and start_time required' }); return }
    const id = uuidv4()
    await dbQuery(`INSERT INTO radio_schedules (id, playlist_id, start_time, end_time) VALUES ($1,$2,$3,$4)`,
      [id, playlist_id, start_time, end_time || null])
    res.status(201).json({ id, playlist_id, start_time })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.delete('/radio-schedules/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await dbQuery('DELETE FROM radio_schedules WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/radio-schedules/active', auth, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const now = new Date().toISOString()
    const row = await dbGet(
      `SELECT rs.*, p.title as playlist_title FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active=TRUE AND rs.start_time <= $1 AND (rs.end_time IS NULL OR rs.end_time >= $1)
       ORDER BY rs.start_time ASC LIMIT 1`,
      [now]
    )
    res.json({ schedule: row || null })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.get('/sermons/radio/current', async (_req, res) => {
  try {
    await initDb()
    const now = new Date()
    const schedule = await dbGet(
      `SELECT rs.*, p.title as playlist_title FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active=TRUE AND rs.start_time <= $1 AND (rs.end_time IS NULL OR rs.end_time >= $1)
       ORDER BY rs.start_time DESC LIMIT 1`,
      [now.toISOString()]
    )
    if (!schedule) {
      const latest = await dbGet('SELECT * FROM sermons ORDER BY date DESC LIMIT 1')
      res.json({
        current: latest ? {
          title: latest.title, speaker: latest.speaker, audioUrl: latest.audio_url,
          thumbnailUrl: latest.thumbnail_url, scriptureReference: latest.scripture_reference, offsetSeconds: 0
        } : null,
        playlist: null,
        isStreaming: false,
        streamKey: 'radio',
      })
      return
    }
    const items = await dbQuery(
      `SELECT pi.id as item_id, pi.content_type, pi.content_id, pi.order_index, pi.duration_minutes,
              COALESCE(s.title, m.title) as title,
              COALESCE(s.speaker, m.artist) as speaker,
              COALESCE(s.audio_url, m.audio_url) as audio_url,
              COALESCE(s.thumbnail_url, m.cover_url) as thumbnail_url,
              s.description, s.scripture_reference
       FROM playlist_items pi
       LEFT JOIN sermons s ON s.id = pi.content_id AND pi.content_type = 'sermon'
       LEFT JOIN music m ON m.id = pi.content_id AND pi.content_type = 'music'
       WHERE pi.playlist_id=$1 ORDER BY pi.order_index ASC`,
      [schedule.playlist_id]
    )
    if (!items || items.length === 0) { res.json({ current: null, playlist: null }); return }

    const elapsedMin = (now.getTime() - new Date(schedule.start_time).getTime()) / 60000
    const totalDuration = items.reduce((s: number, i: any) => s + (i.duration_minutes || 30), 0)
    const loopedMin = totalDuration > 0 ? elapsedMin % totalDuration : 0

    let cum = 0
    let currentItem: any = null
    let offsetMin = 0
    for (const item of items) {
      const dur = item.duration_minutes || 30
      if (loopedMin >= cum && loopedMin < cum + dur) { currentItem = item; offsetMin = loopedMin - cum; break }
      cum += dur
    }
    if (!currentItem) currentItem = items[0]

    res.json({
      current: {
        itemId: currentItem.item_id,
        sermonId: currentItem.content_id,
        title: currentItem.title,
        speaker: currentItem.speaker,
        audioUrl: currentItem.audio_url,
        thumbnailUrl: currentItem.thumbnail_url,
        description: currentItem.description,
        scriptureReference: currentItem.scripture_reference,
        offsetSeconds: Math.floor(offsetMin * 60),
      },
      playlist: { id: schedule.playlist_id, title: schedule.playlist_title, startTime: schedule.start_time },
      isStreaming: false,
      streamKey: 'radio',
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/radio/start', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    const { playlistId } = req.body
    if (!playlistId) { res.status(400).json({ error: 'playlistId required' }); return }
    const token = req.headers.authorization?.split(' ')[1] || ''
    const { status, text } = await proxyRadio('POST', '/radio/start', { playlistId }, token)
    res.status(status).send(text)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/radio/stop', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || ''
    const { status, text } = await proxyRadio('POST', '/radio/stop', undefined, token)
    res.status(status).send(text)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

app.post('/radio/skip', auth, requireRole('admin'), async (req: AuthReq, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || ''
    const { status, text } = await proxyRadio('POST', '/radio/skip', undefined, token)
    res.status(status).send(text)
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// ── 404 & Error handlers ─────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERR]', err.message || err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

export default app
