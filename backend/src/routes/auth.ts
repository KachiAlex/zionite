import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb, dbReady } from '../db.js'
import { JWT_SECRET, authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { sendEmail, emailTemplate } from '../lib/email.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
})

const resetSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

router.post('/register', async (req: any, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => i.message).join(', ')
      res.status(400).json({ error: errors })
      return
    }
    const { email, password, name } = parsed.data

    const existing = await db.get('SELECT * FROM users WHERE email = $1', [email])
    if (existing) { res.status(409).json({ error: 'Email already registered' }); return }

    const hash = await bcrypt.hash(password, 10)
    const id = uuidv4()
    await db.run(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
      [id, email, hash, name, 'listener']
    )
    const token = jwt.sign({ id, email, name, role: 'listener' }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id, email, name, role: 'listener' } })
  } catch (err: any) {
    console.error('[AUTH] register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req: any, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => i.message).join(', ')
      res.status(400).json({ error: errors })
      return
    }
    const { email, password } = parsed.data

    const user = await db.get('SELECT * FROM users WHERE email = $1', [email])
    if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return }

    if (user.is_suspended) {
      res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' }); return
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  } catch (err: any) {
    console.error('[AUTH] login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/verify', authenticateToken, async (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return }
  try {
    await initDb()
    const dbUser = await db.get('SELECT is_suspended FROM users WHERE id = $1', [req.user.id])
    if (dbUser?.is_suspended) {
      res.status(403).json({ error: 'Your account has been suspended.' }); return
    }
  } catch {}
  res.json({ user: req.user })
})

router.get('/users', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const users = await db.all('SELECT id, email, name, role, is_suspended, created_at FROM users ORDER BY created_at DESC')
    res.json({ users })
  } catch (err: any) {
    console.error('[AUTH] users error:', err.message)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

router.put('/users/:id/role', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { id } = req.params
    const { role } = req.body
    if (!role || !['listener', 'broadcaster', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' }); return
    }
    const user = await db.get('SELECT * FROM users WHERE id = $1', [id])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    await db.run('UPDATE users SET role = $1 WHERE id = $2', [role, id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[AUTH] update role error:', err.message)
    res.status(500).json({ error: 'Failed to update role' })
  }
})

router.patch('/users/:id/suspend', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { id } = req.params
    const { suspend } = req.body
    const user = await db.get('SELECT * FROM users WHERE id = $1', [id])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    if (user.role === 'super_admin') { res.status(403).json({ error: 'Cannot suspend super admin' }); return }
    await db.run('UPDATE users SET is_suspended = $1 WHERE id = $2', [suspend ? true : false, id])

    // Send email notification
    try {
      const action = suspend ? 'suspended' : 'reactivated'
      await sendEmail({
        to: user.email,
        toName: user.name,
        subject: `Account ${action} - ZioniteFM`,
        htmlContent: emailTemplate({
          title: `Account ${action}`,
          body: suspend
            ? `<p>Hello ${user.name || 'there'},</p><p>Your ZioniteFM account has been <strong>suspended</strong> by an administrator.</p><p>If you believe this is an error, please contact support.</p>`
            : `<p>Hello ${user.name || 'there'},</p><p>Good news! Your ZioniteFM account has been <strong>reactivated</strong>. You can now log in normally.</p>`,
        }),
        textContent: `Your ZioniteFM account has been ${action}.`,
      })
    } catch (emailErr: any) {
      console.error('[AUTH] suspend email error:', emailErr.message)
    }

    res.json({ success: true, is_suspended: suspend ? true : false })
  } catch (err: any) {
    console.error('[AUTH] suspend error:', err.message)
    res.status(500).json({ error: 'Failed to update suspension status' })
  }
})

router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { id } = req.params
    const user = await db.get('SELECT * FROM users WHERE id = $1', [id])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    if (user.role === 'super_admin') { res.status(403).json({ error: 'Cannot delete super admin' }); return }
    if (user.id === req.user!.id) { res.status(403).json({ error: 'Cannot delete your own account' }); return }

    // Send email notification before deletion
    try {
      await sendEmail({
        to: user.email,
        toName: user.name,
        subject: 'Account Removed - ZioniteFM',
        htmlContent: emailTemplate({
          title: 'Account Removed',
          body: `<p>Hello ${user.name || 'there'},</p><p>Your ZioniteFM account has been removed by an administrator.</p><p>If you believe this is an error, please contact support.</p>`,
        }),
        textContent: 'Your ZioniteFM account has been removed by an administrator.',
      })
    } catch (emailErr: any) {
      console.error('[AUTH] delete email error:', emailErr.message)
    }

    await db.run('DELETE FROM users WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[AUTH] delete user error:', err.message)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

router.post('/forgot-password', async (req: any, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const parsed = forgotSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Invalid email' }); return }
    const { email } = parsed.data

    const user = await db.get('SELECT id, email, name FROM users WHERE email = $1', [email])
    if (!user) {
      // Return success even if user not found (security through obscurity)
      res.json({ success: true, message: 'If an account exists, a reset link has been sent.' })
      return
    }

    const token = uuidv4()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await db.run(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires.toISOString(), user.id]
    )

    const resetUrl = `${process.env.FRONTEND_URL || 'https://www.zionite.online'}/reset-password?token=${token}`
    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: 'Reset your ZioniteFM password',
      htmlContent: emailTemplate({
        title: 'Reset your password',
        body: `<p>Hello ${user.name || 'there'},</p>
          <p>We received a request to reset your ZioniteFM password. Click the button below to choose a new password. This link expires in 1 hour.</p>
          <p style="font-size:13px;color:#8a8476;margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>`,
        ctaUrl: resetUrl,
        ctaText: 'Reset Password',
      }),
      textContent: `Reset your ZioniteFM password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    })

    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' })
  } catch (err: any) {
    console.error('[AUTH] forgot-password error:', err.message)
    res.status(500).json({ error: 'Failed to send reset email' })
  }
})

router.post('/reset-password', async (req: any, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return }
    const { token, password } = parsed.data

    const user = await db.get(
      'SELECT id, email, name FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    )
    if (!user) { res.status(400).json({ error: 'Invalid or expired token' }); return }

    const hash = await bcrypt.hash(password, 10)
    await db.run(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, user.id]
    )

    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: 'Your ZioniteFM password was changed',
      htmlContent: emailTemplate({
        title: 'Password updated',
        body: `<p>Hello ${user.name || 'there'},</p>
          <p>Your ZioniteFM password was successfully changed. If you made this change, you can ignore this email.</p>
          <p style="font-size:13px;color:#8a8476;margin-top:16px;">If you did not change your password, please contact support immediately.</p>`,
        ctaUrl: `${process.env.FRONTEND_URL || 'https://www.zionite.online'}/login`,
        ctaText: 'Sign In',
      }),
      textContent: 'Your ZioniteFM password was successfully changed. If you did not make this change, please contact support.',
    }).catch(() => {})

    res.json({ success: true, message: 'Password updated successfully' })
  } catch (err: any) {
    console.error('[AUTH] reset-password error:', err.message)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

router.post('/change-password', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Current and new password required (min 6 chars)' }); return
    }
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user!.id])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return }
    const hash = await bcrypt.hash(newPassword, 10)
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user!.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[AUTH] change-password error:', err.message)
    res.status(500).json({ error: 'Failed to change password' })
  }
})

router.get('/webauthn/credentials', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const creds = await db.all('SELECT id, credential_id, device_name, created_at FROM webauthn_credentials WHERE user_id = $1', [req.user!.id])
    res.json({ credentials: creds || [] })
  } catch (err: any) {
    console.error('[AUTH] webauthn/credentials error:', err.message)
    res.status(500).json({ error: 'Failed to fetch credentials' })
  }
})

router.post('/webauthn/register', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const { credential_id, public_key, device_name } = req.body
    if (!credential_id || !public_key) { res.status(400).json({ error: 'credential_id and public_key required' }); return }
    const existing = await db.get('SELECT id FROM webauthn_credentials WHERE credential_id = $1', [credential_id])
    if (existing) { res.json({ ok: true, message: 'Credential already registered' }); return }
    await db.run('INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, device_name) VALUES ($1,$2,$3,$4,$5)',
      [uuidv4(), req.user!.id, credential_id, public_key, device_name || 'My Device'])
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[AUTH] webauthn/register error:', err.message)
    res.status(500).json({ error: 'Failed to register credential' })
  }
})

router.delete('/webauthn/credentials/:credId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    await db.run('DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2', [req.params.credId, req.user!.id])
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[AUTH] webauthn/delete error:', err.message)
    res.status(500).json({ error: 'Failed to delete credential' })
  }
})

export default router
