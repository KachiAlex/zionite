import express from 'express'
import cors from 'cors'
import path from 'path'
import { db } from './db'
import authRoutes from './routes/auth'
import broadcastRoutes from './routes/broadcasts'
import sermonRoutes from './routes/sermons'
import statusRoutes from './routes/status'
import chatRoutes from './routes/chat'
import prayerRoutes from './routes/prayer'
import scheduleRoutes from './routes/schedule'

const app = express()

// Vercel rewrites /api/* to this function; strip /api so routes match
app.use((req, res, next) => {
  const originalUrl = req.url
  const originalPath = req.path
  if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4)
  } else if (req.url === '/api') {
    req.url = '/'
  }
  console.log(`[REQ] ${req.method} original=${originalUrl} path=${originalPath} stripped=${req.url}`)
  res.on('finish', () => {
    console.log(`[RES] ${req.method} ${req.url} → ${res.statusCode}`)
  })
  next()
})

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// Mount all API routes at root (Vercel will add /api prefix)
app.use('/auth', authRoutes)
app.use('/broadcasts', broadcastRoutes)
app.use('/sermons', sermonRoutes)
app.use('/status', statusRoutes)
app.use('/chat', chatRoutes)
app.use('/prayer', prayerRoutes)
app.use('/schedule', scheduleRoutes)

// Debug endpoint (no auth needed)
app.get('/debug', (_req, res) => {
  const router = (app as any)._router
  res.json({
    env: {
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      dbUrlPresent: !!process.env.DATABASE_URL,
    },
    routes: router?.stack?.map((layer: any) => ({
      route: layer.route?.path,
      name: layer.name,
    })) || 'unavailable',
    time: new Date().toISOString(),
  })
})

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'API is running' })
})

// DB health check
app.get('/health', async (_req, res) => {
  try {
    const { initDb } = await import('./db')
    await initDb()
    const result = await db.get('SELECT NOW() as now')
    res.json({ status: 'ok', db: 'connected', now: result?.now })
  } catch (err: any) {
    console.error('Health check failed:', err?.message || err)
    res.status(500).json({ status: 'error', db: 'disconnected', error: err?.message || String(err) })
  }
})

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Server error:', err)
  const message = typeof err === 'string' ? err : (err?.message || 'Internal Server Error')
  res.status(err.status || 500).json({
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})

// Routes call initDb() themselves before querying

// Export for Vercel serverless
import serverless from 'serverless-http'
export default serverless(app)

// Local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}
