import { Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './middleware/auth.js'
import { db, initDb, dbWriteSafe } from './db.js'
import { startHlsBroadcast, restartHlsBroadcast, feedHlsChunk, stopHlsBroadcast, isHlsActive } from './hls.js'
import { pauseRadioForBroadcast, resumeRadioAfterBroadcast } from './sermon-radio.js'

let io: SocketIOServer | null = null

export function getIO() { return io }

export function initWebSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
    pingInterval: 5000,
    pingTimeout: 10000,
    connectTimeout: 15000,
  })

  io.on('connection', (socket) => {
    let userId: string | null = null
    let userName: string | null = null
    let currentRoom: string | null = null
    console.log(`[WS] socket connected: ${socket.id} transport=${socket.conn.transport.name}`)

    socket.on('disconnect', (reason) => {
      console.log(`[WS] socket disconnected: ${socket.id} reason=${reason}`)
    })

    socket.conn.on('upgrade', (transport) => {
      console.log(`[WS] ${socket.id} upgraded to ${transport.name}`)
    })

    const token = socket.handshake.auth?.token as string | undefined
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        userId = decoded?.id || null
        userName = decoded?.name || null
      } catch {}
    }

    socket.on('join_broadcast', async (broadcastId: string) => {
      try {
        await initDb()
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1', [broadcastId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found' })
          return
        }
        if (currentRoom) socket.leave(currentRoom)
        currentRoom = `broadcast_${broadcastId}`
        socket.join(currentRoom)
      } catch (err: any) {
        console.error('[WS] join_broadcast error:', err.message)
        socket.emit('error', { message: 'Failed to join broadcast' })
      }
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

        // Verify broadcast exists
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1', [broadcastId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found' })
          return
        }

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

    socket.on('broadcast_chunk', async (payload: { broadcastId: string; chunkIndex: number; chunkData: string }, ack?: () => void) => {
      const { broadcastId, chunkIndex, chunkData } = payload
      try {
        // Feed HLS encoder FIRST — this is the critical path.
        // Start HLS if not already active (e.g. after server restart mid-broadcast)
        if (!isHlsActive(broadcastId)) {
          console.log(`[WS] ${broadcastId} chunk ${chunkIndex}: HLS not active, starting`)
          await startHlsBroadcast(broadcastId, true)
        }
        await feedHlsChunk(broadcastId, chunkIndex, chunkData)

        // Acknowledge immediately after FFmpeg receives the chunk
        if (ack) ack()

        // Relay to listeners in real-time
        io!.to(`broadcast_${broadcastId}`).emit('stream_chunk', { chunkIndex, chunkData })

        // Persist for replay / late joiners — fire-and-forget, never block streaming
        dbWriteSafe(
          `INSERT INTO stream_chunks (id, broadcast_id, chunk_index, chunk_data) VALUES ($1, $2, $3, $4)
           ON CONFLICT (broadcast_id, chunk_index) DO UPDATE SET chunk_data = EXCLUDED.chunk_data, created_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), broadcastId, chunkIndex, chunkData]
        )
        // Keep last 300 chunks (~10 minutes at 2s interval) — fire-and-forget
        dbWriteSafe(
          `DELETE FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index < $2`,
          [broadcastId, chunkIndex - 300]
        )
      } catch (err: any) {
        console.error('[WS] broadcast_chunk error:', err.message)
      }
    })

    socket.on('start_broadcast_hls', async (broadcastId: string) => {
      try {
        await initDb()
        console.log(`[WS] start_broadcast_hls ${broadcastId} userId=${userId}`)
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1', [broadcastId])
        if (!broadcast) {
          console.warn(`[WS] start_broadcast_hls ${broadcastId}: not found`)
          socket.emit('error', { message: 'Broadcast not found' })
          return
        }
        await pauseRadioForBroadcast()
        if (!isHlsActive(broadcastId)) {
          await restartHlsBroadcast(broadcastId)
        } else {
          console.log(`[WS] start_broadcast_hls ${broadcastId}: HLS already active, keeping existing encoder`)
        }
      } catch (err: any) {
        console.error('[WS] start_broadcast_hls error:', err.message)
      }
    })

    socket.on('end_broadcast_hls', async (broadcastId: string) => {
      try {
        await initDb()
        console.log(`[WS] end_broadcast_hls ${broadcastId} userId=${userId}`)
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1', [broadcastId])
        if (!broadcast) {
          console.warn(`[WS] end_broadcast_hls ${broadcastId}: not found`)
          socket.emit('error', { message: 'Broadcast not found' })
          return
        }
        stopHlsBroadcast(broadcastId)
        await resumeRadioAfterBroadcast()
      } catch (err: any) {
        console.error('[WS] end_broadcast_hls error:', err.message)
      }
    })

    socket.on('disconnect', () => {
      if (currentRoom) socket.leave(currentRoom)
    })
  })

  return io
}
