import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb, dbReady } from '../db.js'
import { JWT_SECRET, authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js'
import { sendEmail } from '../lib/email.js'

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

router.post('/register', async (req, res) => {
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

router.post('/login', async (req, res) => {
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

router.get('/verify', authenticateToken, (req: AuthenticatedRequest, res) => {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return }
  res.json({ user: req.user })
})

router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await initDb()
    const users = await db.all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC')
    res.json({ users })
  } catch (err: any) {
    console.error('[AUTH] users error:', err.message)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

router.put('/users/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
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

router.post('/forgot-password', async (req, res) => {
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
      htmlContent: `<p>Hello ${user.name || 'there'},</p>
        <p>You requested a password reset. Click the link below to set a new password (expires in 1 hour):</p>
        <p><a href="${resetUrl}" style="padding:10px 20px;background:#c9a227;color:#1b1208;text-decoration:none;border-radius:6px;">Reset Password</a></p>
        <p>Or copy this link: ${resetUrl}</p>
        <p>If you didn't request this, ignore this email.</p>`,
    })

    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' })
  } catch (err: any) {
    console.error('[AUTH] forgot-password error:', err.message)
    res.status(500).json({ error: 'Failed to send reset email' })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    if (!dbReady) { res.status(503).json({ error: 'Database not configured' }); return }
    await initDb()
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return }
    const { token, password } = parsed.data

    const user = await db.get(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    )
    if (!user) { res.status(400).json({ error: 'Invalid or expired token' }); return }

    const hash = await bcrypt.hash(password, 10)
    await db.run(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, user.id]
    )
    res.json({ success: true, message: 'Password updated successfully' })
  } catch (err: any) {
    console.error('[AUTH] reset-password error:', err.message)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

export default router
