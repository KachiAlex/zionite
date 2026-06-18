import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth'
import {
  startRTMPStream,
  sendAudioChunk,
  stopRTMPStream,
  getStream,
  getCOPEmbedUrl,
  generateStreamKey,
} from '../services/rtmpStreaming'

const router = Router()

// Start broadcast with RTMP streaming to Church Online Platform
router.post(
  '/start',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  async (req: AuthRequest, res) => {
    const { title, description, scripture_reference, rtmpUrl, churchOnlineId } = req.body
    if (!title) {
      res.status(400).json({ error: 'Title is required' })
      return
    }

    const db = await getDb()
    const existingLive = await db.get(
      'SELECT * FROM broadcasts WHERE status = $1',
      ['live']
    )
    if (existingLive) {
      res.status(409).json({ error: 'A broadcast is already live' })
      return
    }

    const id = uuidv4()
    const streamKey = generateStreamKey()
    
    // Use provided RTMP URL or default to Church Online Platform
    const targetRtmp = rtmpUrl || 'rtmp://live.churchonlineplatform.com/live'

    try {
      // Start FFmpeg RTMP stream
      await startRTMPStream(id, targetRtmp, streamKey)

      // Create broadcast record
      await db.run(
        'INSERT INTO broadcasts (id, title, description, scripture_reference, status, started_at, broadcaster_id, stream_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, title, description || '', scripture_reference || '', 'live', new Date().toISOString(), req.user!.id, streamKey]
      )

      const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
      
      // Generate Church Online Platform embed URL if provided
      const copEmbedUrl = churchOnlineId ? getCOPEmbedUrl(churchOnlineId) : null

      res.status(201).json({
        broadcast,
        rtmp: {
          url: targetRtmp,
          streamKey,
          fullUrl: `${targetRtmp}/${streamKey}`,
        },
        churchOnline: copEmbedUrl ? {
          embedUrl: copEmbedUrl,
          settings: {
            chat: true,
            bible: true,
            notes: true,
            prayer: true,
          }
        } : null,
      })
    } catch (err: any) {
      console.error('Failed to start RTMP stream:', err)
      res.status(500).json({ error: 'Failed to start stream', details: err.message })
    }
  }
)

// Send audio chunk to RTMP stream
router.post(
  '/chunk/:broadcastId',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  async (req: AuthRequest, res) => {
    const { broadcastId } = req.params

    const db = await getDb()
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [broadcastId])
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' })
      return
    }
    if (broadcast.broadcaster_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    // Receive raw audio data from request body
    const chunk = req.body
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
      res.status(400).json({ error: 'Audio chunk required in request body' })
      return
    }

    const success = await sendAudioChunk(broadcastId, chunk)
    if (!success) {
      res.status(400).json({ error: 'Failed to process chunk - stream may have ended' })
      return
    }

    res.json({ received: true, bytes: chunk.length })
  }
)

// End RTMP broadcast
router.post(
  '/end/:broadcastId',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  async (req: AuthRequest, res) => {
    const { broadcastId } = req.params

    const db = await getDb()
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [broadcastId])
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' })
      return
    }
    if (broadcast.broadcaster_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    // Stop RTMP stream
    const audioPath = await stopRTMPStream(broadcastId)

    const updated = await db.get('SELECT * FROM broadcasts WHERE id = $1', [broadcastId])
    res.json({ broadcast: updated, audioPath })
  }
)

// Get Church Online Platform configuration
router.get('/cop-config', async (_req, res) => {
  // Return COP configuration - church would set this in env vars or admin panel
  res.json({
    platform: 'Church Online Platform',
    website: 'https://churchonlineplatform.com',
    features: [
      'live-streaming',
      'chat',
      'bible-integration',
      'prayer-requests',
      'notes',
      'polls',
    ],
    requirements: [
      'RTMP encoder (OBS, vMix, or browser)',
      'Stream key from COP dashboard',
      'Church ID for embed',
    ],
  })
})

// Get active stream status
router.get('/status/:broadcastId', async (req, res) => {
  const { broadcastId } = req.params
  const stream = getStream(broadcastId)

  if (!stream) {
    res.status(404).json({ error: 'Stream not found' })
    return
  }

  const duration = Date.now() - stream.startTime.getTime()

  res.json({
    broadcastId,
    isLive: true,
    rtmpUrl: stream.rtmpUrl,
    streamKey: stream.streamKey,
    duration,
    startedAt: stream.startTime,
  })
})

export default router
