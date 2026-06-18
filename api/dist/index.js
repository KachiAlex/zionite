import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import broadcastRoutes from './routes/broadcasts.js';
import sermonRoutes from './routes/sermons.js';
import scheduleRoutes from './routes/schedule.js';
import chatRoutes from './routes/chat.js';
import statusRoutes from './routes/status.js';
const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Strip /api prefix from Vercel rewrite so routes match at root
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        req.url = req.url.slice(4);
    }
    next();
});
// Request logging
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});
// Health checks
app.get('/ping', (_req, res) => res.json({ ok: true }));
app.get('/debug', (_req, res) => {
    res.json({
        dbUrlPresent: !!process.env.DATABASE_URL,
        jwtSecretPresent: !!process.env.JWT_SECRET,
        nodeEnv: process.env.NODE_ENV,
        vercel: process.env.VERCEL,
        timestamp: new Date().toISOString()
    });
});
// API routes
app.use('/auth', authRoutes);
app.use('/broadcasts', broadcastRoutes);
app.use('/sermons', sermonRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/chat', chatRoutes);
app.use('/status', statusRoutes);
// 404
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handler
app.use((err, _req, res, _next) => {
    console.error('[ERR]', err.message || err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
export default app;
//# sourceMappingURL=index.js.map