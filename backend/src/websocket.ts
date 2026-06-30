import { Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './middleware/auth.js'
import { db, initDb } from './db.js'
import { startHlsBroadcast, feedHlsChunk, stopHlsBroadcast } from './hls.js'

let io: SocketIOServer | null = null

export function getIO() { return io }

export function initWebSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  })

  io.on('connection', (socket) => {
    let userId: string | null = null
    let userName: string | null = null
    let currentRoom: string | null = null

    const token = socket.handshake.auth?.token as string | undefined
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        userId = decoded?.id || null
        userName = decoded?.name || null
      } catch {}
    }

    socket.on('join_broadcast', (broadcastId: string) => {
      if (currentRoom) socket.leave(currentRoom)
      currentRoom = `broadcast_${broadcastId}`
      socket.join(currentRoom)
    })

    socket.on('leave_broadcast', () => {
      if (currentRoom) { socket.leave(currentRoom); currentRoom = null }
    })

    socket.on('send_message', async (payload: { broadcastId: string; message: string; recipientId?: string }) => {
      try {
        await initDb()
        const { broadcastId, message, recipientId } = payload
        const trimmed = message.trim()
        if (!trimmed) return

        const isPrivate = !!recipientId
        const id = crypto.randomUUID()
        await db.run(
          `INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, recipient_id, message, is_private) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, broadcastId, userId, userName, recipientId || null, trimmed, isPrivate]
        )

        const msg = { id, broadcast_id: broadcastId, user_id: userId, user_name: userName, recipient_id: recipientId || null, message: trimmed, is_private: isPrivate, created_at: new Date().toISOString() }
        const room = `broadcast_${broadcastId}`
        if (isPrivate && recipientId) {
          io!.to(room).emit('new_message', msg)
        } else {
          io!.to(room).emit('new_message', msg)
        }
      } catch (err: any) {
        console.error('[WS] send_message error:', err.message)
      }
    })

    socket.on('send_guest_message', async (payload: { broadcastId: string; message: string; guestName: string }) => {
      try {
        await initDb()
        const { broadcastId, message, guestName } = payload
        const trimmed = message.trim()
        const gName = (guestName || 'Guest').trim()
        if (!trimmed) return

        const id = crypto.randomUUID()
        await db.run(
          `INSERT INTO chat_messages (id, broadcast_id, guest_name, message, is_private) VALUES ($1, $2, $3, $4, $5)`,
          [id, broadcastId, gName, trimmed, false]
        )

        const msg = { id, broadcast_id: broadcastId, guest_name: gName, message: trimmed, is_private: false, created_at: new Date().toISOString() }
        io!.to(`broadcast_${broadcastId}`).emit('new_message', msg)
      } catch (err: any) {
        console.error('[WS] guest message error:', err.message)
      }
    })

    socket.on('broadcast_chunk', async (payload: { broadcastId: string; chunkIndex: number; chunkData: string }) => {
      try {
        await initDb()
        const { broadcastId, chunkIndex, chunkData } = payload
        // Persist for replay / late joiners
        await db.run(
          `INSERT INTO stream_chunks (id, broadcast_id, chunk_index, chunk_data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [crypto.randomUUID(), broadcastId, chunkIndex, chunkData]
        )
        // Relay to all listeners in real-time
        io!.to(`broadcast_${broadcastId}`).emit('stream_chunk', { chunkIndex, chunkData })
        // Feed HLS encoder
        startHlsBroadcast(broadcastId)
        feedHlsChunk(broadcastId, chunkData)
      } catch (err: any) {
        console.error('[WS] broadcast_chunk error:', err.message)
      }
    })

    socket.on('start_broadcast_hls', (broadcastId: string) => {
      startHlsBroadcast(broadcastId)
    })

    socket.on('end_broadcast_hls', (broadcastId: string) => {
      stopHlsBroadcast(broadcastId)
    })

    socket.on('disconnect', () => {
      if (currentRoom) socket.leave(currentRoom)
    })
  })

  return io
}
