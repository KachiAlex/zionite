import { Router } from 'express'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { db, dbWriteSafe, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

function parseCloudinaryUrl() {
  const url = process.env.CLOUDINARY_URL || ''
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
  if (!match) return null
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] }
}

const cloudConfig = parseCloudinaryUrl()

function generateCloudinarySignature(folder: string, timestamp: number) {
  if (!cloudConfig) return null
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}${cloudConfig.apiSecret}`
  return crypto.createHash('sha1').update(paramsToSign).digest('hex')
}

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

router.get('/signature', authenticateToken, requireRole('admin'), (req: any, res) => {
  if (!cloudConfig) {
    res.status(500).json({ error: 'Cloudinary not configured' })
    return
  }
  const folder = (req.query.folder as string) || 'zionite/uploads'
  const timestamp = Math.round(Date.now() / 1000)
  const signature = generateCloudinarySignature(folder, timestamp)
  if (!signature) {
    res.status(500).json({ error: 'Failed to generate upload signature' })
    return
  }
  res.json({
    signature,
    timestamp,
    apiKey: cloudConfig.apiKey,
    cloudName: cloudConfig.cloudName,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudConfig.cloudName}/auto/upload`
  })
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
    const track = await db.get(`SELECT id FROM music WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
    if (!track) { res.status(404).json({ error: 'Track not found' }); return }
    await dbWriteSafe(`DELETE FROM music WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[MUSIC] delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete track' })
  }
})

export default router
