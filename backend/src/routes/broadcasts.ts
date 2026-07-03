import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { v2 as cloudinary } from 'cloudinary'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { optimizeImage } from '../middleware/optimizeImage.js'

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

router.get('/', async (req, res) => {
  try {
    await initDb()
    const broadcasts = await db.all('SELECT * FROM broadcasts ORDER BY created_at DESC')
    res.json({ broadcasts })
  } catch (err: any) {
    console.error('[BROADCASTS] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch broadcasts' })
  }
})

router.get('/active', async (req, res) => {
  try {
    await initDb()
    let broadcast = await db.get("SELECT * FROM broadcasts WHERE status = 'live' ORDER BY started_at DESC LIMIT 1")
    // Fallback: if chunks are flowing but no broadcast record exists (mobile broadcaster
    // may send chunks via WebSocket without creating a DB record), synthesize one.
    if (!broadcast) {
      const recentChunk = await db.get(
        `SELECT broadcast_id, MAX(created_at) as last_chunk_at FROM stream_chunks
         WHERE created_at > NOW() - INTERVAL '5 minutes'
         GROUP BY broadcast_id ORDER BY last_chunk_at DESC LIMIT 1`
      )
      if (recentChunk) {
        broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [recentChunk.broadcast_id])
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

router.get('/:id', async (req, res) => {
  try {
    await initDb()
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [req.params.id])
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
      `INSERT INTO broadcasts (id, title, description, scripture_reference, status, broadcaster_id, thumbnail_url, speaker, church_online_url, rtmp_url, stream_key, created_at)
       VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
      [id, title, description || null, scripture_reference || null, req.user!.id, thumbnail_url || null, speaker || null, church_online_url || null, rtmp_url || null, stream_key || null]
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

router.post('/:id/end', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] end error:', err.message)
    res.status(500).json({ error: 'Failed to end broadcast' })
  }
})

router.patch('/:id/start', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] start error:', err.message)
    res.status(500).json({ error: 'Failed to start broadcast' })
  }
})

router.patch('/:id/pause', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'paused' WHERE id = $1",
      [id]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] pause error:', err.message)
    res.status(500).json({ error: 'Failed to pause broadcast' })
  }
})

router.patch('/:id/resume', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'live' WHERE id = $1",
      [id]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[BROADCASTS] resume error:', err.message)
    res.status(500).json({ error: 'Failed to resume broadcast' })
  }
})

router.patch('/:id/end', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
  try {
    await initDb()
    const { id } = req.params
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    if (!broadcast) { res.status(404).json({ error: 'Broadcast not found' }); return }
    await db.run(
      "UPDATE broadcasts SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    )
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

export default router
