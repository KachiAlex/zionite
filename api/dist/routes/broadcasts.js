import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
const router = Router();
router.get('/', async (req, res) => {
    try {
        await initDb();
        const broadcasts = await db.all('SELECT * FROM broadcasts ORDER BY created_at DESC');
        res.json({ broadcasts });
    }
    catch (err) {
        console.error('[BROADCASTS] list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch broadcasts' });
    }
});
router.get('/active', async (req, res) => {
    try {
        await initDb();
        const broadcast = await db.get("SELECT * FROM broadcasts WHERE status = 'live' ORDER BY started_at DESC LIMIT 1");
        res.json({ broadcast: broadcast || null });
    }
    catch (err) {
        console.error('[BROADCASTS] active error:', err.message);
        res.status(500).json({ error: 'Failed to fetch active broadcast' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        await initDb();
        const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [req.params.id]);
        if (!broadcast) {
            res.status(404).json({ error: 'Broadcast not found' });
            return;
        }
        res.json({ broadcast });
    }
    catch (err) {
        console.error('[BROADCASTS] get error:', err.message);
        res.status(500).json({ error: 'Failed to fetch broadcast' });
    }
});
router.post('/', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
    try {
        await initDb();
        const { title, description, scripture_reference } = req.body;
        if (!title) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }
        const id = uuidv4();
        await db.run(`INSERT INTO broadcasts (id, title, description, scripture_reference, status, started_at, broadcaster_id)
       VALUES ($1, $2, $3, $4, 'live', CURRENT_TIMESTAMP, $5)`, [id, title, description || null, scripture_reference || null, req.user.id]);
        res.json({ broadcast: { id, title, description, scripture_reference, status: 'live', broadcaster_id: req.user.id } });
    }
    catch (err) {
        console.error('[BROADCASTS] create error:', err.message);
        res.status(500).json({ error: 'Failed to create broadcast' });
    }
});
router.post('/:id/end', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
    try {
        await initDb();
        const { id } = req.params;
        const broadcast = await db.get('SELECT * FROM broadcasts WHERE id = $1', [id]);
        if (!broadcast) {
            res.status(404).json({ error: 'Broadcast not found' });
            return;
        }
        await db.run("UPDATE broadcasts SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('[BROADCASTS] end error:', err.message);
        res.status(500).json({ error: 'Failed to end broadcast' });
    }
});
router.get('/stats/overview', authenticateToken, requireRole('broadcaster', 'admin'), async (req, res) => {
    try {
        await initDb();
        const result = await db.get("SELECT COUNT(*) as total FROM chat_messages");
        const total = parseInt(result?.total || '0', 10);
        res.json({ listening: total, peak: total, avg: Math.floor(total / 2) });
    }
    catch (err) {
        console.error('[BROADCASTS] stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
export default router;
//# sourceMappingURL=broadcasts.js.map