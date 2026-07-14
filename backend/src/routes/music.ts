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

// Public track detail (for shareable links — no auth required)
router.get('/:id', async (req: any, res) => {
  try {
    await initDb()
    const track = await db.get(
      `SELECT id, title, artist, album, genre, audio_url, cover_url, duration, lyrics, play_count, created_at FROM music WHERE id=$1`,
      [req.params.id]
    )
    if (!track) { res.status(404).json({ error: 'Track not found' }); return }

    // Record share click
    const referrer = req.headers.referer || req.headers.referrer || null
    await dbWriteSafe(
      `INSERT INTO music_share_clicks (id, track_id, referrer, tenant_id) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), req.params.id, referrer as any, req.tenantId || null]
    ).catch(() => {})

    // Get related tracks (same genre, exclude current)
    const related = await db.all(
      `SELECT id, title, artist, cover_url, duration FROM music WHERE genre=$1 AND id != $2 ORDER BY play_count DESC LIMIT 5`,
      [track.genre, req.params.id]
    ).catch(() => [])

    res.json({ track, related })
  } catch (err: any) {
    console.error('[MUSIC] detail error:', err.message)
    res.status(500).json({ error: 'Failed to fetch track' })
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

// Record play start — creates a music_plays row
router.post('/:id/play', async (req: any, res) => {
  try {
    await initDb()
    const { session_id, platform } = req.body
    const playId = uuidv4()
    const userId = (req as any).user?.id || null
    const sessionId = session_id || (req.headers['x-session-id'] as string) || null

    await dbWriteSafe(
      `INSERT INTO music_plays (id, track_id, user_id, session_id, platform, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [playId, req.params.id, userId, sessionId, platform || 'web', req.tenantId || null]
    )
    await dbWriteSafe(
      `UPDATE music SET play_count = COALESCE(play_count, 0) + 1 WHERE id = $1`,
      [req.params.id]
    )
    res.json({ playId })
  } catch (err: any) {
    console.error('[MUSIC] play error:', err.message)
    res.status(500).json({ error: 'Failed to record play' })
  }
})

// Update play session on pause/stop/switch — records duration played
router.patch('/:id/play', async (req: any, res) => {
  try {
    await initDb()
    const { playId, duration_played, completed } = req.body
    if (!playId) { res.status(400).json({ error: 'playId required' }); return }

    await dbWriteSafe(
      `UPDATE music_plays SET duration_played = $1, completed = $2 WHERE id = $3`,
      [parseInt(duration_played) || 0, !!completed, playId]
    )
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[MUSIC] play update error:', err.message)
    res.status(500).json({ error: 'Failed to update play session' })
  }
})

router.delete('/:id', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const track = await db.get(`SELECT id, audio_url, cover_url FROM music WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
    if (!track) { res.status(404).json({ error: 'Track not found' }); return }
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

// ── Analytics endpoints ──

// Admin: overview analytics for all music
router.get('/analytics/overview', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()

    const totalPlays = await db.get(
      `SELECT COUNT(*) as count FROM music_plays WHERE tenant_id=$1`, [req.tenantId]
    )
    const uniqueListeners = await db.get(
      `SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) as count FROM music_plays WHERE tenant_id=$1`, [req.tenantId]
    )
    const totalPlaytime = await db.get(
      `SELECT COALESCE(SUM(duration_played), 0) as total FROM music_plays WHERE tenant_id=$1`, [req.tenantId]
    )
    const completedPlays = await db.get(
      `SELECT COUNT(*) as count FROM music_plays WHERE completed = TRUE AND tenant_id=$1`, [req.tenantId]
    )
    const shareClicks = await db.get(
      `SELECT COUNT(*) as count FROM music_share_clicks WHERE tenant_id=$1`, [req.tenantId]
    )
    const totalTracks = await db.get(
      `SELECT COUNT(*) as count FROM music WHERE tenant_id=$1`, [req.tenantId]
    )

    // Top tracks
    const topTracks = await db.all(
      `SELECT m.id, m.title, m.artist, m.cover_url, m.duration,
              COUNT(mp.id) as plays,
              COALESCE(AVG(mp.duration_played), 0) as avg_playtime,
              COUNT(CASE WHEN mp.completed = TRUE THEN 1 END) as completed_count
       FROM music m
       LEFT JOIN music_plays mp ON mp.track_id = m.id AND mp.tenant_id = $1
       WHERE m.tenant_id = $1
       GROUP BY m.id, m.title, m.artist, m.cover_url, m.duration
       ORDER BY plays DESC
       LIMIT 10`,
      [req.tenantId]
    )

    // Plays over last 30 days (daily)
    const playsOverTime = await db.all(
      `SELECT DATE(played_at) as date, COUNT(*) as plays
       FROM music_plays
       WHERE tenant_id = $1 AND played_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(played_at) ORDER BY DATE(played_at) ASC`,
      [req.tenantId]
    )

    // Share clicks over last 30 days
    const shareClicksOverTime = await db.all(
      `SELECT DATE(opened_at) as date, COUNT(*) as clicks
       FROM music_share_clicks
       WHERE tenant_id = $1 AND opened_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(opened_at) ORDER BY DATE(opened_at) ASC`,
      [req.tenantId]
    )

    res.json({
      stats: {
        totalPlays: parseInt(totalPlays?.count || 0),
        uniqueListeners: parseInt(uniqueListeners?.count || 0),
        totalPlaytime: parseInt(totalPlaytime?.total || 0),
        completedPlays: parseInt(completedPlays?.count || 0),
        shareClicks: parseInt(shareClicks?.count || 0),
        totalTracks: parseInt(totalTracks?.count || 0),
      },
      topTracks: topTracks.map((t: any) => ({
        ...t,
        plays: parseInt(t.plays),
        avg_playtime: Math.round(parseFloat(t.avg_playtime)),
        completed_count: parseInt(t.completed_count),
      })),
      playsOverTime,
      shareClicksOverTime,
    })
  } catch (err: any) {
    console.error('[MUSIC] analytics overview error:', err.message)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// Admin: per-track analytics
router.get('/:id/analytics', authenticateToken, requireRole('admin'), async (req: any, res) => {
  try {
    await initDb()
    const trackId = req.params.id

    const stats = await db.get(
      `SELECT COUNT(*) as plays,
              COUNT(DISTINCT COALESCE(user_id, session_id)) as unique_listeners,
              COALESCE(SUM(duration_played), 0) as total_playtime,
              COUNT(CASE WHEN completed = TRUE THEN 1 END) as completed_count
       FROM music_plays WHERE track_id = $1 AND tenant_id = $2`,
      [trackId, req.tenantId]
    )

    const shareClicks = await db.get(
      `SELECT COUNT(*) as count FROM music_share_clicks WHERE track_id = $1 AND tenant_id = $2`,
      [trackId, req.tenantId]
    )

    const dailyPlays = await db.all(
      `SELECT DATE(played_at) as date, COUNT(*) as plays
       FROM music_plays
       WHERE track_id = $1 AND tenant_id = $2 AND played_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(played_at) ORDER BY DATE(played_at) ASC`,
      [trackId, req.tenantId]
    )

    res.json({
      stats: {
        plays: parseInt(stats?.plays || 0),
        uniqueListeners: parseInt(stats?.unique_listeners || 0),
        totalPlaytime: parseInt(stats?.total_playtime || 0),
        completedCount: parseInt(stats?.completed_count || 0),
        shareClicks: parseInt(shareClicks?.count || 0),
      },
      dailyPlays,
    })
  } catch (err: any) {
    console.error('[MUSIC] track analytics error:', err.message)
    res.status(500).json({ error: 'Failed to fetch track analytics' })
  }
})

export default router
