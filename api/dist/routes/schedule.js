import { Router } from 'express';
import { db, initDb } from '../db.js';
const router = Router();
router.get('/', async (req, res) => {
    try {
        await initDb();
        const rows = await db.all('SELECT * FROM schedule ORDER BY day_of_week, time');
        const today = new Date().getDay();
        const schedule = rows.map((s) => {
            let daysUntil = s.day_of_week - today;
            if (daysUntil < 0)
                daysUntil += 7;
            if (daysUntil === 0)
                daysUntil = 7;
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + daysUntil);
            return {
                ...s,
                next_occurrence: nextDate.toISOString().split('T')[0],
                days_until: daysUntil
            };
        });
        res.json({ schedule });
    }
    catch (err) {
        console.error('[SCHEDULE] error:', err.message);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});
export default router;
//# sourceMappingURL=schedule.js.map