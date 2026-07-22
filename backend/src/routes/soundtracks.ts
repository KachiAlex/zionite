import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { db, dbWriteSafe, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { uploadBuffer, deleteFile, extractKeyFromUrl, r2Configured } from '../lib/r2.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a']
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true)
    } else {
      cb(new Error('Only audio files are allowed') as any, false)
    }
  }
})

// List all soundtracks (broadcaster + admin)
router.get('/', authenticateToken, requireRole('broadcaster', 'admin'), async (req: any, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT id, title, audio_url, duration, file_format, file_size, created_at FROM soundtracks ORDER BY created_at DESC`
    )
    res.json({ soundtracks: rows })
  } catch (err: any) {
    console.error('[SOUNDTRACKS] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch soundtracks' })
  }
})

// Upload a shared soundtrack (admin only)
router.post('/', authenticateToken, requireRole('admin'), upload.single('audio'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Audio file required' }); return }
    await initDb()

    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '')
    const id = uuidv4()

    let audio_url: string
    if (r2Configured) {
      audio_url = await uploadBuffer(req.file.buffer, 'zionite/soundtracks', req.file.mimetype)
    } else {
      audio_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    }

    await dbWriteSafe(
      `INSERT INTO soundtracks (id, title, audio_url, duration, file_format, file_size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, title, audio_url, parseInt(req.body.duration) || 0, req.file.mimetype, req.file.size, req.user?.id || null]
    )

    res.status(201).json({ id, title, audio_url })
  } catch (err: any) {
    console.error('[SOUNDTRACKS] upload error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to upload soundtrack' })
  }
})

// Delete a soundtrack (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const track = await db.get(`SELECT id, audio_url FROM soundtracks WHERE id=$1`, [req.params.id])
    if (!track) { res.status(404).json({ error: 'Soundtrack not found' }); return }

    if (track.audio_url && !track.audio_url.startsWith('data:')) {
      const key = extractKeyFromUrl(track.audio_url)
      if (key) await deleteFile(key).catch(() => {})
    }
    await dbWriteSafe(`DELETE FROM soundtracks WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[SOUNDTRACKS] delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete soundtrack' })
  }
})

export default router
