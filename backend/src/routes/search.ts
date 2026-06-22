import { Router } from 'express'
import { db, dbReady } from '../db.js'

const router = Router()

function toTsVector(table: string, cols: string[]) {
  return cols.map(c => `coalesce(${table}.${c},'')`).join(" || ' ' || ")
}

router.get('/', async (req, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    const raw = String(req.query.q || '').trim()
    if (!raw) { res.json({ sermons: [], events: [], music: [], speakers: [] }); return }

    const tsQ = raw.replace(/\s+/g, ' & ')

    const sermons = await db.all(
      `SELECT id, title, speaker, scripture_reference, thumbnail_url,
       ts_rank(to_tsvector('english', ${toTsVector('sermons', ['title','speaker','scripture_reference','description'])}), to_tsquery('english', $1)) as rank
       FROM sermons
       WHERE to_tsvector('english', ${toTsVector('sermons', ['title','speaker','scripture_reference','description'])}) @@ to_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC LIMIT 10`,
      [tsQ]
    )
    const events = await db.all(
      `SELECT id, title, description, date, image_url,
       ts_rank(to_tsvector('english', ${toTsVector('events', ['title','description','location'])}), to_tsquery('english', $1)) as rank
       FROM events
       WHERE to_tsvector('english', ${toTsVector('events', ['title','description','location'])}) @@ to_tsquery('english', $1)
       ORDER BY rank DESC, date DESC LIMIT 10`,
      [tsQ]
    )
    const music = await db.all(
      `SELECT id, title, artist, album, genre, cover_url,
       ts_rank(to_tsvector('english', ${toTsVector('music', ['title','artist','album','genre','lyrics'])}), to_tsquery('english', $1)) as rank
       FROM music
       WHERE to_tsvector('english', ${toTsVector('music', ['title','artist','album','genre','lyrics'])}) @@ to_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC LIMIT 10`,
      [tsQ]
    )
    const speakers = await db.all(
      `SELECT id, name, bio, topic, photo_url,
       ts_rank(to_tsvector('english', ${toTsVector('guest_speakers', ['name','bio','topic'])}), to_tsquery('english', $1)) as rank
       FROM guest_speakers
       WHERE to_tsvector('english', ${toTsVector('guest_speakers', ['name','bio','topic'])}) @@ to_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC LIMIT 10`,
      [tsQ]
    )

    res.json({ sermons, events, music, speakers })
  } catch (err: any) {
    console.error('[SEARCH]', err.message)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
