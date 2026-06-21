import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`
    cb(null, unique)
  }
})
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } })

router.get('/', async (req, res) => {
  try {
    await initDb()
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    const query = limit
      ? 'SELECT * FROM sermons ORDER BY date DESC LIMIT $1'
      : 'SELECT * FROM sermons ORDER BY date DESC'
    const sermons = limit ? await db.all(query, [limit]) : await db.all(query)
    res.json({ sermons })
  } catch (err: any) {
    console.error('[SERMONS] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch sermons' })
  }
})

router.post('/', authenticateToken, requireRole('admin'), upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    await initDb()
    const { title, description, scripture_reference, speaker, series, date, duration, video_url, thumbnail_url } = req.body
    if (!title) { res.status(400).json({ error: 'Title is required' }); return }
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const id = uuidv4()
    const audioFile = files?.audio?.[0]
    const thumbnailFile = files?.thumbnail?.[0]
    const audioUrl = audioFile ? `/uploads/${audioFile.filename}` : (req.body.audio_url || '')
    const thumbnailUrl = thumbnailFile ? `/uploads/${thumbnailFile.filename}` : (thumbnail_url || '')
    await db.run(
      `INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, video_url, thumbnail_url, date, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, title, description || null, scripture_reference || null, speaker || null, series || null,
       audioUrl || null, video_url || null, thumbnailUrl || null, date || new Date().toISOString().split('T')[0], duration ? parseInt(duration, 10) : null]
    )
    res.json({ sermon: { id, title, description, scripture_reference, speaker, series, audio_url: audioUrl, video_url, thumbnail_url: thumbnailUrl, date, duration } })
  } catch (err: any) {
    console.error('[SERMONS] create error:', err.message)
    res.status(500).json({ error: 'Failed to upload sermon' })
  }
})

// Featured sermons
router.get('/featured', async (req, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT s.* FROM sermons s
       JOIN featured_sermons fs ON s.id = fs.sermon_id
       ORDER BY fs.display_order ASC, fs.created_at DESC`
    )
    res.json({ sermons: rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/featured', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { sermon_id, display_order } = req.body
    if (!sermon_id) return res.status(400).json({ error: 'sermon_id required' })
    const id = uuidv4()
    await db.run(
      `INSERT INTO featured_sermons (id, sermon_id, display_order) VALUES ($1, $2, $3)
       ON CONFLICT (sermon_id) DO UPDATE SET display_order = EXCLUDED.display_order`,
      [id, sermon_id, display_order || 0]
    )
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/featured/:sermon_id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await db.run('DELETE FROM featured_sermons WHERE sermon_id = $1', [req.params.sermon_id])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Transcripts
router.get('/:id/transcript', async (req, res) => {
  try {
    await initDb()
    const row = await db.get('SELECT * FROM transcripts WHERE sermon_id = $1', [req.params.id])
    res.json({ transcript: row || null })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/transcript', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { content } = req.body
    if (!content) return res.status(400).json({ error: 'Content required' })
    const id = uuidv4()
    await db.run(
      `INSERT INTO transcripts (id, sermon_id, content) VALUES ($1, $2, $3)
       ON CONFLICT (sermon_id) DO UPDATE SET content = EXCLUDED.content`,
      [id, req.params.id, content]
    )
    const row = await db.get('SELECT * FROM transcripts WHERE sermon_id = $1', [req.params.id])
    res.json({ transcript: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
