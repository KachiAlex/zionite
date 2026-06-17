import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { JWT_SECRET, authenticateToken, AuthRequest, requireRole } from '../middleware/auth'

const router = Router()

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' })
    return
  }

  const db = await getDb()
  const existing = await db.get('SELECT * FROM users WHERE email = $1', [email])
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const hash = await bcrypt.hash(password, 10)
  const id = uuidv4()
  await db.run(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
    [id, email, hash, name, 'listener']
  )

  const token = jwt.sign({ id, email, role: 'listener' }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id, email, name, role: 'listener' } })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const db = await getDb()
  const user = await db.get('SELECT * FROM users WHERE email = $1', [email])
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  })
})

router.get('/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = await getDb()
    const user = await db.get(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [req.user!.id]
    )
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to verify token' })
  }
})

router.get('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = await getDb()
    const user = await db.get(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    )
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  const { name, email } = req.body
  if (!name && !email) {
    res.status(400).json({ error: 'Name or email required' })
    return
  }

  try {
    const db = await getDb()
    const updates: string[] = []
    const values: (string | number)[] = []

    let paramIndex = 1
    if (name) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (email) {
      updates.push(`email = $${paramIndex++}`)
      values.push(email)
    }
    values.push(req.user!.id)

    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    const user = await db.get(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [req.user!.id]
    )
    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

router.get('/users', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const db = await getDb()
    const users = await db.all(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
    )
    res.json({ users })
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

router.put('/users/:id/role', authenticateToken, requireRole('admin'), async (req: AuthRequest, res) => {
  const { role } = req.body
  if (!role || !['listener', 'broadcaster', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Valid role required' })
    return
  }

  try {
    const db = await getDb()
    await db.run(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, req.params.id]
    )
    const user = await db.get(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [req.params.id]
    )
    res.json({ user })
  } catch {
    res.status(500).json({ error: 'Failed to update role' })
  }
})

export default router
