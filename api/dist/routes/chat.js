import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
router.get('/broadcast/:broadcastId', async (req, res) => {
    try {
        await initDb();
        const messages = await db.all('SELECT * FROM chat_messages WHERE broadcast_id = $1 ORDER BY created_at ASC', [req.params.broadcastId]);
        res.json({ messages });
    }
    catch (err) {
        console.error('[CHAT] get error:', err.message);
        res.status(500).json({ error: 'Failed to fetch chat messages' });
    }
});
router.post('/broadcast/:broadcastId', authenticateToken, async (req, res) => {
    try {
        await initDb();
        const { message } = req.body;
        if (!message?.trim()) {
            res.status(400).json({ error: 'Message is required' });
            return;
        }
        const id = uuidv4();
        await db.run('INSERT INTO chat_messages (id, broadcast_id, user_id, user_name, message) VALUES ($1, $2, $3, $4, $5)', [id, req.params.broadcastId, req.user.id, req.user.name, message.trim()]);
        res.json({ message: { id, broadcast_id: req.params.broadcastId, user_id: req.user.id, user_name: req.user.name, message: message.trim(), created_at: new Date().toISOString() } });
    }
    catch (err) {
        console.error('[CHAT] post error:', err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});
export default router;
//# sourceMappingURL=chat.js.map