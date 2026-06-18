import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb, dbReady } from '../db.js';
import { JWT_SECRET, authenticateToken, requireRole } from '../middleware/auth.js';
const router = Router();
router.post('/register', async (req, res) => {
    try {
        if (!dbReady) {
            res.status(503).json({ error: 'Database not configured' });
            return;
        }
        await initDb();
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            res.status(400).json({ error: 'Email, password, and name are required' });
            return;
        }
        const existing = await db.get('SELECT * FROM users WHERE email = $1', [email]);
        if (existing) {
            res.status(409).json({ error: 'Email already registered' });
            return;
        }
        const hash = await bcrypt.hash(password, 10);
        const id = uuidv4();
        await db.run('INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)', [id, email, hash, name, 'listener']);
        const token = jwt.sign({ id, email, name, role: 'listener' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id, email, name, role: 'listener' } });
    }
    catch (err) {
        console.error('[AUTH] register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});
router.post('/login', async (req, res) => {
    try {
        if (!dbReady) {
            res.status(503).json({ error: 'Database not configured' });
            return;
        }
        await initDb();
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }
    catch (err) {
        console.error('[AUTH] login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});
router.get('/verify', authenticateToken, (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    res.json({ user: req.user });
});
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await initDb();
        const users = await db.all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json({ users });
    }
    catch (err) {
        console.error('[AUTH] users error:', err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.put('/users/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await initDb();
        const { id } = req.params;
        const { role } = req.body;
        if (!role || !['listener', 'broadcaster', 'admin'].includes(role)) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }
        const user = await db.get('SELECT * FROM users WHERE id = $1', [id]);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        await db.run('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('[AUTH] update role error:', err.message);
        res.status(500).json({ error: 'Failed to update role' });
    }
});
export default router;
//# sourceMappingURL=auth.js.map