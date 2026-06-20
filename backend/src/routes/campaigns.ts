import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

// Public: list active campaigns
router.get('/', async (req, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT id, title, description, goal_amount, current_amount, end_date, is_active, created_at
       FROM campaigns WHERE is_active = TRUE ORDER BY created_at DESC`
    )
    res.json({ campaigns: rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: create campaign
router.post('/', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { title, description, goal_amount, end_date } = req.body
    if (!title || !goal_amount) return res.status(400).json({ error: 'Title and goal amount are required' })
    const id = uuidv4()
    await db.run(
      `INSERT INTO campaigns (id, title, description, goal_amount, end_date) VALUES ($1, $2, $3, $4, $5)`,
      [id, title, description || null, parseFloat(goal_amount), end_date || null]
    )
    const row = await db.get('SELECT * FROM campaigns WHERE id = $1', [id])
    res.status(201).json({ campaign: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: update campaign
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { title, description, goal_amount, current_amount, end_date, is_active } = req.body
    const existing = await db.get('SELECT * FROM campaigns WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Not found' })
    await db.run(
      `UPDATE campaigns SET title = $1, description = $2, goal_amount = $3, current_amount = $4, end_date = $5, is_active = $6 WHERE id = $7`,
      [title ?? existing.title, description ?? existing.description, goal_amount ?? existing.goal_amount,
       current_amount ?? existing.current_amount, end_date ?? existing.end_date, is_active ?? existing.is_active, req.params.id]
    )
    const row = await db.get('SELECT * FROM campaigns WHERE id = $1', [req.params.id])
    res.json({ campaign: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: delete campaign
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    await db.run('DELETE FROM campaigns WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
