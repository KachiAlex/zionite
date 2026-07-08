import { Router } from 'express'
import { db, initDb } from '../db.js'

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

export default router
