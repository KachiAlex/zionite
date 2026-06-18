"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get upcoming schedule
router.get('/', async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const today = new Date().getDay();
        // Get all schedule items for the current week starting from today
        const schedule = await db.all(`SELECT id, title, day_of_week, time, type
       FROM schedule 
       ORDER BY day_of_week, time`);
        // Calculate next occurrence for each item
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const upcoming = schedule.map(item => {
            let daysUntil = item.day_of_week - currentDay;
            const [hours, minutes] = item.time.split(':').map(Number);
            // If it's today but already passed, move to next week
            if (daysUntil === 0 && (hours < currentHour || (hours === currentHour && minutes <= currentMinute))) {
                daysUntil = 7;
            }
            // If it's earlier in the week, move to next week
            if (daysUntil < 0) {
                daysUntil += 7;
            }
            const nextDate = new Date(now);
            nextDate.setDate(now.getDate() + daysUntil);
            nextDate.setHours(hours, minutes, 0, 0);
            return {
                ...item,
                next_occurrence: nextDate.toISOString(),
                days_until: daysUntil
            };
        }).sort((a, b) => a.days_until - b.days_until);
        res.json({ schedule: upcoming });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});
// Get raw schedule (for admin)
router.get('/all', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const schedule = await db.all('SELECT * FROM schedule ORDER BY day_of_week, time');
        res.json({ schedule });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});
// Add schedule item (admin only)
router.post('/', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (req, res) => {
    const { title, day_of_week, time, type = 'service' } = req.body;
    if (!title || day_of_week === undefined || !time) {
        res.status(400).json({ error: 'Title, day_of_week, and time are required' });
        return;
    }
    try {
        const db = await (0, db_1.getDb)();
        const id = (0, uuid_1.v4)();
        await db.run(`INSERT INTO schedule (id, title, day_of_week, time, type) 
       VALUES ($1, $2, $3, $4, $5)`, [id, title, day_of_week, time, type]);
        const item = await db.get('SELECT * FROM schedule WHERE id = $1', [id]);
        res.status(201).json({ schedule: item });
    }
    catch {
        res.status(500).json({ error: 'Failed to create schedule item' });
    }
});
// Update schedule item (admin only)
router.put('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (req, res) => {
    const { title, day_of_week, time, type } = req.body;
    try {
        const db = await (0, db_1.getDb)();
        const updates = [];
        const values = [];
        let paramIndex = 1;
        if (title) {
            updates.push(`title = $${paramIndex++}`);
            values.push(title);
        }
        if (day_of_week !== undefined) {
            updates.push(`day_of_week = $${paramIndex++}`);
            values.push(day_of_week);
        }
        if (time) {
            updates.push(`time = $${paramIndex++}`);
            values.push(time);
        }
        if (type) {
            updates.push(`type = $${paramIndex++}`);
            values.push(type);
        }
        values.push(req.params.id);
        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }
        await db.run(`UPDATE schedule SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
        const updated = await db.get('SELECT * FROM schedule WHERE id = $1', [req.params.id]);
        res.json({ schedule: updated });
    }
    catch {
        res.status(500).json({ error: 'Failed to update schedule' });
    }
});
// Delete schedule item (admin only)
router.delete('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        await db.run('DELETE FROM schedule WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});
exports.default = router;
//# sourceMappingURL=schedule.js.map