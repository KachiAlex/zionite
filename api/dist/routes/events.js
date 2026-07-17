import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
// Public: list active events
router.get('/', async (req, res) => {
    try {
        await initDb();
        const rows = await db.all('SELECT * FROM events WHERE is_active = TRUE ORDER BY date ASC, time ASC');
        res.json({ events: rows });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Public: get single event
router.get('/:id', async (req, res) => {
    try {
        await initDb();
        const row = await db.get('SELECT * FROM events WHERE id = $1', [req.params.id]);
        if (!row)
            return res.status(404).json({ error: 'Not found' });
        res.json({ event: row });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Admin: create
router.post('/', authenticateToken, async (req, res) => {
    try {
        await initDb();
        const user = req.user;
        if (user?.role !== 'admin')
            return res.status(403).json({ error: 'Admin only' });
        const { title, description, date, time, location, image_url, is_active } = req.body;
        if (!title)
            return res.status(400).json({ error: 'Title is required' });
        const id = uuidv4();
        await db.run(`INSERT INTO events (id, title, description, date, time, location, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, title, description || '', date || '', time || '', location || '', image_url || '', is_active !== false]);
        const row = await db.get('SELECT * FROM events WHERE id = $1', [id]);
        res.status(201).json({ event: row });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Admin: update
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        await initDb();
        const user = req.user;
        if (user?.role !== 'admin')
            return res.status(403).json({ error: 'Admin only' });
        const { title, description, date, time, location, image_url, is_active } = req.body;
        const existing = await db.get('SELECT * FROM events WHERE id = $1', [req.params.id]);
        if (!existing)
            return res.status(404).json({ error: 'Not found' });
        await db.run(`UPDATE events SET title = $1, description = $2, date = $3, time = $4, location = $5, image_url = $6, is_active = $7 WHERE id = $8`, [title ?? existing.title, description ?? existing.description, date ?? existing.date,
            time ?? existing.time, location ?? existing.location, image_url ?? existing.image_url,
            is_active ?? existing.is_active, req.params.id]);
        const row = await db.get('SELECT * FROM events WHERE id = $1', [req.params.id]);
        res.json({ event: row });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Admin: delete
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await initDb();
        const user = req.user;
        if (user?.role !== 'admin')
            return res.status(403).json({ error: 'Admin only' });
        await db.run('DELETE FROM events WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
export default router;
//# sourceMappingURL=events.js.map