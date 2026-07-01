import { Router } from 'express'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { getRadioStatus, skipSermon, stopRadio, startRadio, initRadioScheduler } from '../sermon-radio.js'

const router = Router()

router.post('/start', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { playlistId } = req.body
    if (!playlistId) { res.status(400).json({ error: 'playlistId required' }); return }

    await initDb()
    const playlist = await db.get('SELECT * FROM playlists WHERE id = $1', [playlistId])
    if (!playlist) { res.status(404).json({ error: 'Playlist not found' }); return }

    await startRadio(playlistId, playlist.shuffle, playlist.repeat_mode)

    res.json({ success: true, message: 'Radio started', playlistId })
  } catch (err: any) {
    console.error('[RADIO] start error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post('/stop', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    await stopRadio()
    res.json({ success: true, message: 'Radio stopped' })
  } catch (err: any) {
    console.error('[RADIO] stop error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post('/skip', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    await skipSermon()
    res.json({ success: true, message: 'Skipped to next sermon' })
  } catch (err: any) {
    console.error('[RADIO] skip error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/status', async (_req, res) => {
  try {
    const status = getRadioStatus()
    let schedule = null
    if (status) {
      await initDb()
      const now = new Date().toISOString()
      schedule = await db.get(
        `SELECT rs.id, p.title, rs.start_time, rs.end_time, rs.is_active
         FROM radio_schedules rs
         JOIN playlists p ON p.id = rs.playlist_id
         WHERE rs.playlist_id = $1 AND rs.start_time <= $2 AND (rs.end_time IS NULL OR rs.end_time >= $2)
         ORDER BY rs.start_time ASC LIMIT 1`,
        [status.playlistId, now]
      )
    }
    res.json({ status, playlist: schedule })
  } catch (err: any) {
    console.error('[RADIO] status error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post('/scheduler/restart', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    initRadioScheduler()
    res.json({ success: true, message: 'Scheduler restarted' })
  } catch (err: any) {
    console.error('[RADIO] scheduler restart error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
