import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { EventEmitter } from 'events'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { startHlsBroadcast, feedHlsChunk, stopHlsBroadcast, isHlsActive, getHlsManifestUrl } from '../hls.js'

const router = Router()
const liveEmitter = new EventEmitter()
liveEmitter.setMaxListeners(500)

// Matroska Cluster element ID: 0x1F43B675
const CLUSTER_ID = Buffer.from([0x1F, 0x43, 0xB6, 0x75])

function mergeWebMChunks(chunks: Buffer[]): Buffer {
  if (chunks.length === 0) return Buffer.alloc(0)
  if (chunks.length === 1) return chunks[0]
  const result: Buffer[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i]
    let found = false
    for (let j = 0; j <= chunk.length - 4; j++) {
      if (chunk[j] === CLUSTER_ID[0] && chunk[j+1] === CLUSTER_ID[1] &&
          chunk[j+2] === CLUSTER_ID[2] && chunk[j+3] === CLUSTER_ID[3]) {
        result.push(chunk.subarray(j))
        found = true
        break
      }
    }
    if (!found) result.push(chunk) // fallback
  }
  return Buffer.concat(result)
}

// Upload chunk (broadcaster)
// All chunks (including chunk 0 which contains the init segment) are stored in stream_chunks
router.post('/:id/chunk', authenticateToken, requireRole('broadcaster', 'admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await initDb()
    const { chunkIndex, chunkData } = req.body
    if (typeof chunkData !== 'string' || chunkData.length === 0) {
      res.status(400).json({ error: 'Invalid chunk data' }); return
    }

    const chunkId = uuidv4()
    await db.query(
      `INSERT INTO stream_chunks (id, broadcast_id, chunk_index, chunk_data) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [chunkId, req.params.id, chunkIndex, chunkData]
    )
    // Keep last 300 chunks (~10 minutes at 2s interval)
    await db.query(
      `DELETE FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index < $2`,
      [req.params.id, chunkIndex - 300]
    )
    res.json({ success: true })
    // Feed HLS encoder
    startHlsBroadcast(req.params.id)
    feedHlsChunk(req.params.id, chunkData)
    // Notify live listeners that a new chunk is available
    liveEmitter.emit(`chunk:${req.params.id}`, chunkIndex)
  } catch (err: any) {
    console.error('[STREAM] chunk upload error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Get single chunk
router.get('/:id/chunk/:index', async (req: Request, res: Response) => {
  try {
    await initDb()
    const row = await db.get(
      `SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=$2`,
      [req.params.id, req.params.index]
    )
    if (!row) { res.status(404).json({ error: 'Chunk not found' }); return }
    const buffer = Buffer.from(row.chunk_data, 'base64')
    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.send(buffer)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Concat endpoint: returns a decodable WebM blob for AudioContext.decodeAudioData
// Always includes chunk 0 (init segment) + requested data chunks
router.get('/:id/concat', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { id } = req.params
    const fromIndex = parseInt(req.query.from as string || '1', 10)

    // Fetch chunk 0 (WebM init/header — contains EBML + Segment + Tracks)
    // Fall back to broadcasts.init_segment for compatibility with old schema
    const initRow = await db.get(
      `SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=0`,
      [id]
    )
    let initBuf: Buffer | null = null
    if (initRow) {
      initBuf = Buffer.from(initRow.chunk_data, 'base64')
    } else {
      const bcast = await db.get(`SELECT init_segment FROM broadcasts WHERE id=$1`, [id])
      if (bcast?.init_segment) initBuf = Buffer.from(bcast.init_segment, 'base64')
    }
    if (!initBuf) {
      res.status(404).json({ error: 'No stream data yet' }); return
    }

    // Fetch requested data chunks (chunk_index >= fromIndex, skip chunk 0)
    let rows = await db.all(
      `SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index >= $2 AND chunk_index > 0 ORDER BY chunk_index ASC LIMIT 20`,
      [id, Math.max(fromIndex, 1)]
    )

    // If no new chunks, fall back to latest 5 data chunks
    if (!rows.length) {
      rows = await db.all(
        `SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index > 0 ORDER BY chunk_index DESC LIMIT 5`,
        [id]
      )
      if (!rows.length) {
        res.status(404).json({ error: 'No audio chunks yet' }); return
      }
      rows = rows.reverse()
    }

    // Build: chunk 0 (full, as-is from MediaRecorder — EBML+Segment+Tracks+first Cluster)
    // + cluster-only data from subsequent chunks
    const parts: Buffer[] = [initBuf]
    let latestIndex = -1
    for (const row of rows) {
      const chunkBuf = Buffer.from(row.chunk_data, 'base64')
      // Extract only the Cluster portion (strip any accidental re-emitted header)
      let clusterStart = 0
      for (let j = 0; j <= chunkBuf.length - 4; j++) {
        if (chunkBuf[j] === CLUSTER_ID[0] && chunkBuf[j+1] === CLUSTER_ID[1] &&
            chunkBuf[j+2] === CLUSTER_ID[2] && chunkBuf[j+3] === CLUSTER_ID[3]) {
          clusterStart = j
          break
        }
      }
      parts.push(chunkBuf.subarray(clusterStart))
      latestIndex = Math.max(latestIndex, row.chunk_index)
    }
    const combined = Buffer.concat(parts)

    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Access-Control-Expose-Headers', 'X-Latest-Chunk')
    res.setHeader('X-Latest-Chunk', String(latestIndex))
    res.send(combined)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// HLS playlist endpoint
router.get('/:id/playlist.m3u8', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { id } = req.params
    const rows = await db.all(
      `SELECT chunk_index FROM stream_chunks WHERE broadcast_id=$1 ORDER BY chunk_index DESC LIMIT 8`,
      [id]
    )
    if (!rows.length) { res.status(404).json({ error: 'No stream data' }); return }

    const indices = rows.map((r: any) => r.chunk_index).sort((a: number, b: number) => a - b)
    const mediaSeq = indices[0]

    let m3u8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:' + mediaSeq + '\n'
    for (const idx of indices) {
      m3u8 += '#EXTINF:2.0,\nchunk/' + idx + '\n'
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.send(m3u8)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Stream info
router.get('/:id/info', async (req: Request, res: Response) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT chunk_index FROM stream_chunks WHERE broadcast_id=$1 ORDER BY chunk_index DESC LIMIT 1`,
      [req.params.id]
    )
    const count = await db.get(`SELECT COUNT(*) as count FROM stream_chunks WHERE broadcast_id=$1`, [req.params.id])
    const listeners = await db.get(`SELECT COUNT(*) as count FROM stream_listeners WHERE broadcast_id=$1`, [req.params.id])
    res.json({
      latestChunk: rows[0]?.chunk_index ?? -1,
      totalChunks: Number(count?.count || 0),
      isLive: rows.length > 0,
      listenerCount: Number(listeners?.count || 0)
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Listener join
router.post('/:id/join', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] as string ||
               req.socket?.remoteAddress || ''
    let country = '', region = '', city = ''
    if (ip && ip !== '::1' && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city,status`)
        const geo = await geoRes.json() as any
        if (geo.status === 'success') { country = geo.country || ''; region = geo.regionName || ''; city = geo.city || '' }
      } catch {}
    }
    await db.query(
      `INSERT INTO stream_listeners (id, broadcast_id, session_id, last_seen, ip, country, region, city) VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7)`,
      [uuidv4(), req.params.id, sessionId, ip, country, region, city]
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Listener heartbeat
router.post('/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    await db.query(
      `UPDATE stream_listeners SET last_seen=NOW() WHERE broadcast_id=$1 AND session_id=$2`,
      [req.params.id, sessionId]
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Listener leave
router.post('/:id/leave', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { sessionId } = req.body
    if (!sessionId) { res.status(400).json({ error: 'Missing sessionId' }); return }
    await db.query(
      `DELETE FROM stream_listeners WHERE broadcast_id=$1 AND session_id=$2`,
      [req.params.id, sessionId]
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Clear stream chunks (called when broadcast ends)
router.delete('/:id', authenticateToken, requireRole('broadcaster', 'admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await initDb()
    await db.query(`DELETE FROM stream_chunks WHERE broadcast_id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Helper: extract init segment (EBML + Segment + Tracks, up to first Cluster)
function extractInit(buf: Buffer): Buffer | null {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(0, j)
    }
  }
  return null // no cluster found — invalid
}

// Helper: extract cluster data (from first Cluster to end)
function extractCluster(buf: Buffer): Buffer {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(j)
    }
  }
  return buf // fallback
}

const SEGMENT_ID = Buffer.from([0x18, 0x53, 0x80, 0x67])

// EBML VINT unknown-size encodings by class
const UNKNOWN_SIZE: Record<number, Buffer> = {
  1: Buffer.from([0x7F]),
  2: Buffer.from([0x7F, 0xFF]),
  3: Buffer.from([0x3F, 0xFF, 0xFF]),
  4: Buffer.from([0x1F, 0xFF, 0xFF, 0xFF]),
  5: Buffer.from([0x0F, 0xFF, 0xFF, 0xFF, 0xFF]),
  6: Buffer.from([0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
  7: Buffer.from([0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
  8: Buffer.from([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
}

function vintWidth(firstByte: number): number {
  if (firstByte >= 0x80) return 1
  if (firstByte >= 0x40) return 2
  if (firstByte >= 0x20) return 3
  if (firstByte >= 0x10) return 4
  if (firstByte >= 0x08) return 5
  if (firstByte >= 0x04) return 6
  if (firstByte >= 0x02) return 7
  return 8
}

// Modify init segment so Segment has unknown size (required for MSE streaming)
function makeStreamingInit(buf: Buffer): Buffer | null {
  const init = extractInit(buf)
  if (!init) return null
  // Find Segment element ID
  for (let i = 0; i <= init.length - 4; i++) {
    if (init[i] === SEGMENT_ID[0] && init[i+1] === SEGMENT_ID[1] &&
        init[i+2] === SEGMENT_ID[2] && init[i+3] === SEGMENT_ID[3]) {
      const sizeStart = i + 4
      if (sizeStart >= init.length) break
      const width = vintWidth(init[sizeStart])
      const unk = UNKNOWN_SIZE[width]
      if (!unk) break
      const before = init.subarray(0, sizeStart)
      const after = init.subarray(sizeStart + width)
      return Buffer.concat([before, unk, after])
    }
  }
  return init // fallback: return unmodified
}

// MSE init segment endpoint
router.get('/:id/init', async (req: Request, res: Response) => {
  try {
    await initDb()
    const row = await db.get(
      `SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=0`,
      [req.params.id]
    )
    if (!row) { res.status(404).json({ error: 'No stream data' }); return }
    const buf = Buffer.from(row.chunk_data, 'base64')
    const init = makeStreamingInit(buf)
    if (!init) { res.status(404).json({ error: 'Invalid chunk 0' }); return }
    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(init)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// MSE live SSE: sends init then clusters as they arrive
router.get('/:id/live-sse', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { id } = req.params

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // Send init segment
    const initRow = await db.get(
      `SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=0`,
      [id]
    )
    if (!initRow) { res.write('event: error\ndata: no stream\n\n'); res.end(); return }
    const initBuf = Buffer.from(initRow.chunk_data, 'base64')
    const init = makeStreamingInit(initBuf)
    if (!init) { res.write('event: error\ndata: invalid init\n\n'); res.end(); return }
    res.write(`event: init\ndata: ${init.toString('base64')}\n\n`)

    let latestSent = -1

    // Send existing clusters
    const rows = await db.all(
      `SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index > 0 ORDER BY chunk_index ASC LIMIT 120`,
      [id]
    )
    for (const row of rows) {
      const buf = Buffer.from(row.chunk_data, 'base64')
      const cluster = extractCluster(buf)
      res.write(`event: cluster\ndata: ${cluster.toString('base64')}\n\n`)
      latestSent = row.chunk_index
    }

    // Listen for new chunks
    const onChunk = async (chunkIndex: number) => {
      try {
        if (chunkIndex <= latestSent) return
        const row = await db.get(
          `SELECT chunk_data FROM stream_chunks WHERE broadcast_id=$1 AND chunk_index=$2`,
          [id, chunkIndex]
        )
        if (!row) return
        const buf = Buffer.from(row.chunk_data, 'base64')
        const cluster = extractCluster(buf)
        res.write(`event: cluster\ndata: ${cluster.toString('base64')}\n\n`)
        latestSent = chunkIndex
      } catch (err: any) {
        console.error('[SSE] chunk relay error:', err.message)
      }
    }

    liveEmitter.on(`chunk:${id}`, onChunk)

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => { res.write(':ping\n\n') }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      liveEmitter.off(`chunk:${id}`, onChunk)
    })
  } catch (err: any) {
    console.error('[SSE] error:', err.message)
    if (!res.headersSent) res.status(500).end()
    else res.end()
  }
})

// Geo analytics (admin only)
router.get('/:id/listeners/geo', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT country, region, city, COUNT(*) as count FROM stream_listeners
       WHERE broadcast_id=$1 AND last_seen > NOW() - INTERVAL '5 minutes'
         AND country IS NOT NULL AND country != ''
       GROUP BY country, region, city ORDER BY count DESC LIMIT 50`,
      [req.params.id])
    const byCountry = await db.all(
      `SELECT country, COUNT(*) as count FROM stream_listeners
       WHERE broadcast_id=$1 AND last_seen > NOW() - INTERVAL '5 minutes'
         AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY count DESC LIMIT 20`,
      [req.params.id])
    res.json({ locations: rows, byCountry })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
