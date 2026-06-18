"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Submit a prayer request
router.post('/', auth_1.authenticateToken, async (req, res) => {
    const { request, is_private = true } = req.body;
    if (!request || request.trim().length === 0) {
        res.status(400).json({ error: 'Prayer request is required' });
        return;
    }
    try {
        const db = await (0, db_1.getDb)();
        const id = (0, uuid_1.v4)();
        await db.run(`INSERT INTO prayer_requests (id, user_id, user_name, request, is_private, status) 
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, req.user.id, req.user.email.split('@')[0], request.trim(), is_private, 'pending']);
        res.status(201).json({ success: true, id });
    }
    catch {
        res.status(500).json({ error: 'Failed to submit prayer request' });
    }
});
// Get user's own prayer requests
router.get('/my', auth_1.authenticateToken, async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const requests = await db.all(`SELECT id, request, status, created_at 
       FROM prayer_requests 
       WHERE user_id = $1 
       ORDER BY created_at DESC`, [req.user.id]);
        res.json({ requests });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});
// Get all prayer requests (admin/pastoral only)
router.get('/all', auth_1.authenticateToken, (0, auth_1.requireRole)('admin', 'broadcaster'), async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const { status } = req.query;
        let query = `
      SELECT id, user_name, request, status, created_at 
      FROM prayer_requests 
      WHERE 1=1
    `;
        const params = [];
        if (status) {
            query += ` AND status = $${params.length + 1}`;
            params.push(status);
        }
        query += ` ORDER BY created_at DESC LIMIT 100`;
        const requests = await db.all(query, params);
        res.json({ requests });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});
// Update prayer request status (admin only)
router.put('/:id/status', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'praying', 'answered'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    try {
        const db = await (0, db_1.getDb)();
        await db.run('UPDATE prayer_requests SET status = $1 WHERE id = $2', [status, req.params.id]);
        const updated = await db.get('SELECT * FROM prayer_requests WHERE id = $1', [req.params.id]);
        res.json({ request: updated });
    }
    catch {
        res.status(500).json({ error: 'Failed to update status' });
    }
});
exports.default = router;
//# sourceMappingURL=prayer.js.map