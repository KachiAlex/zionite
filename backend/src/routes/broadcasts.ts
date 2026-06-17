import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth'

const router = Router()

router.get('/active', async (_req, res) => {
  const db = await getDb()
  const broadcast = await db.get(
    'SELECT * FROM broadcasts WHERE status = $1 ORDER BY started_at DESC LIMIT 1',
    ['live']
  )
  res.json({ broadcast: broadcast || null })
})

router.get('/', async (_req, res) => {
  const db = await getDb()
  const broadcasts = await db.all(
    'SELECT * FROM broadcasts ORDER BY created_at DESC'
  )
  res.json({ broadcasts })
})

router.get('/stats/overview', authenticateToken, requireRole('admin', 'broadcaster'), async (_req, res) => {
  const db = await getDb()
  const total = await db.get('SELECT COUNT(*) as count FROM broadcasts')
  const live = await db.get('SELECT COUNT(*) as count FROM broadcasts WHERE status = $1', ['live'])
  const ended = await db.get('SELECT COUNT(*) as count FROM broadcasts WHERE status = $1', ['ended'])
  res.json({
    total: total?.count || 0,
    live: live?.count || 0,
    ended: ended?.count || 0
  })
})

router.post(
  '/',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  async (req: AuthRequest, res) => {
    const { title, description, scripture_reference } = req.body
    if (!title) {
      res.status(400).json({ error: 'Title is required' })
      return
    }

    const db = await getDb()
    const existingLive = await db.get(
      'SELECT * FROM broadcasts WHERE status = $1',
      ['live']
    )
    if (existingLive) {
      res.status(409).json({ error: 'A broadcast is already live' })
      return
    }

    const id = uuidv4()
    await db.run(
      'INSERT INTO broadcasts (id, title, description, scripture_reference, status, started_at, broadcaster_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, title, description || '', scripture_reference || '', 'live', new Date().toISOString(), req.user!.id]
    )

    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id])
    res.status(201).json({ broadcast })
  }
)

router.post(
  '/:id/end',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  async (req: AuthRequest, res) => {
    const db = await getDb()
    const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [req.params.id])
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' })
      return
    }
    if (broadcast.broadcaster_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized' })
      return
    }

    await db.run(
      'UPDATE broadcasts SET status = $1, ended_at = $2 WHERE id = $3',
      ['ended', new Date().toISOString(), req.params.id]
    )

    const updated = await db.get('SELECT * FROM broadcasts WHERE id = $1', [req.params.id])
    res.json({ broadcast: updated })
  }
)

export default router
