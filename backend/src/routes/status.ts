import { Router } from 'express'
import { getDb } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const db = await getDb()
    await db.get('SELECT 1')
    const broadcast = await db.get(
      'SELECT status FROM broadcasts WHERE status = $1',
      ['live']
    )
    res.json({
      status: 'healthy',
      database: 'connected',
      streaming: broadcast ? 'live' : 'idle',
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      streaming: 'unknown',
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
