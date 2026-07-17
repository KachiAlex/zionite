import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
// Public: list prayer requests (non-anonymous names shown, anonymous names hidden)
router.get('/', async (req, res) => {
    try {
        await initDb();
        const rows = await db.all('SELECT id, CASE WHEN is_anonymous THEN NULL ELSE name END as name, request, is_anonymous, prayers_count, created_at FROM prayer_requests ORDER BY created_at DESC LIMIT 50');
        res.json({ prayers: rows });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Public: submit a prayer request (anonymous or named)
router.post('/', async (req, res) => {
    try {
        await initDb();
        const { name, request, is_anonymous } = req.body;
        if (!request || !request.trim())
            return res.status(400).json({ error: 'Request is required' });
        const id = uuidv4();
        const anon = is_anonymous === true;
        await db.run(`INSERT INTO prayer_requests (id, name, request, is_anonymous) VALUES ($1, $2, $3, $4)`, [id, anon ? null : (name || 'Anonymous'), request.trim(), anon]);
        const row = await db.get('SELECT id, CASE WHEN is_anonymous THEN NULL ELSE name END as name, request, is_anonymous, prayers_count, created_at FROM prayer_requests WHERE id = $1', [id]);
        res.status(201).json({ prayer: row });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Public: pray for a request (increment count)
router.post('/:id/pray', async (req, res) => {
    try {
        await initDb();
        await db.run('UPDATE prayer_requests SET prayers_count = prayers_count + 1 WHERE id = $1', [req.params.id]);
        const row = await db.get('SELECT prayers_count FROM prayer_requests WHERE id = $1', [req.params.id]);
        res.json({ prayers_count: row?.prayers_count || 0 });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Admin: get all (with names even for anonymous)
router.get('/admin/all', authenticateToken, async (req, res) => {
    try {
        await initDb();
        const user = req.user;
        if (user?.role !== 'admin')
            return res.status(403).json({ error: 'Admin only' });
        const rows = await db.all('SELECT * FROM prayer_requests ORDER BY created_at DESC');
        res.json({ prayers: rows });
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
        await db.run('DELETE FROM prayer_requests WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
export default router;
//# sourceMappingURL=prayer.js.map