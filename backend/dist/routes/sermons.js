"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = './uploads/sermons';
try {
    if (!fs_1.default.existsSync(uploadDir)) {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    }
}
catch {
    // Vercel serverless has read-only filesystem; uploads won't persist
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path_1.default.extname(file.originalname)}`;
        cb(null, unique);
    },
});
const upload = (0, multer_1.default)({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    const db = await (0, db_1.getDb)();
    const sermons = await db.all('SELECT * FROM sermons ORDER BY date DESC');
    res.json({ sermons });
});
router.get('/series/list', async (_req, res) => {
    const db = await (0, db_1.getDb)();
    const series = await db.all("SELECT DISTINCT series, COUNT(*) as count FROM sermons WHERE series != '' GROUP BY series ORDER BY series");
    res.json({ series });
});
router.get('/series/:name', async (req, res) => {
    const db = await (0, db_1.getDb)();
    const sermons = await db.all('SELECT * FROM sermons WHERE series = $1 ORDER BY date DESC', [req.params.name]);
    res.json({ sermons });
});
router.get('/stats/overview', async (_req, res) => {
    const db = await (0, db_1.getDb)();
    const totalSermons = await db.get('SELECT COUNT(*) as count FROM sermons');
    const totalSeries = await db.get("SELECT COUNT(DISTINCT series) as count FROM sermons WHERE series != ''");
    const totalSpeakers = await db.get("SELECT COUNT(DISTINCT speaker) as count FROM sermons WHERE speaker != ''");
    res.json({
        totalSermons: totalSermons?.count || 0,
        totalSeries: totalSeries?.count || 0,
        totalSpeakers: totalSpeakers?.count || 0
    });
});
router.get('/:id', async (req, res) => {
    const db = await (0, db_1.getDb)();
    const sermon = await db.get('SELECT * FROM sermons WHERE id = $1', [req.params.id]);
    if (!sermon) {
        res.status(404).json({ error: 'Sermon not found' });
        return;
    }
    res.json({ sermon });
});
router.post('/', auth_1.authenticateToken, (0, auth_1.requireRole)('broadcaster', 'admin'), upload.single('audio'), async (req, res) => {
    const { title, description, scripture_reference, speaker, series, date, duration } = req.body;
    if (!title || !date) {
        res.status(400).json({ error: 'Title and date are required' });
        return;
    }
    const audioUrl = req.file ? `/uploads/sermons/${req.file.filename}` : null;
    if (!audioUrl) {
        res.status(400).json({ error: 'Audio file is required' });
        return;
    }
    const db = await (0, db_1.getDb)();
    const id = (0, uuid_1.v4)();
    await db.run('INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, date, duration) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id, title, description || '', scripture_reference || '', speaker || '', series || '', audioUrl, date, duration || 0]);
    const sermon = await db.get('SELECT * FROM sermons WHERE id = $1', [id]);
    res.status(201).json({ sermon });
});
exports.default = router;
//# sourceMappingURL=sermons.js.map