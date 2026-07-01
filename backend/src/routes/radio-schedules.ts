import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       ORDER BY rs.start_time DESC`
    )
    res.json({ schedules: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { playlist_id, start_time, end_time } = req.body
    if (!playlist_id || !start_time) { res.status(400).json({ error: 'playlist_id and start_time are required' }); return }
    const id = uuidv4()
    await db.run(
      `INSERT INTO radio_schedules (id, playlist_id, start_time, end_time) VALUES ($1,$2,$3,$4)`,
      [id, playlist_id, start_time, end_time || null]
    )
    res.status(201).json({ id, playlist_id, start_time })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const { playlist_id, start_time, end_time, is_active } = req.body
    await db.run(
      `UPDATE radio_schedules
       SET playlist_id = COALESCE($1, playlist_id),
           start_time  = COALESCE($2, start_time),
           end_time    = CASE WHEN $3::text IS NOT NULL THEN $3::timestamptz ELSE end_time END,
           is_active   = COALESCE($4, is_active)
       WHERE id = $5`,
      [playlist_id || null, start_time || null,
       end_time !== undefined ? end_time : null,
       typeof is_active === 'boolean' ? is_active : null,
       req.params.id]
    )
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    await db.run('DELETE FROM radio_schedules WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.get('/public', async (_req, res) => {
  try {
    await initDb()
    const now = new Date().toISOString()
    const rows = await db.all(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active = true
         AND (rs.end_time IS NULL OR rs.end_time >= $1)
       ORDER BY rs.start_time ASC`,
      [now]
    )
    res.json({ schedules: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.get('/active', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    await initDb()
    const now = new Date().toISOString()
    const row = await db.get(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active = true
         AND rs.start_time <= $1 AND (rs.end_time IS NULL OR rs.end_time >= $1)
       ORDER BY rs.start_time ASC LIMIT 1`,
      [now]
    )
    res.json({ schedule: row || null })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
