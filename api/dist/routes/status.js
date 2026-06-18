import { Router } from 'express';
import { db, initDb, dbReady } from '../db.js';
const router = Router();
router.get('/', async (_req, res) => {
    try {
        let dbStatus = 'unknown';
        if (dbReady) {
            await initDb();
            await db.query('SELECT 1');
            dbStatus = 'connected';
        }
        else {
            dbStatus = 'not configured';
        }
        res.json({
            status: 'ok',
            database: dbStatus,
            streaming: 'ready',
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        console.error('[STATUS] error:', err.message);
        res.json({
            status: 'degraded',
            database: 'error',
            streaming: 'ready',
            timestamp: new Date().toISOString()
        });
    }
});
export default router;
//# sourceMappingURL=status.js.map