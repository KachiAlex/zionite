import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth'

const router = Router()

// Get chat messages for a broadcast (public)
router.get('/broadcast/:broadcastId', async (req, res) => {
  try {
    const db = await getDb()
    const messages = await db.all(
      `SELECT id, user_name, message, created_at 
       FROM chat_messages 
       WHERE broadcast_id = $1 AND is_private = FALSE
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.params.broadcastId]
    )
    res.json({ messages: messages.reverse() })
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Send a chat message
router.post('/broadcast/:broadcastId', authenticateToken, async (req: AuthRequest, res) => {
  const { message } = req.body
  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: 'Message is required' })
    return
  }

  try {
    const db = await getDb()
    const id = uuidv4()
    await db.run(
      `INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, message, is_private) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.params.broadcastId, req.user!.id, req.user!.email.split('@')[0], message.trim(), false]
    )
    
    const newMessage = await db.get('SELECT * FROM chat_messages WHERE id = $1', [id])
    res.status(201).json({ message: newMessage })
  } catch {
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Get all chat messages for staff (including private)
router.get('/staff/all', authenticateToken, requireRole('admin', 'broadcaster'), async (req, res) => {
  try {
    const db = await getDb()
    const { broadcastId } = req.query
    
    let query = `
      SELECT cm.*, b.title as broadcast_title
      FROM chat_messages cm
      LEFT JOIN broadcasts b ON cm.broadcast_id = b.id
      WHERE 1=1
    `
    const params: (string | boolean)[] = []
    
    if (broadcastId) {
      query += ` AND cm.broadcast_id = $${params.length + 1}`
      params.push(broadcastId as string)
    }
    
    query += ` ORDER BY cm.created_at DESC LIMIT 100`
    
    const messages = await db.all(query, params)
    res.json({ messages })
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Delete a chat message (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb()
    await db.run('DELETE FROM chat_messages WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

export default router
