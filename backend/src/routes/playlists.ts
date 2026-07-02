import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    await initDb()
    const rows = await db.all('SELECT * FROM playlists ORDER BY created_at DESC')
    res.json({ playlists: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { title, description, repeat_mode, shuffle } = req.body
    if (!title) { res.status(400).json({ error: 'Title required' }); return }
    const id = uuidv4()
    await db.run(
      `INSERT INTO playlists (id, title, description, repeat_mode, shuffle) VALUES ($1,$2,$3,$4,$5)`,
      [id, title, description || null, repeat_mode || 'none', !!shuffle]
    )
    res.status(201).json({ id, title })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.get('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const playlist = await db.get('SELECT * FROM playlists WHERE id = $1', [req.params.id])
    if (!playlist) { res.status(404).json({ error: 'Playlist not found' }); return }
    const items = await db.all(
      `SELECT pi.*, COALESCE(s.title, m.title) as content_title, COALESCE(s.speaker, m.artist) as content_speaker
       FROM playlist_items pi
       LEFT JOIN sermons s ON s.id = pi.content_id AND pi.content_type = 'sermon'
       LEFT JOIN music m ON m.id = pi.content_id AND pi.content_type = 'music'
       WHERE pi.playlist_id = $1
       ORDER BY pi.order_index ASC`,
      [req.params.id]
    )
    res.json({ playlist, items })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/items', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { content_type, content_id, order_index, duration_minutes } = req.body
    if (!content_type || !content_id) { res.status(400).json({ error: 'content_type and content_id required' }); return }
    const id = uuidv4()
    await db.run(
      `INSERT INTO playlist_items (id, playlist_id, content_type, content_id, order_index, duration_minutes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.params.id, content_type, content_id, order_index || 0, duration_minutes || 30]
    )
    res.status(201).json({ id })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/:playlistId/items/reorder', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { itemIds } = req.body as { itemIds: string[] }
    if (!Array.isArray(itemIds)) { res.status(400).json({ error: 'itemIds array required' }); return }
    for (let i = 0; i < itemIds.length; i++) {
      await db.run('UPDATE playlist_items SET order_index = $1 WHERE id = $2 AND playlist_id = $3', [i, itemIds[i], req.params.playlistId])
    }
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/:playlistId/items/:itemId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await db.run('DELETE FROM playlist_items WHERE id = $1 AND playlist_id = $2', [req.params.itemId, req.params.playlistId])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await db.run('DELETE FROM playlists WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
