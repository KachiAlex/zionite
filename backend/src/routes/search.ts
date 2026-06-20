import { Router } from 'express'
import { db, dbReady } from '../db.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    const q = String(req.query.q || '').trim().toLowerCase()
    if (!q) { res.json({ sermons: [], podcasts: [], events: [] }); return }

    const sermons = await db.all(
      `SELECT id, title, speaker, scripture_reference, thumbnail_url
       FROM sermons
       WHERE LOWER(title) LIKE $1 OR LOWER(speaker) LIKE $1 OR LOWER(scripture_reference) LIKE $1
       ORDER BY created_at DESC LIMIT 10`,
      [`%${q}%`]
    )
    const podcasts = await db.all(
      `SELECT id, title, host, thumbnail_url
       FROM podcasts
       WHERE LOWER(title) LIKE $1 OR LOWER(host) LIKE $1
       ORDER BY created_at DESC LIMIT 10`,
      [`%${q}%`]
    )
    const events = await db.all(
      `SELECT id, title, description, date, image_url
       FROM events
       WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1
       ORDER BY date DESC LIMIT 10`,
      [`%${q}%`]
    )

    res.json({ sermons, podcasts, events })
  } catch (err: any) {
    console.error('[SEARCH]', err.message)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
