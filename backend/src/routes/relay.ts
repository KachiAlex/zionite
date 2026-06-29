import { Router, Request, Response } from 'express'
import { db, initDb } from '../db.js'

const router = Router()

// Matroska Cluster element ID: 0x1F43B675
const CLUSTER_ID = Buffer.from([0x1F, 0x43, 0xB6, 0x75])

function extractCluster(buf: Buffer): Buffer {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(j)
    }
  }
  return buf
}

// Map broadcastId -> active relay state
const relays = new Map<string, {
  latestChunk: number
  listeners: Set<Response>
  fetchTimer: ReturnType<typeof setInterval> | null
  ended: boolean
  nextIndex: number
  initSent: Set<Response>
}>()

function getRelay(broadcastId: string) {
  if (!relays.has(broadcastId)) {
    relays.set(broadcastId, {
      latestChunk: -1,
      listeners: new Set(),
      fetchTimer: null,
      ended: false,
      nextIndex: 0,
      initSent: new Set()
    })
  }
  return relays.get(broadcastId)!
}

function stopRelay(broadcastId: string) {
  const relay = relays.get(broadcastId)
  if (!relay) return
  if (relay.fetchTimer) { clearInterval(relay.fetchTimer); relay.fetchTimer = null }
  for (const res of relay.listeners) {
    try { res.end() } catch {}
  }
  relay.listeners.clear()
  relay.initSent.clear()
  relays.delete(broadcastId)
  console.log(`[RELAY] stopped ${broadcastId}`)
}

async function sendInitToListener(broadcastId: string, res: Response) {
  const relay = getRelay(broadcastId)
  if (relay.initSent.has(res)) return
  try {
    const row = await db.get(
      'SELECT chunk_data FROM stream_chunks WHERE broadcast_id = $1 AND chunk_index = 0',
      [broadcastId]
    )
    if (!row) return
    const buf = Buffer.from(row.chunk_data, 'base64')
    res.write(buf) // send chunk 0 as-is (contains init + first cluster)
    relay.initSent.add(res)
  } catch {}
}

async function startFetchLoop(broadcastId: string) {
  const relay = getRelay(broadcastId)
  if (relay.fetchTimer) return

  relay.fetchTimer = setInterval(async () => {
    try {
      const broadcast = await db.get('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
      if (!broadcast || broadcast.status !== 'live') {
        // Drain remaining then stop
        const remaining = await db.all(
          'SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id = $1 AND chunk_index >= $2 ORDER BY chunk_index ASC',
          [broadcastId, relay.nextIndex]
        )
        for (const row of remaining) {
          const buf = row.chunk_index === 0
            ? Buffer.from(row.chunk_data, 'base64')
            : extractCluster(Buffer.from(row.chunk_data, 'base64'))
          for (const res of relay.listeners) {
            try { res.write(buf) } catch {}
          }
          relay.nextIndex = row.chunk_index + 1
        }
        stopRelay(broadcastId)
        return
      }

      const rows = await db.all<{ chunk_index: number; chunk_data: string }>(
        'SELECT chunk_index, chunk_data FROM stream_chunks WHERE broadcast_id = $1 AND chunk_index >= $2 ORDER BY chunk_index ASC LIMIT 30',
        [broadcastId, relay.nextIndex]
      )

      if (rows.length === 0) return

      for (const row of rows) {
        const raw = Buffer.from(row.chunk_data, 'base64')
        // Chunk 0: send as-is (init + first cluster). Chunks 1+: strip init, keep cluster only.
        const buf = row.chunk_index === 0 ? raw : extractCluster(raw)
        for (const res of relay.listeners) {
          // Ensure each listener gets init first
          if (row.chunk_index > 0 && !relay.initSent.has(res)) {
            await sendInitToListener(broadcastId, res)
          }
          try { res.write(buf) } catch {}
        }
        relay.nextIndex = row.chunk_index + 1
        relay.latestChunk = row.chunk_index
      }
    } catch (err: any) {
      console.error('[RELAY] fetch error:', err.message)
    }
  }, 1500)
}

// Continuous HTTP stream for <audio> element
router.get('/:broadcastId/stream', async (req: Request, res: Response) => {
  const broadcastId = req.params.broadcastId as string

  try {
    await initDb()

    // Verify broadcast exists and is live
    const broadcast = await db.get('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    if (broadcast.status !== 'live') { res.status(404).json({ error: 'Broadcast not live' }); return }

    // Set headers for continuous audio streaming
    res.setHeader('Content-Type', 'audio/webm;codecs=opus')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const relay = getRelay(broadcastId)
    relay.listeners.add(res)

    // Start fetch loop on first listener
    if (relay.listeners.size === 1) {
      console.log(`[RELAY] started ${broadcastId}`)
      startFetchLoop(broadcastId)
    }

    // Remove listener on disconnect
    req.on('close', () => {
      relay.listeners.delete(res)
      if (relay.listeners.size === 0) {
        stopRelay(broadcastId)
      }
    })

    req.on('error', () => {
      relay.listeners.delete(res)
      if (relay.listeners.size === 0) {
        stopRelay(broadcastId)
      }
    })
  } catch (err: any) {
    console.error('[RELAY] stream error:', err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream error' })
    } else {
      res.end()
    }
  }
})

// Health/status check
router.get('/:broadcastId/status', async (req: Request, res: Response) => {
  try {
    await initDb()
    const broadcastId = req.params.broadcastId as string
    const relay = relays.get(broadcastId)
    const broadcast = await db.get('SELECT status FROM broadcasts WHERE id = $1', [broadcastId])
    res.json({
      live: broadcast?.status === 'live',
      relayActive: !!relay && relay.listeners.size > 0,
      listeners: relay?.listeners.size || 0,
      latestChunk: relay?.latestChunk ?? -1
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
