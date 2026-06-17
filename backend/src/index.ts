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

app.use('/api/auth', authRoutes)
app.use('/api/broadcasts', broadcastRoutes)
app.use('/api/sermons', sermonRoutes)
app.use('/api/status', statusRoutes)

setupStreaming(io)

const PORT = process.env.PORT || 3001

async function start() {
  await initDb()
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start()
