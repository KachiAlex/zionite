import { v4 as uuidv4 } from 'uuid'
import webpush from 'web-push'
import nodemailer from 'nodemailer'
import { db, initDb, dbWriteSafe } from '../db.js'

let firebaseAdmin: any = null

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (!projectId || !clientEmail || !privateKey) return null
  try {
    const { default: admin } = await import('firebase-admin')
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n')
        })
      })
    }
    firebaseAdmin = admin
    return admin
  } catch (err: any) {
    console.error('[NOTIFY] Firebase Admin init failed:', err.message)
    return null
  }
}

function configureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@zionite.online'
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
    } catch (err: any) {
      console.error('[NOTIFY] VAPID config failed:', err.message)
    }
  }
}
configureVapid()

let emailTransporter: nodemailer.Transporter | null = null
function getEmailTransporter() {
  if (emailTransporter) return emailTransporter
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  emailTransporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  })
  return emailTransporter
}

type NotificationCategory =
  | 'live_broadcast'
  | 'sermon_radio'
  | 'daily_verse'
  | 'events'
  | 'prayer'
  | 'testimony'
  | 'manual'

export interface EnqueueOptions {
  type?: string
  title: string
  body: string
  url?: string
  category: NotificationCategory
  scheduledAt?: Date
}

export async function enqueueNotification(opts: EnqueueOptions) {
  await initDb()
  const id = uuidv4()
  const scheduledAt = opts.scheduledAt || new Date()
  await db.query(
    `INSERT INTO notification_queue (id, type, title, body, url, category, status, scheduled_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, opts.type || opts.category, opts.title, opts.body, opts.url || null, opts.category, 'pending', scheduledAt, new Date()]
  )
  return id
}

export async function processPendingNotifications() {
  await initDb()
  const pending = await db.all(
    `SELECT * FROM notification_queue
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ORDER BY created_at ASC
     LIMIT 10`
  )

  for (const job of pending) {
    try {
      await db.query(`UPDATE notification_queue SET status='processing', processed_at=NOW() WHERE id=$1`, [job.id])
      const result = await dispatchNotification(job.category, job.title, job.body, job.url)
      await db.query(
        `UPDATE notification_queue SET status='sent', error=NULL, retry_count=retry_count+1 WHERE id=$1`,
        [job.id]
      )
      await logNotification(job.type, job.title, job.body, job.url, result)
    } catch (err: any) {
      console.error('[NOTIFY] job failed:', job.id, err.message)
      const retries = (job.retry_count || 0) + 1
      const status = retries >= 3 ? 'failed' : 'pending'
      const scheduledAt = retries < 3
        ? new Date(Date.now() + retries * 60_000)
        : job.scheduled_at
      await db.query(
        `UPDATE notification_queue SET status=$1, retry_count=$2, error=$3, scheduled_at=$4 WHERE id=$5`,
        [status, retries, err.message, scheduledAt, job.id]
      )
    }
  }
}

async function dispatchNotification(
  category: NotificationCategory,
  title: string,
  body: string,
  url?: string | null
) {
  const targets = await loadTargets(category)
  const webPushResult = await sendWebPush(title, body, url, targets.pushUserIds)
  const fcmResult = await sendFcm(title, body, url, targets.pushUserIds)
  const emailResult = await sendEmail(title, body, url, targets.emailUserIds)
  return { push: webPushResult, fcm: fcmResult, email: emailResult }
}

interface Targets {
  pushUserIds: Set<string>
  emailUserIds: Set<string>
}

async function loadTargets(category: NotificationCategory): Promise<Targets> {
  const pushCol = `${category}_push`
  const emailCol = `${category}_email`

  const rows = await db.all(
    `SELECT u.id,
      COALESCE(p.push_enabled, true) AS push_ok,
      COALESCE(p.email_enabled, true) AS email_ok,
      COALESCE(p.${pushCol}, true) AS cat_push_ok,
      COALESCE(p.${emailCol}, true) AS cat_email_ok
     FROM users u
     LEFT JOIN notification_preferences p ON p.user_id = u.id`
  )

  const pushUserIds = new Set<string>()
  const emailUserIds = new Set<string>()

  for (const row of rows) {
    if (row.push_ok && row.cat_push_ok) pushUserIds.add(row.id)
    if (row.email_ok && row.cat_email_ok) emailUserIds.add(row.id)
  }

  return { pushUserIds, emailUserIds }
}

async function sendWebPush(title: string, body: string, url: string | null | undefined, userIds: Set<string>) {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0, failed: 0 }

  const subs = await db.all(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions
     WHERE user_id IS NULL OR user_id = ANY($1::text[])
     LIMIT 500`,
    [Array.from(userIds)]
  )

  let sent = 0, failed = 0
  const payload = JSON.stringify({ title, body, url: url || '/', icon: '/logo.png', badge: '/logo.png' })

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent++
    } catch (e: any) {
      failed++
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [sub.endpoint])
      }
    }
  }
  return { sent, failed }
}

async function sendFcm(title: string, body: string, url: string | null | undefined, userIds: Set<string>) {
  const admin = await getFirebaseAdmin()
  if (!admin) return { sent: 0, failed: 0 }

  const tokens = await db.all(
    `SELECT token FROM fcm_tokens
     WHERE user_id IS NULL OR user_id = ANY($1::text[])
     LIMIT 500`,
    [Array.from(userIds)]
  )
  if (tokens.length === 0) return { sent: 0, failed: 0 }

  const messaging = admin.messaging()
  let sent = 0, failed = 0

  for (const row of tokens) {
    try {
      await messaging.send({
        token: row.token,
        notification: { title, body },
        data: { title, body, url: url || '/', type: 'notification' },
        android: { notification: { channelId: 'zionite-general', icon: 'logo', color: '#c9a227' } }
      })
      sent++
    } catch (e: any) {
      failed++
      if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') {
        await db.query(`DELETE FROM fcm_tokens WHERE token=$1`, [row.token])
      }
    }
  }
  return { sent, failed }
}

async function sendEmail(subject: string, body: string, url: string | null | undefined, userIds: Set<string>) {
  const transporter = getEmailTransporter()
  if (!transporter) return { sent: 0, failed: 0 }

  let users: any[] = []
  if (userIds.size > 0) {
    const placeholders = Array.from(userIds).map((_, i) => `$${i + 1}`).join(',')
    users = await db.all(`SELECT email FROM users WHERE email IS NOT NULL AND id IN (${placeholders})`, Array.from(userIds))
  } else {
    users = await db.all(`SELECT email FROM users WHERE email IS NOT NULL`)
  }

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1b1208;">
    <div style="background:#c9a227;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#1b1208;font-size:22px;">ZioniteFM</h1>
    </div>
    <div style="padding:24px;background:#fff;border:1px solid #e5e5e5;">
      <h2 style="margin-top:0;">${subject}</h2>
      <p>${body}</p>
      ${url ? `<p><a href="${url}" style="display:inline-block;background:#c9a227;color:#1b1208;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Open in ZioniteFM</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
      <p style="font-size:12px;color:#666;">You received this because you are subscribed to ZioniteFM notifications. Manage preferences in your account settings.</p>
    </div>
  </div>`

  let sent = 0, failed = 0
  for (const user of users) {
    try {
      await transporter.sendMail({
        from,
        to: user.email,
        subject,
        text: `${body}\n\n${url || ''}`,
        html
      })
      sent++
    } catch { failed++ }
  }
  return { sent, failed }
}

async function logNotification(
  type: string,
  title: string,
  body: string,
  url: string | null | undefined,
  result: { push: { sent: number; failed: number }; fcm: { sent: number; failed: number }; email: { sent: number; failed: number } }
) {
  const pushCount = result.push.sent + result.fcm.sent
  const emailCount = result.email.sent
  await dbWriteSafe(
    `INSERT INTO notification_log (id, type, title, body, url, push_count, email_count, fcm_count, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [uuidv4(), type, title, body, url || null, pushCount, emailCount, result.fcm.sent]
  )
}

export function startNotificationWorker(intervalMs = 15000) {
  console.log(`[NOTIFY] worker started, polling every ${intervalMs}ms`)
  setInterval(() => {
    processPendingNotifications().catch((err: any) => {
      console.error('[NOTIFY] worker error:', err.message)
    })
  }, intervalMs)
}
