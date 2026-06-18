import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { initDb } from './db'
import { setupStreaming } from './services/streaming'
import authRoutes from './routes/auth'
import broadcastRoutes from './routes/broadcasts'
import sermonRoutes from './routes/sermons'
import statusRoutes from './routes/status'
import streamRoutes from './routes/stream'
import rtmpRoutes from './routes/rtmp'
import chatRoutes from './routes/chat'
import prayerRoutes from './routes/prayer'
import scheduleRoutes from './routes/schedule'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
})

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// Mount all API routes at root (Vercel will add /api prefix)
app.use('/auth', authRoutes)
app.use('/broadcasts', broadcastRoutes)
app.use('/sermons', sermonRoutes)
app.use('/status', statusRoutes)
app.use('/stream', streamRoutes)
app.use('/rtmp', rtmpRoutes)
app.use('/chat', chatRoutes)
app.use('/prayer', prayerRoutes)
app.use('/schedule', scheduleRoutes)

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'API is running' })
})

setupStreaming(io)

// Initialize database
initDb().catch(console.error)

// Export for Vercel serverless
import serverless from 'serverless-http'
export default serverless(app)

// Local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}
