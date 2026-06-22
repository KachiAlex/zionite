import { Router } from 'express'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

// Admin: dashboard overview stats
router.get('/dashboard', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()

    // Count online listeners (sessions active in last 5 minutes)
    const onlineResult = await db.get(
      `SELECT COUNT(DISTINCT session_id) as count FROM stream_listeners
       WHERE last_seen > NOW() - INTERVAL '5 minutes'`
    )
    const listenersOnline = onlineResult?.count || 0

    // Total listeners today
    const todayResult = await db.get(
      `SELECT COUNT(DISTINCT session_id) as count FROM stream_listeners
       WHERE last_seen > NOW() - INTERVAL '24 hours'`
    )
    const totalListenersToday = todayResult?.count || 0

    // Sermon count
    const sermonsResult = await db.get('SELECT COUNT(*) as count FROM sermons')
    const sermonCount = sermonsResult?.count || 0

    // Prayer request count
    const prayersResult = await db.get('SELECT COUNT(*) as count FROM prayer_requests')
    const prayerCount = prayersResult?.count || 0

    // Total donations
    const donationsResult = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = $1', ['completed'])
    const totalDonations = donationsResult?.total || 0

    // Platform breakdown for stream analytics
    const platformRows = await db.all(
      `SELECT platform, COUNT(DISTINCT session_id) as count FROM stream_listeners
       WHERE last_seen > NOW() - INTERVAL '24 hours'
       GROUP BY platform`
    )
    const totalPlatform = platformRows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0) || 1
    const platformBreakdown = platformRows.map((r: any) => ({
      name: r.platform === 'web' ? 'Web Player' : r.platform === 'mobile_app' ? 'Mobile App' : r.platform === 'mobile_web' ? 'Mobile Web' : r.platform === 'smart_speaker' ? 'Smart Speaker' : r.platform,
      value: Math.round((parseInt(r.count) / totalPlatform) * 100),
      rawCount: parseInt(r.count)
    }))

    // Recent sermons
    const recentSermons = await db.all(
      'SELECT id, title, speaker, date FROM sermons ORDER BY date DESC LIMIT 5'
    )

    // Pending testimonies
    const pendingTestimonies = await db.all(
      `SELECT id, name, content, created_at FROM testimonies
       WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5`
    )

    // Recent donations
    const recentDonations = await db.all(
      `SELECT id, name, amount, message, status, created_at FROM donations
       ORDER BY created_at DESC LIMIT 5`
    )

    // Active campaigns
    const activeCampaigns = await db.all(
      `SELECT id, title, goal_amount, current_amount FROM campaigns
       WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 5`
    )

    // Transcripts in progress (placeholder - can be linked to sermons later)
    const transcripts = await db.all(
      `SELECT t.id, s.title as sermon_title, t.created_at FROM transcripts t
       JOIN sermons s ON t.sermon_id = s.id ORDER BY t.created_at DESC LIMIT 5`
    )

    // Listener stats over last 6 time periods (simplified - aggregate by 4-hour buckets)
    const listenerHistory = await db.all(
      `SELECT DATE_TRUNC('hour', last_seen) as hour, COUNT(DISTINCT session_id) as count
       FROM stream_listeners
       WHERE last_seen > NOW() - INTERVAL '24 hours'
       GROUP BY hour ORDER BY hour DESC LIMIT 6`
    )

    res.json({
      stats: {
        listenersOnline,
        totalListenersToday,
        sermonCount,
        prayerCount,
        totalDonations
      },
      platformBreakdown,
      recentSermons,
      pendingTestimonies,
      recentDonations,
      activeCampaigns,
      transcripts,
      listenerHistory: listenerHistory.reverse()
    })
  } catch (err: any) {
    console.error('[ANALYTICS] dashboard error:', err.message)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// Public: ping listener session (keeps session alive)
router.post('/ping', async (req, res) => {
  try {
    await initDb()
    const { session_id, broadcast_id, platform } = req.body
    if (!session_id) return res.status(400).json({ error: 'session_id required' })

    const existing = await db.get('SELECT * FROM stream_listeners WHERE session_id = $1', [session_id])
    if (existing) {
      await db.run(
        'UPDATE stream_listeners SET last_seen = CURRENT_TIMESTAMP, broadcast_id = $1, platform = $2 WHERE session_id = $3',
        [broadcast_id || existing.broadcast_id, platform || existing.platform, session_id]
      )
    } else {
      const { v4: uuidv4 } = await import('uuid')
      await db.run(
        `INSERT INTO stream_listeners (id, broadcast_id, session_id, platform) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), broadcast_id || null, session_id, platform || 'web']
      )
    }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
