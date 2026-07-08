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
  })

  io.on('connection', (socket) => {
    let userId: string | null = null
    let userName: string | null = null
    let tenantId: string | null = null
    let currentRoom: string | null = null

    const token = socket.handshake.auth?.token as string | undefined
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        userId = decoded?.id || null
        userName = decoded?.name || null
        tenantId = decoded?.tenantId || null
      } catch {}
    }

    socket.on('join_broadcast', async (broadcastId: string) => {
      try {
        await initDb()
        // Verify broadcast belongs to tenant
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1 AND tenant_id=$2', [broadcastId, tenantId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found or access denied' })
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

        // Verify broadcast belongs to tenant
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1 AND tenant_id=$2', [broadcastId, tenantId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found or access denied' })
          return
        }

        const isPrivate = !!recipientId
        const id = crypto.randomUUID()
        await db.run(
          `INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, recipient_id, message, is_private, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, broadcastId, userId, userName, recipientId || null, trimmed, isPrivate, tenantId]
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

        // Verify broadcast belongs to tenant (guests don't have tenantId, so we skip this check for now)
        // In a real multi-tenant setup, guest access should also be tenant-scoped
        const id = crypto.randomUUID()
        await db.run(
          `INSERT INTO chat_messages (id, broadcast_id, guest_name, message, is_private, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, broadcastId, gName, trimmed, false, tenantId]
        )

        const msg = { id, broadcast_id: broadcastId, guest_name: gName, message: trimmed, is_private: false, created_at: new Date().toISOString() }
        io!.to(`broadcast_${broadcastId}`).emit('new_message', msg)
      } catch (err: any) {
        console.error('[WS] guest message error:', err.message)
      }
    })

    socket.on('broadcast_chunk', async (payload: { broadcastId: string; chunkIndex: number; chunkData: string }) => {
      const { broadcastId, chunkIndex, chunkData } = payload
      try {
        await initDb()
        // Verify broadcast belongs to tenant
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1 AND tenant_id=$2', [broadcastId, tenantId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found or access denied' })
          return
        }

        // Feed HLS encoder FIRST — this is the critical path.
        // Start HLS if not already active (e.g. after server restart mid-broadcast)
        if (!isHlsActive(broadcastId)) {
          console.log(`[WS] ${broadcastId} chunk ${chunkIndex}: HLS not active, starting`)
          await startHlsBroadcast(broadcastId, true)
        }
        await feedHlsChunk(broadcastId, chunkIndex, chunkData)

        // Relay to listeners in real-time
        io!.to(`broadcast_${broadcastId}`).emit('stream_chunk', { chunkIndex, chunkData })

        // Persist for replay / late joiners — fire-and-forget, never block streaming
        dbWriteSafe(
          `INSERT INTO stream_chunks (id, broadcast_id, chunk_index, chunk_data, tenant_id) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (broadcast_id, chunk_index) DO UPDATE SET chunk_data = EXCLUDED.chunk_data, created_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), broadcastId, chunkIndex, chunkData, tenantId]
        )
      } catch (err: any) {
        console.error('[WS] broadcast_chunk error:', err.message)
      }
    })

    socket.on('start_broadcast_hls', async (broadcastId: string) => {
      try {
        await initDb()
        // Verify broadcast belongs to tenant
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1 AND tenant_id=$2', [broadcastId, tenantId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found or access denied' })
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
        // Verify broadcast belongs to tenant
        const broadcast = await db.get('SELECT id FROM broadcasts WHERE id=$1 AND tenant_id=$2', [broadcastId, tenantId])
        if (!broadcast) {
          socket.emit('error', { message: 'Broadcast not found or access denied' })
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
