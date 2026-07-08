import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

// Public: submit a testimony
router.post('/', async (req: any, res) => {
  try {
    await initDb()
    const { name, email, content } = req.body
    if (!name || !content) return res.status(400).json({ error: 'Name and content are required' })
    const id = uuidv4()
    await db.run(
      `INSERT INTO testimonies (id, name, email, content, tenant_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, name, email || null, content.trim(), req.tenantId]
    )
    const row = await db.get('SELECT * FROM testimonies WHERE id = $1', [id])
    res.status(201).json({ testimony: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Public: list approved testimonies
router.get('/', async (req: any, res) => {
  try {
    await initDb()
    const rows = await db.all(
      `SELECT id, name, content, status, is_featured, created_at FROM testimonies
       WHERE status = 'approved' AND tenant_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.tenantId]
    )
    res.json({ testimonies: rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: get all testimonies
router.get('/admin/all', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const rows = await db.all('SELECT * FROM testimonies WHERE tenant_id=$1 ORDER BY created_at DESC', [req.tenantId])
    res.json({ testimonies: rows })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: approve/reject testimony
router.patch('/:id', authenticateToken, async (req: any, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { status, is_featured } = req.body
    const existing = await db.get('SELECT * FROM testimonies WHERE id = $1 AND tenant_id=$2', [req.params.id, req.tenantId])
    if (!existing) return res.status(404).json({ error: 'Not found' })
    await db.run(
      'UPDATE testimonies SET status = $1, is_featured = $2 WHERE id = $3 AND tenant_id=$4',
      [status ?? existing.status, is_featured ?? existing.is_featured, req.params.id, req.tenantId]
    )
    const row = await db.get('SELECT * FROM testimonies WHERE id = $1', [req.params.id])
    res.json({ testimony: row })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Admin: delete testimony
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    await initDb()
    const user = (req as any).user
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    await db.run('DELETE FROM testimonies WHERE id = $1 AND tenant_id=$2', [req.params.id, req.tenantId])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
