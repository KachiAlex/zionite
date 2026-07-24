import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, dbWriteSafe, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { getPresignedUploadUrl, deleteFile, extractKeyFromUrl, r2Configured } from '../lib/r2.js'

const router = Router()

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

// Get presigned upload URL for direct-to-R2 upload (admin only)
router.get('/upload-url', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    if (!r2Configured) {
      res.status(500).json({ error: 'R2 storage not configured' }); return
    }
    const contentType = (req.query.contentType as string) || 'audio/mpeg'
    const ext = (req.query.ext as string) || 'mp3'
    const { uploadUrl, publicUrl, key } = await getPresignedUploadUrl('zionite/soundtracks', contentType, ext)
    res.json({ uploadUrl, publicUrl, key })
  } catch (err: any) {
    console.error('[SOUNDTRACKS] presigned URL error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to generate upload URL' })
  }
})

// Save soundtrack metadata after direct R2 upload (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { title, audio_url, duration, file_format, file_size } = req.body
    if (!audio_url) { res.status(400).json({ error: 'audio_url required' }); return }
    await initDb()

    const id = uuidv4()
    await dbWriteSafe(
      `INSERT INTO soundtracks (id, title, audio_url, duration, file_format, file_size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, title || 'Untitled', audio_url, parseInt(duration) || 0, file_format || '', parseInt(file_size) || 0, req.user?.id || null]
    )

    res.status(201).json({ id, title, audio_url })
  } catch (err: any) {
    console.error('[SOUNDTRACKS] create error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to save soundtrack' })
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
