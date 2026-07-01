import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import * as Sentry from '@sentry/node'
import path from 'path'
import fs from 'fs'
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
import { cacheMiddleware } from './middleware/cache.js'

// Sentry init
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
}

const app = express()

app.use(cors({ origin: '*', credentials: false }))
app.use(compression() as any)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false })
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

// API routes
app.use('/auth', authRoutes)
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

// HLS live stream serving
const HLS_ROOT = process.env.HLS_DIR || '/tmp/hls'
app.use('/live', (req: Request, res: Response, next: NextFunction) => {
  // req.path starts with '/' (e.g. '/abc123/stream.m3u8'); strip it so path.join works
  const relativePath = req.path.replace(/^\//, '')
  const filePath = path.join(HLS_ROOT, relativePath)
  console.log(`[HLS] serve ${req.path} → ${filePath} (exists=${fs.existsSync(filePath)})`)
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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.sendFile(filePath)
})

// Sentry error handler (must be before 404)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler() as any)
}

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
