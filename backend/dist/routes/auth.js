"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    console.log('[AUTH] /register hit, body keys:', Object.keys(req.body));
    try {
        console.log('[AUTH] /register initDb start');
        await Promise.race([
            (0, db_1.initDb)(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timed out')), 15000))
        ]);
        console.log('[AUTH] /register initDb done');
    }
    catch (err) {
        console.error('[AUTH] /register initDb failed:', err?.message || err);
        res.status(500).json({ error: err?.message || 'Database unavailable' });
        return;
    }
    const { email, password, name } = req.body;
    console.log('[AUTH] /register body email present:', !!email, 'password present:', !!password, 'name present:', !!name);
    if (!email || !password || !name) {
        res.status(400).json({ error: 'Email, password, and name are required' });
        return;
    }
    const db = await (0, db_1.getDb)();
    const existing = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (existing) {
        res.status(409).json({ error: 'Email already registered' });
        return;
    }
    const hash = await bcryptjs_1.default.hash(password, 10);
    const id = (0, uuid_1.v4)();
    await db.run('INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)', [id, email, hash, name, 'listener']);
    const token = jsonwebtoken_1.default.sign({ id, email, role: 'listener' }, auth_1.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, email, name, role: 'listener' } });
});
router.post('/login', async (req, res) => {
    console.log('[AUTH] /login hit, body keys:', Object.keys(req.body));
    try {
        // Time-out DB init to avoid Vercel cold-start hangs
        console.log('[AUTH] /login initDb start');
        await Promise.race([
            (0, db_1.initDb)(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timed out')), 15000))
        ]);
        console.log('[AUTH] /login initDb done');
        const { email, password } = req.body;
        console.log('[AUTH] /login body email present:', !!email, 'password present:', !!password);
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        const db = await (0, db_1.getDb)();
        console.log('[AUTH] /login querying user for:', email);
        const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
        console.log('[AUTH] /login user found:', !!user);
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        console.log('[AUTH] /login comparing password');
        const valid = await bcryptjs_1.default.compare(password, user.password_hash);
        console.log('[AUTH] /login password valid:', valid);
        if (!valid) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        console.log('[AUTH] /login signing JWT');
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, auth_1.JWT_SECRET, { expiresIn: '7d' });
        console.log('[AUTH] /login success, returning token');
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    }
    catch (err) {
        console.error('[AUTH] /login catch error:', err?.message || err);
        res.status(500).json({ error: err?.message || 'Login failed' });
    }
});
router.get('/verify', auth_1.authenticateToken, async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const user = await db.get('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'Failed to verify token' });
    }
});
router.get('/profile', auth_1.authenticateToken, async (req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const user = await db.get('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [req.user.id]);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
router.put('/profile', auth_1.authenticateToken, async (req, res) => {
    const { name, email } = req.body;
    if (!name && !email) {
        res.status(400).json({ error: 'Name or email required' });
        return;
    }
    try {
        const db = await (0, db_1.getDb)();
        const updates = [];
        const values = [];
        let paramIndex = 1;
        if (name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }
        if (email) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }
        values.push(req.user.id);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
        const user = await db.get('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
router.get('/users', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (_req, res) => {
    try {
        const db = await (0, db_1.getDb)();
        const users = await db.all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json({ users });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.put('/users/:id/role', auth_1.authenticateToken, (0, auth_1.requireRole)('admin'), async (req, res) => {
    const { role } = req.body;
    if (!role || !['listener', 'broadcaster', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Valid role required' });
        return;
    }
    try {
        const db = await (0, db_1.getDb)();
        await db.run('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
        const user = await db.get('SELECT id, email, name, role FROM users WHERE id = $1', [req.params.id]);
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'Failed to update role' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map