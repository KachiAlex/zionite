import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, dbWriteSafe, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'
import { getPresignedUploadUrl, r2Configured, deleteFile, extractKeyFromUrl } from '../lib/r2.js'

const router = Router()

router.get('/', async (req: any, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, file_format, file_size, play_count, created_at FROM music WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.tenantId]
    )
    res.json({ music: rows })
  } catch (err: any) {
    console.error('[MUSIC] list error:', err.message)
    res.status(500).json({ error: 'Failed to fetch music' })
  }
})

router.get('/upload-url', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    if (!r2Configured) {
      res.status(500).json({ error: 'R2 storage not configured' })
      return
    }
    const folder = (req.query.folder as string) || 'zionite/uploads'
    const contentType = (req.query.contentType as string) || 'application/octet-stream'
    const ext = (req.query.ext as string) || undefined
    const { uploadUrl, publicUrl, key } = await getPresignedUploadUrl(folder, contentType, ext)
    res.json({ uploadUrl, publicUrl, key })
  } catch (err: any) {
    console.error('[MUSIC] presigned URL error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to generate upload URL' })
  }
})

// Legacy endpoint name kept for backward compatibility during transition
router.get('/signature', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    if (!r2Configured) {
      res.status(500).json({ error: 'R2 storage not configured' })
      return
    }
    const folder = (req.query.folder as string) || 'zionite/uploads'
    const contentType = (req.query.contentType as string) || 'application/octet-stream'
    const ext = (req.query.ext as string) || undefined
    const { uploadUrl, publicUrl, key } = await getPresignedUploadUrl(folder, contentType, ext)
    res.json({ uploadUrl, publicUrl, key })
  } catch (err: any) {
    console.error('[MUSIC] signature error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to generate upload URL' })
  }
})

router.post('/', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const { title, artist, album, genre, audio_url, cover_url, duration, lyrics } = req.body
    if (!title) { res.status(400).json({ error: 'Title required' }); return }
    if (!audio_url) { res.status(400).json({ error: 'Audio file or URL required' }); return }

    const id = uuidv4()
    await dbWriteSafe(
      `INSERT INTO music (id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, title, artist || '', album || '', genre || '', audio_url, cover_url || '', parseInt(duration) || 0, lyrics || '', req.tenantId]
    )
    res.status(201).json({ id, title })
  } catch (err: any) {
    console.error('[MUSIC] create error:', err.message)
    res.status(500).json({ error: err.message || 'Upload failed' })
  }
})

router.delete('/:id', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const track = await db.get(`SELECT id, audio_url, cover_url FROM music WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
    if (!track) { res.status(404).json({ error: 'Track not found' }); return }
    // Delete files from R2
    for (const url of [track.audio_url, track.cover_url]) {
      if (url) {
        const key = extractKeyFromUrl(url)
        if (key) await deleteFile(key).catch(() => {})
      }
    }
    await dbWriteSafe(`DELETE FROM music WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[MUSIC] delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete track' })
  }
})

export default router
