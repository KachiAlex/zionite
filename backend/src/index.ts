import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDb, db } from './db'
import authRoutes from './routes/auth'
import broadcastRoutes from './routes/broadcasts'
import sermonRoutes from './routes/sermons'
import statusRoutes from './routes/status'
import chatRoutes from './routes/chat'
import prayerRoutes from './routes/prayer'
import scheduleRoutes from './routes/schedule'

const app = express()

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

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'API is running' })
})

// DB health check
app.get('/health', async (_req, res) => {
  try {
    const result = await db.get('SELECT NOW() as now')
    res.json({ status: 'ok', db: 'connected', now: result?.now })
  } catch (err: any) {
    console.error('Health check failed:', err?.message)
    res.status(500).json({ status: 'error', db: 'disconnected', error: err?.message })
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

// Initialize database lazily — don't block Vercel cold start
initDb().catch(err => console.error('DB init failed (non-blocking):', err?.message || err))

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
