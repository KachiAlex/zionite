import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'
import { enqueueNotification } from '../services/notificationService.js'

const router = Router()

// Store web push subscription
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { endpoint, p256dh, auth, user_id } = req.body
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: 'Missing subscription fields' }); return
    }
    const id = uuidv4()
    await db.run(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=$3, auth=$4, user_id=$5`,
      [id, endpoint, p256dh, auth, user_id || null]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[PUSH] subscribe error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Remove web push subscription
router.delete('/unsubscribe', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { endpoint } = req.body
    if (!endpoint) { res.status(400).json({ error: 'Missing endpoint' }); return }
    await db.run(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[PUSH] unsubscribe error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Store FCM token (native app)
router.post('/fcm-token', async (req: Request, res: Response) => {
  try {
    await initDb()
    const { token, user_id, platform } = req.body
    if (!token) { res.status(400).json({ error: 'Missing token' }); return }
    const id = uuidv4()
    await db.run(
      `INSERT INTO fcm_tokens (id, token, user_id, platform)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id=$3, platform=$4`,
      [id, token, user_id || null, platform || 'android']
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[PUSH] fcm-token error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Admin: create daily verse / prophetic word and send push
router.post('/verse', authenticateToken, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    await initDb()
    const { title, content, reference, type = 'verse' } = req.body
    if (!title || !content) { res.status(400).json({ error: 'Title and content required' }); return }

    const id = uuidv4()
    const createdBy = (req as any).user?.id || 'admin'
    await db.run(
      `INSERT INTO daily_verses (id, title, content, reference, type, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, title, content, reference || '', type, createdBy]
    )

    // Queue daily verse notification for reliable delivery
    enqueueNotification({
      category: 'daily_verse',
      type: type === 'prophetic_word' ? 'prophetic_word' : 'daily_verse',
      title: title,
      body: reference ? `${content} — ${reference}` : content,
      url: '/'
    }).catch((e: any) => console.error('[PUSH] enqueue error:', e.message))

    res.json({ success: true, id })
  } catch (err: any) {
    console.error('[PUSH] verse create error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Get recent verses (public)
router.get('/verses', async (req, res) => {
  try {
    await initDb()
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50)
    const rows = await db.all(
      `SELECT id, title, content, reference, type, created_at FROM daily_verses ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ verses: rows })
  } catch (err: any) {
    console.error('[PUSH] verses error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/preferences/:userId', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const { userId } = req.params
    const requestingUser = (req as any).user
    if (requestingUser?.id !== userId && requestingUser?.role !== 'admin' && requestingUser?.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const row = await db.get(
      `SELECT user_id, email_enabled, push_enabled,
              live_broadcast_push, live_broadcast_email,
              sermon_radio_push, sermon_radio_email,
              daily_verse_push, daily_verse_email,
              events_push, events_email
       FROM notification_preferences WHERE user_id = $1`,
      [userId]
    )
    res.json({ preferences: row || { user_id: userId } })
  } catch (err: any) {
    console.error('[PUSH] preferences get error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.patch('/preferences/:userId', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const { userId } = req.params
    const requestingUser = (req as any).user
    if (requestingUser?.id !== userId && requestingUser?.role !== 'admin' && requestingUser?.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const {
      email_enabled, push_enabled,
      live_broadcast_push, live_broadcast_email,
      sermon_radio_push, sermon_radio_email,
      daily_verse_push, daily_verse_email,
      events_push, events_email
    } = req.body
    const id = uuidv4()
    await db.run(
      `INSERT INTO notification_preferences (
         user_id, email_enabled, push_enabled,
         live_broadcast_push, live_broadcast_email,
         sermon_radio_push, sermon_radio_email,
         daily_verse_push, daily_verse_email,
         events_push, events_email, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email_enabled = COALESCE($2, notification_preferences.email_enabled),
         push_enabled = COALESCE($3, notification_preferences.push_enabled),
         live_broadcast_push = COALESCE($4, notification_preferences.live_broadcast_push),
         live_broadcast_email = COALESCE($5, notification_preferences.live_broadcast_email),
         sermon_radio_push = COALESCE($6, notification_preferences.sermon_radio_push),
         sermon_radio_email = COALESCE($7, notification_preferences.sermon_radio_email),
         daily_verse_push = COALESCE($8, notification_preferences.daily_verse_push),
         daily_verse_email = COALESCE($9, notification_preferences.daily_verse_email),
         events_push = COALESCE($10, notification_preferences.events_push),
         events_email = COALESCE($11, notification_preferences.events_email),
         updated_at = NOW()`,
      [userId, email_enabled, push_enabled,
       live_broadcast_push, live_broadcast_email,
       sermon_radio_push, sermon_radio_email,
       daily_verse_push, daily_verse_email,
       events_push, events_email]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('[PUSH] preferences update error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Admin: list all subscriptions (for stats)
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const webCount = await db.get(`SELECT COUNT(*) as count FROM push_subscriptions`)
    const fcmCount = await db.get(`SELECT COUNT(*) as count FROM fcm_tokens`)
    res.json({ webPush: Number(webCount?.count || 0), fcm: Number(fcmCount?.count || 0) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/subscribers/count', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const webCount = await db.get(`SELECT COUNT(*) as count FROM push_subscriptions`)
    const fcmCount = await db.get(`SELECT COUNT(*) as count FROM fcm_tokens`)
    res.json({ count: Number(webCount?.count || 0) + Number(fcmCount?.count || 0) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/history', authenticateToken, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await initDb()
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200)
    const rows = await db.all(
      `SELECT id, type, title, body, url, push_count, email_count, fcm_count, created_at
       FROM notification_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ history: rows || [] })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/broadcast', authenticateToken, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    await initDb()
    const { title, body, url } = req.body
    if (!title || !body) { res.status(400).json({ error: 'Title and body required' }); return }
    const id = await enqueueNotification({
      category: 'manual',
      type: 'manual_broadcast',
      title,
      body,
      url: url || '/'
    })
    res.json({ success: true, id, message: 'Broadcast queued for delivery' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
