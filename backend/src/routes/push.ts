import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import webpush from 'web-push'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

// Configure web-push VAPID keys from env
const vapidPublic = process.env.VAPID_PUBLIC_KEY || ''
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ''
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zionite.online'
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
}

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

    // Send push notifications in background
    sendPushNotifications(title, content, reference).catch((e: any) => console.error('[PUSH] broadcast error:', e.message))

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

// Background push broadcaster
async function sendPushNotifications(title: string, body: string, reference?: string) {
  const fullBody = reference ? `${body} — ${reference}` : body

  // 1. Web Push
  if (vapidPublic && vapidPrivate) {
    const subs = await db.all(`SELECT endpoint, p256dh, auth FROM push_subscriptions`)
    const payload = JSON.stringify({ title: 'ZioniteFM', body: fullBody, icon: '/logo.png', badge: '/logo.png' })
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.run(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint])
        }
      }
    }
  }

  // 2. FCM (native apps)
  const fcmServerKey = process.env.FCM_SERVER_KEY
  if (fcmServerKey) {
    const tokens = await db.all(`SELECT token FROM fcm_tokens`)
    for (const row of tokens) {
      try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${fcmServerKey}`
          },
          body: JSON.stringify({
            to: row.token,
            notification: { title: 'ZioniteFM', body: fullBody },
            data: { type: 'daily_verse', title, body, reference }
          })
        })
      } catch (e: any) {
        console.error('[PUSH] FCM send error:', e.message)
      }
    }
  }
}

export default router
