import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { v2 as cloudinary } from 'cloudinary'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { optimizeImage } from '../middleware/optimizeImage.js'
import { pauseRadioForBroadcast, resumeRadioAfterBroadcast } from '../sermon-radio.js'
import { stopHlsBroadcast } from '../hls.js'
import { enqueueNotification } from '../services/notificationService.js'

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  }
})

const uploadRecording = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4']
    cb(null, allowed.some(t => file.mimetype.startsWith(t) || file.mimetype === t))
  }
})

const router = Router()

router.get('/', async (req: any, res) => {
  try {
    await initDb()
    const { date, status } = req.query
    const params: any[] = [req.tenantId]
    let where = ' WHERE tenant_id=$1'

    if (date && typeof date === 'string') {
      where += " AND DATE(COALESCE(started_at, created_at)) = DATE($2)"
      params.push(date)
    }
    if (status && typeof status === 'string') {
      where += ` AND status=$${params.length + 1}`
      params.push(status)
    }

    const broadcasts = await db.all(`SELECT * FROM broadcasts${where} ORDER BY COALESCE(started_at, created_at) DESC`, params)
    res.json({ broadcasts })
  } catch (err: any) {
    console.error('[BROADCASTS] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch broadcasts' })
  }
})

router.get('/active', async (req: any, res) => {
  try {
    await initDb()
    let broadcast = await db.get("SELECT * FROM broadcasts WHERE status = 'live' AND tenant_id=$1 ORDER BY started_at DESC LIMIT 1", [req.tenantId])
    // Fallback: if chunks are flowing but no broadcast record exists (mobile broadcaster
    // may send chunks via WebSocket without creating a DB record), synthesize one.
    if (!broadcast) {
      const recentChunk = await db.get(
        `SELECT sc.broadcast_id, MAX(sc.created_at) as last_chunk_at FROM stream_chunks sc
         JOIN broadcasts b ON b.id = sc.broadcast_id
         WHERE sc.created_at > NOW() - INTERVAL '5 minutes' AND b.tenant_id=$1
         GROUP BY sc.broadcast_id ORDER BY last_chunk_at DESC LIMIT 1`,
        [req.tenantId]
      )
      if (recentChunk) {
        broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [recentChunk.broadcast_id, req.tenantId])
        if (!broadcast) {
          broadcast = {
            id: recentChunk.broadcast_id,
            title: 'Live Broadcast',
            description: 'Streaming now',
            status: 'live',
            started_at: recentChunk.last_chunk_at,
            broadcaster_id: '',
            speaker: null,
            thumbnail_url: null,
            scripture_reference: null,
            church_online_url: null,
            rtmp_url: null,
            stream_key: null,
            recording_url: null,
            recorded_at: null,
            ended_at: null,
            created_at: recentChunk.last_chunk_at,
          }
        }
      }
    }
    res.json({ broadcast: broadcast || null })
  } catch (err: any) {
    console.error('[BROADCASTS] active error:', err.message)
    res.status(500).json({ error: 'Failed to fetch active broadcast' })
  }
})

router.get('/:id', async (req: any, res) => {
  try {
    await initDb()
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [req.params.id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    res.json({ broadcast })
  } catch (err: any) {
    console.error('[BROADCASTS] get error:', err.message)
    res.status(500).json({ error: 'Failed to fetch broadcast' })
  }
})

router.post('/', authenticateToken, requireRole('broadcaster', 'admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, thumbnail_url, speaker, church_online_url, rtmp_url, stream_key } = req.body
    if (!title) { res.status(400).json({ error: 'Title is required' }); return }

    const id = uuidv4()
    await db.run(
      `INSERT INTO broadcasts (id, title, description, scripture_reference, status, broadcaster_id, thumbnail_url, speaker, church_online_url, rtmp_url, stream_key, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)`,
      [id, title, description || null, scripture_reference || null, req.user!.id, thumbnail_url || null, speaker || null, church_online_url || null, rtmp_url || null, stream_key || null, req.tenantId]
    )
    res.json({ id, title, description, scripture_reference, status: 'scheduled', broadcaster_id: req.user!.id, thumbnail_url, speaker, church_online_url, rtmp_url, stream_key })
  } catch (err: any) {
    console.error('[BROADCASTS] create error:', err.message)
    res.status(500).json({ error: 'Failed to create broadcast' })
  }
})

router.post('/uploads/image', authenticateToken, requireRole('broadcaster', 'admin'), uploadImage.single('image'), optimizeImage, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Image file required' }); return }
    const base64 = req.file.buffer.toString('base64')
    const image_url = `data:${req.file.mimetype};base64,${base64}`
    res.json({ image_url })
  } catch (err: any) {
    console.error('[BROADCASTS] upload error:', err.message)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

router.post('/:id/end', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id=$2",
      [id, req.tenantId]
    )
    stopHlsBroadcast(id)
    await resumeRadioAfterBroadcast()
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] end error:', err.message)
    res.status(500).json({ error: 'Failed to end broadcast' })
  }
})

router.patch('/:id/start', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id=$2",
      [id, req.tenantId]
    )
    await pauseRadioForBroadcast()
    enqueueNotification({
      category: 'live_broadcast',
      type: 'live_broadcast_start',
      title: 'We are live!',
      body: `${broadcast.title || 'ZioniteFM'} is streaming now.`,
      url: `/live/${id}`
    }).catch((e: any) => console.error('[BROADCASTS] enqueue notification failed:', e.message))
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] start error:', err.message)
    res.status(500).json({ error: 'Failed to start broadcast' })
  }
})

router.patch('/:id/pause', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'paused' WHERE id = $1 AND tenant_id=$2",
      [id, req.tenantId]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] pause error:', err.message)
    res.status(500).json({ error: 'Failed to pause broadcast' })
  }
})

router.patch('/:id/resume', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'live' WHERE id = $1 AND tenant_id=$2",
      [id, req.tenantId]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] resume error:', err.message)
    res.status(500).json({ error: 'Failed to resume broadcast' })
  }
})

router.patch('/:id/end', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id=$2",
      [id, req.tenantId]
    )
    stopHlsBroadcast(id)
    await resumeRadioAfterBroadcast()
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] end error:', err.message)
    res.status(500).json({ error: 'Failed to end broadcast' })
  }
})

router.get('/stats/overview', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const result = await db.get("SELECT COUNT(*) as total FROM chat_messages")
    const total = parseInt(result?.total || '0', 10)
    res.json({ listening: total, peak: total, avg: Math.floor(total / 2) })
  } catch (err: any) {
    console.error('[BROADCASTS] stats error:', err.message)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

router.post('/:id/recording', authenticateToken, requireRole('broadcaster', 'admin'), uploadRecording.single('recording'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Recording file required' }); return }
    await initDb()
    const recording_url = await new Promise<string>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'zionite/broadcasts', resource_type: 'video', tags: ['broadcast_recording'] },
        (err, result) => {
          if (err || !result) reject(err || new Error('Upload failed'))
          else resolve(result.secure_url)
        }
      ).end(req.file!.buffer)
    })
    await db.run(`UPDATE broadcasts SET recording_url=$1, recorded_at=NOW() WHERE id=$2`, [recording_url, req.params.id])
    res.json({ recording_url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id/recording/download', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const row = await db.get(`SELECT title, recording_url FROM broadcasts WHERE id=$1`, [req.params.id])
    if (!row?.recording_url) { res.status(404).json({ error: 'No recording found' }); return }
    const response = await fetch(row.recording_url)
    if (!response.ok) { res.status(502).json({ error: 'Could not fetch recording' }); return }
    const safe = (row.title as string).replace(/[^a-z0-9]/gi, '_').toLowerCase()
    res.setHeader('Content-Type', 'audio/webm')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.webm"`)
    const reader = response.body as any
    if (reader?.pipe) { reader.pipe(res) } else {
      const buf = Buffer.from(await response.arrayBuffer())
      res.send(buf)
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id/recording', authenticateToken, requireRole('broadcaster', 'admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { recording_url } = req.body
    if (!recording_url) { res.status(400).json({ error: 'recording_url required' }); return }
    await db.run(`UPDATE broadcasts SET recording_url=$1 WHERE id=$2`, [recording_url, req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }

    // Prevent deleting a live broadcast without ending it first
    if (broadcast.status === 'live') {
      res.status(400).json({ error: 'Cannot delete a live broadcast. End it first.' }); return
    }

    // Delete associated recording from Cloudinary if present
    if (broadcast.recording_url) {
      try {
        const match = broadcast.recording_url.match(/\/upload\/v\d+\/(.+?)\.webm/)
        if (match?.[1]) {
          await cloudinary.uploader.destroy(match[1], { resource_type: 'video' })
        }
      } catch (e: any) {
        console.warn('[BROADCASTS] delete recording warning:', e.message)
      }
    }

    // Clean up related data
    await db.run('DELETE FROM chat_messages WHERE broadcast_id=$1', [id])
    await db.run('DELETE FROM stream_chunks WHERE broadcast_id=$1', [id])
    await db.run('DELETE FROM stream_listeners WHERE broadcast_id=$1', [id])
    await db.run('DELETE FROM broadcasts WHERE id=$1 AND tenant_id=$2', [id, req.tenantId])

    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete broadcast' })
  }
})

export default router
