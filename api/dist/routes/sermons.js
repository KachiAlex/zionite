import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db, initDb } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
const router = Router();
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, 'uploads/'),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, unique);
    }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
router.get('/', async (req, res) => {
    try {
        await initDb();
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const query = limit
            ? 'SELECT * FROM sermons ORDER BY date DESC LIMIT $1'
            : 'SELECT * FROM sermons ORDER BY date DESC';
        const sermons = limit ? await db.all(query, [limit]) : await db.all(query);
        res.json({ sermons });
    }
    catch (err) {
        console.error('[SERMONS] list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch sermons' });
    }
});
router.post('/', authenticateToken, requireRole('admin'), upload.single('audio'), async (req, res) => {
    try {
        await initDb();
        const { title, description, scripture_reference, speaker, series, date, duration } = req.body;
        if (!title || !date) {
            res.status(400).json({ error: 'Title and date are required' });
            return;
        }
        const id = uuidv4();
        const audioUrl = req.file ? `/uploads/${req.file.filename}` : '';
        await db.run(`INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, date, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, title, description || null, scripture_reference || null, speaker || null, series || null, audioUrl, date, duration ? parseInt(duration, 10) : null]);
        res.json({ sermon: { id, title, description, scripture_reference, speaker, series, audio_url: audioUrl, date, duration } });
    }
    catch (err) {
        console.error('[SERMONS] create error:', err.message);
        res.status(500).json({ error: 'Failed to upload sermon' });
    }
});
export default router;
//# sourceMappingURL=sermons.js.map