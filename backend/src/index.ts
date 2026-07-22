import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import * as Sentry from '@sentry/node'
import path from 'path'
import fs from 'fs'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { r2Configured, getClient } from './lib/r2.js'
import { Readable } from 'stream'
import authRoutes from './routes/auth.js'
import broadcastRoutes from './routes/broadcasts.js'
import sermonRoutes from './routes/sermons.js'
import scheduleRoutes from './routes/schedule.js'
import chatRoutes from './routes/chat.js'
import statusRoutes from './routes/status.js'
import guestSpeakerRoutes from './routes/guest-speakers.js'
import prayerRoutes from './routes/prayer.js'
import eventRoutes from './routes/events.js'
import donationRoutes from './routes/donations.js'
import testimonyRoutes from './routes/testimonies.js'
import campaignRoutes from './routes/campaigns.js'
import analyticsRoutes from './routes/analytics.js'
import searchRoutes from './routes/search.js'
import relayRoutes from './routes/relay.js'
import streamRoutes from './routes/stream.js'
import pushRoutes from './routes/push.js'
import radioRoutes from './routes/radio.js'
import radioScheduleRoutes from './routes/radio-schedules.js'
import playlistRoutes from './routes/playlists.js'
import musicRoutes from './routes/music.js'
import soundtrackRoutes from './routes/soundtracks.js'
import tenantRoutes from './routes/tenants.js'
import licensePlanRoutes from './routes/license-plans.js'
import { cacheMiddleware } from './middleware/cache.js'
import { JWT_SECRET, authenticateToken, requireRole } from './middleware/auth.js'
import { optimizeImage } from './middleware/optimizeImage.js'
import jwt from 'jsonwebtoken'
import multer from 'multer'

// Sentry init
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
}

const app = express()

const ALLOWED_ORIGINS = [
  'https://www.zionite.online',
  'https://zionite.online',
  'https://zionite.fly.dev',
  'https://zionite.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    // In development, be permissive
    if (process.env.NODE_ENV !== 'production') return callback(null, true)
    console.warn('[CORS] Blocked origin:', origin)
    callback(new Error(`CORS policy: origin ${origin} not allowed`), false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Latest-Chunk', 'Content-Length'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}))

app.use(compression() as any)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Rate limiting — key by user ID from JWT so multiple users behind NAT aren't lumped together
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token) {
      try { const d = jwt.verify(token, JWT_SECRET) as any; if (d?.id) return d.id } catch {}
    }
    return req.ip || req.headers['x-forwarded-for'] || 'unknown'
  }
})
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true })
app.use(apiLimiter as any)
app.use('/auth', authLimiter as any)

// Strip /api prefix from Vercel rewrite so routes match at root
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4)
  }
  next()
})

// Request logging
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`)
  next()
})

// Health checks
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

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  }
})

// API routes
app.use('/auth', authRoutes)
app.post('/uploads/image', authenticateToken, requireRole('broadcaster', 'admin'), uploadImage.single('image'), optimizeImage, async (req: any, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Image file required' }); return }
    const base64 = req.file.buffer.toString('base64')
    const image_url = `data:${req.file.mimetype};base64,${base64}`
    res.json({ image_url })
  } catch (err: any) {
    console.error('[UPLOADS] image upload error:', err.message)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})
app.use('/broadcasts', cacheMiddleware(30000), broadcastRoutes)
app.use('/sermons', cacheMiddleware(60000), sermonRoutes)
app.use('/schedule', scheduleRoutes)
app.use('/chat', chatRoutes)
app.use('/status', cacheMiddleware(60000), statusRoutes)
app.use('/guest-speakers', cacheMiddleware(60000), guestSpeakerRoutes)
app.use('/prayer', cacheMiddleware(30000), prayerRoutes)
app.use('/events', cacheMiddleware(60000), eventRoutes)
app.use('/donations', donationRoutes)
app.use('/testimonies', testimonyRoutes)
app.use('/campaigns', campaignRoutes)
app.use('/analytics', analyticsRoutes)
app.use('/search', cacheMiddleware(30000), searchRoutes)
app.use('/relay', relayRoutes)
app.use('/stream', streamRoutes)
app.use('/push', pushRoutes)
app.use('/radio', radioRoutes)
app.use('/radio-schedules', radioScheduleRoutes)
app.use('/playlists', playlistRoutes)
app.use('/music', musicRoutes)
app.use('/soundtracks', soundtrackRoutes)
app.use('/tenants', tenantRoutes)
app.use('/license-plans', licensePlanRoutes)

// HLS live stream serving
const HLS_ROOT = process.env.HLS_DIR || '/tmp/hls'
app.use('/live', (req: Request, res: Response, next: NextFunction) => {
  // req.path starts with '/' (e.g. '/abc123/stream.m3u8'); strip it so path.join works
  const relativePath = req.path.replace(/^\//, '')
  const filePath = path.join(HLS_ROOT, relativePath)
  console.log(`[HLS] serve ${req.path} → ${filePath} (exists=${fs.existsSync(filePath)})`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!filePath.startsWith(HLS_ROOT)) { res.status(403).end(); return }
  if (!fs.existsSync(filePath)) { res.status(404).end(); return }

  // Set correct MIME types and CORS
  if (req.path.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  } else if (req.path.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/MP2T')
    res.setHeader('Cache-Control', 'public, max-age=2')
  }
  res.sendFile(filePath)
})

// Sentry error handler (must be before 404)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler() as any)
}

// R2 file proxy (serves files from R2 when no public CDN URL is configured)
app.get('/r2-files/*', async (req: Request, res: Response) => {
  if (!r2Configured) { res.status(404).json({ error: 'R2 not configured' }); return }
  const key = req.path.replace(/^\/r2-files\//, '')
  if (!key) { res.status(400).end(); return }
  try {
    const response = await getClient().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET || 'zionite', Key: key }))
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    if (response.ContentType) res.setHeader('Content-Type', response.ContentType)
    if (response.ContentLength) res.setHeader('Content-Length', response.ContentLength.toString())

    // Support forced download via ?download=filename query param
    const downloadName = (req.query.download as string) || ''
    if (downloadName) {
      const safeName = downloadName.replace(/[^\w.\- ]/g, '').replace(/\s+/g, '_')
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    }

    if (response.Body instanceof Readable) {
      (response.Body as Readable).pipe(res)
    } else {
      res.end()
    }
  } catch (err: any) {
    console.error('[R2] file proxy error:', err.message)
    res.status(404).json({ error: 'File not found' })
  }
})

// Generic download proxy: accepts any audio URL and serves it with Content-Disposition: attachment.
// This avoids fragile client-side key extraction and works for R2 public URLs, custom domains, and legacy URLs.
app.get('/download', async (req: Request, res: Response) => {
  const url = req.query.url as string
  const filename = (req.query.filename as string) || ''
  if (!url) { res.status(400).json({ error: 'URL required' }); return }

  try {
    const u = new URL(url)
    // Only allow known storage domains to prevent abuse
    const allowedHosts = [
      'zionite.fly.dev',
      'localhost',
      'r2.dev',
      'cloudflarestorage.com',
      'res.cloudinary.com',
      'cloudinary.com',
    ]
    const isAllowed = allowedHosts.some(host => u.hostname === host || u.hostname.endsWith(`.${host}`))
    if (!isAllowed) {
      res.status(400).json({ error: 'Invalid download URL' })
      return
    }

    const response = await fetch(url, { headers: { 'Accept': '*/*' } })
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`)

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')

    const safeName = filename.replace(/[^\w.\- ]/g, '').replace(/\s+/g, '_') || 'download'
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)

    const reader = response.body as any
    if (reader?.pipe) {
      reader.pipe(res)
    } else {
      const buffer = Buffer.from(await response.arrayBuffer())
      res.send(buffer)
    }
  } catch (err: any) {
    console.error('[DOWNLOAD] proxy error:', err.message, url)
    res.status(502).json({ error: 'Failed to download file' })
  }
})

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERR]', err.message || err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

export default app
