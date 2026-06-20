import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

// Public: submit a donation
router.post('/', async (req, res) => {
  try {
    await initDb()
    const { name, email, amount, message, is_anonymous } = req.body
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Valid amount is required' })
    const id = uuidv4()
    await db.run(
      `INSERT INTO donations (id, name, email, amount, message, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name || null, email || null, parseFloat(amount), message || null, is_anonymous === true]
    )
    const row = await db.get('SELECT * FROM donations WHERE id = $1', [id])
    res.status(201).json({ donation: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Public: list donations (only show names if not anonymous)
router.get('/', async (req, res) => {
  try {
    await initDb()
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
    const rows = await db.all(
      `SELECT id, CASE WHEN is_anonymous THEN NULL ELSE name END as name,
        email, amount, message, is_anonymous, status, created_at
       FROM donations ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ donations: rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: get all donations (with names even for anonymous)
router.get('/admin/all', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const rows = await db.all('SELECT * FROM donations ORDER BY created_at DESC')
    const totalResult = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM donations')
    res.json({ donations: rows, total: totalResult?.total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: update donation status
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { status } = req.body
    const existing = await db.get('SELECT * FROM donations WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Not found' })
    await db.run('UPDATE donations SET status = $1 WHERE id = $2', [status || existing.status, req.params.id])
    const row = await db.get('SELECT * FROM donations WHERE id = $1', [req.params.id])
    res.json({ donation: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
