import { Server } from 'socket.io'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db'

const chunksDir = './data/chunks'
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir, { recursive: true })
}

interface BroadcastStream {
  broadcastId: string
  chunkIndex: number
  broadcasterSocketId: string
}

const activeStreams = new Map<string, BroadcastStream>()

export function setupStreaming(io: Server) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('broadcaster-join', (broadcastId: string) => {
      socket.join(`broadcast:${broadcastId}`)
      activeStreams.set(broadcastId, {
        broadcastId,
        chunkIndex: 0,
        broadcasterSocketId: socket.id,
      })
      console.log(`Broadcaster joined broadcast:${broadcastId}`)
    })

    socket.on('audio-chunk', async ({ broadcastId, chunk }: { broadcastId: string; chunk: ArrayBuffer }) => {
      const stream = activeStreams.get(broadcastId)
      if (!stream || stream.broadcasterSocketId !== socket.id) return

      const broadcastDir = path.join(chunksDir, broadcastId)
      if (!fs.existsSync(broadcastDir)) {
        fs.mkdirSync(broadcastDir, { recursive: true })
      }

      const chunkPath = path.join(broadcastDir, `${stream.chunkIndex}.webm`)
      fs.writeFileSync(chunkPath, Buffer.from(chunk))

      // Store chunk reference in DB
      const db = await getDb()
      await db.run(
        'INSERT INTO audio_chunks (id, broadcast_id, chunk_index, file_path) VALUES (?, ?, ?, ?)',
        [`${broadcastId}-${stream.chunkIndex}`, broadcastId, stream.chunkIndex, chunkPath]
      )

      stream.chunkIndex++

      // Forward to listeners
      socket.to(`broadcast:${broadcastId}`).emit('audio-chunk', {
        chunkIndex: stream.chunkIndex - 1,
        chunk: Buffer.from(chunk),
      })
    })

    socket.on('listener-join', (broadcastId: string) => {
      socket.join(`broadcast:${broadcastId}`)
      console.log(`Listener joined broadcast:${broadcastId}`)
    })

    socket.on('disconnect', async () => {
      for (const [broadcastId, stream] of activeStreams.entries()) {
        if (stream.broadcasterSocketId === socket.id) {
          // Broadcaster disconnected - mark as ended
          const db = await getDb()
          await db.run(
            'UPDATE broadcasts SET status = ?, ended_at = ? WHERE id = ?',
            ['ended', new Date().toISOString(), broadcastId]
          )
          activeStreams.delete(broadcastId)
          io.to(`broadcast:${broadcastId}`).emit('broadcast-ended', { broadcastId })
          console.log(`Broadcast ${broadcastId} ended due to broadcaster disconnect`)
          break
        }
      }
      console.log('Client disconnected:', socket.id)
    })
  })
}

export async function finalizeBroadcast(broadcastId: string) {
  const broadcastDir = path.join(chunksDir, broadcastId)
  if (!fs.existsSync(broadcastDir)) return

  const db = await getDb()
  const chunks = await db.all(
    'SELECT * FROM audio_chunks WHERE broadcast_id = $1 ORDER BY chunk_index ASC',
    [broadcastId]
  )

  if (chunks.length === 0) return

  // Concatenate chunks into a single file
  const outputPath = `./uploads/sermons/${broadcastId}.webm`
  const outputStream = fs.createWriteStream(outputPath)

  for (const chunk of chunks) {
    const data = fs.readFileSync(chunk.file_path)
    outputStream.write(data)
  }
  outputStream.end()

  await db.run(
    'UPDATE broadcasts SET audio_path = ? WHERE id = ?',
    [outputPath, broadcastId]
  )

  // Clean up chunk files
  for (const chunk of chunks) {
    try {
      fs.unlinkSync(chunk.file_path)
    } catch {
      // ignore
    }
  }
  try {
    fs.rmdirSync(broadcastDir)
  } catch {
    // ignore
  }
}
