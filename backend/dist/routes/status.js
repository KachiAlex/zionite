"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        await db.get('SELECT 1');
        const broadcast = await db.get('SELECT status FROM broadcasts WHERE status = $1', ['live']);
        res.json({
            status: 'healthy',
            database: 'connected',
            streaming: broadcast ? 'live' : 'idle',
            timestamp: new Date().toISOString(),
        });
    }
    catch {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            streaming: 'unknown',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=status.js.map