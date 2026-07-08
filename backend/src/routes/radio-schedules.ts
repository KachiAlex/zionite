import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE p.tenant_id=$1
       ORDER BY rs.start_time DESC`,
      [req.tenantId]
    )
    res.json({ schedules: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.post('/', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { playlist_id, start_time, end_time } = req.body
    if (!playlist_id || !start_time) { res.status(400).json({ error: 'playlist_id and start_time are required' }); return }
    // Verify playlist belongs to tenant
    const playlist = await db.get('SELECT id FROM playlists WHERE id=$1 AND tenant_id=$2', [playlist_id, req.tenantId])
    if (!playlist) { res.status(400).json({ error: 'Playlist not found or does not belong to tenant' }); return }
    const id = uuidv4()
    await db.run(
      `INSERT INTO radio_schedules (id, playlist_id, start_time, end_time) VALUES ($1,$2,$3,$4)`,
      [id, playlist_id, start_time, end_time || null]
    )
    res.status(201).json({ id, playlist_id, start_time })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.patch('/:id', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const { playlist_id, start_time, end_time, is_active } = req.body
    // If playlist_id is being updated, verify it belongs to tenant
    if (playlist_id) {
      const playlist = await db.get('SELECT id FROM playlists WHERE id=$1 AND tenant_id=$2', [playlist_id, req.tenantId])
      if (!playlist) { res.status(400).json({ error: 'Playlist not found or does not belong to tenant' }); return }
    }
    await db.run(
      `UPDATE radio_schedules rs
       SET playlist_id = COALESCE($1, rs.playlist_id),
           start_time  = COALESCE($2, rs.start_time),
           end_time    = CASE WHEN $3::text IS NOT NULL THEN $3::timestamptz ELSE rs.end_time END,
           is_active   = COALESCE($4, rs.is_active)
       FROM playlists p
       WHERE rs.id = $5 AND rs.playlist_id = p.id AND p.tenant_id = $6`,
      [playlist_id || null, start_time || null,
       end_time !== undefined ? end_time : null,
       typeof is_active === 'boolean' ? is_active : null,
       req.params.id, req.tenantId]
    )
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    await db.run(
      `DELETE FROM radio_schedules rs
       USING playlists p
       WHERE rs.id = $1 AND rs.playlist_id = p.id AND p.tenant_id = $2`,
      [req.params.id, req.tenantId]
    )
    res.json({ ok: true })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.get('/public', async (req: any, res) => {
  try {
    await initDb()
    const now = new Date().toISOString()
    const rows = await db.all(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active = true
         AND (rs.end_time IS NULL OR rs.end_time >= $1)
         AND p.tenant_id = $2
       ORDER BY rs.start_time ASC`,
      [now, req.tenantId]
    )
    res.json({ schedules: rows })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

router.get('/active', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const now = new Date().toISOString()
    const row = await db.get(
      `SELECT rs.*, p.title as playlist_title
       FROM radio_schedules rs
       JOIN playlists p ON p.id = rs.playlist_id
       WHERE rs.is_active = true
         AND rs.start_time <= $1 AND (rs.end_time IS NULL OR rs.end_time >= $1)
         AND p.tenant_id = $2
       ORDER BY rs.start_time ASC LIMIT 1`,
      [now, req.tenantId]
    )
    res.json({ schedule: row || null })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
