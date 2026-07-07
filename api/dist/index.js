import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.js';
import broadcastRoutes from './routes/broadcasts.js';
import sermonRoutes from './routes/sermons.js';
import scheduleRoutes from './routes/schedule.js';
import chatRoutes from './routes/chat.js';
import statusRoutes from './routes/status.js';
import guestSpeakerRoutes from './routes/guest-speakers.js';
import prayerRoutes from './routes/prayer.js';
import eventRoutes from './routes/events.js';
import donationRoutes from './routes/donations.js';
import testimonyRoutes from './routes/testimonies.js';
import campaignRoutes from './routes/campaigns.js';
import analyticsRoutes from './routes/analytics.js';
import searchRoutes from './routes/search.js';
import relayRoutes from './routes/relay.js';
import streamRoutes from './routes/stream.js';
import pushRoutes from './routes/push.js';
import radioRoutes from './routes/radio.js';
import radioScheduleRoutes from './routes/radio-schedules.js';
import playlistRoutes from './routes/playlists.js';
import musicRoutes from './routes/music.js';
import tenantRoutes from './routes/tenants.js';
import licensePlanRoutes from './routes/license-plans.js';
import { cacheMiddleware } from './middleware/cache.js';
import { resolveTenant, JWT_SECRET } from './middleware/auth.js';
import jwt from 'jsonwebtoken';
// Sentry init
if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
const app = express();
const ALLOWED_ORIGINS = [
    'https://www.zionite.online',
    'https://zionite.online',
    'https://zionite.fly.dev',
    'http://localhost:5173',
    'http://localhost:3000',
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin)
            return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin))
            return callback(null, true);
        // In development, be permissive
        if (process.env.NODE_ENV !== 'production')
            return callback(null, true);
        console.warn('[CORS] Blocked origin:', origin);
        callback(new Error(`CORS policy: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['X-Latest-Chunk', 'Content-Length'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Rate limiting — key by user ID from JWT so multiple users behind NAT aren't lumped together
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const d = jwt.verify(token, JWT_SECRET);
                if (d?.id)
                    return d.id;
            }
            catch { }
        }
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
app.use(apiLimiter);
app.use('/auth', authLimiter);
// Strip /api prefix from Vercel rewrite so routes match at root
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        req.url = req.url.slice(4);
    }
    next();
});
// Resolve tenant from subdomain on every request
app.use(resolveTenant);
// Request logging
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});
// Tenant lookup (matches Vercel API)
app.get('/tenant', (req, res) => {
    if (!req.tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
    }
    res.json({ tenant: req.tenant });
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
app.use('/broadcasts', cacheMiddleware(30000), broadcastRoutes);
app.use('/sermons', cacheMiddleware(60000), sermonRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/chat', chatRoutes);
app.use('/status', cacheMiddleware(60000), statusRoutes);
app.use('/guest-speakers', cacheMiddleware(60000), guestSpeakerRoutes);
app.use('/prayer', cacheMiddleware(30000), prayerRoutes);
app.use('/events', cacheMiddleware(60000), eventRoutes);
app.use('/donations', donationRoutes);
app.use('/testimonies', testimonyRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/search', cacheMiddleware(30000), searchRoutes);
app.use('/relay', relayRoutes);
app.use('/stream', streamRoutes);
app.use('/push', pushRoutes);
app.use('/radio', radioRoutes);
app.use('/radio-schedules', radioScheduleRoutes);
app.use('/playlists', playlistRoutes);
app.use('/music', musicRoutes);
app.use('/tenants', tenantRoutes);
app.use('/license-plans', licensePlanRoutes);
// HLS live stream serving
const HLS_ROOT = process.env.HLS_DIR || '/tmp/hls';
app.use('/live', (req, res, next) => {
    // req.path starts with '/' (e.g. '/abc123/stream.m3u8'); strip it so path.join works
    const relativePath = req.path.replace(/^\//, '');
    const filePath = path.join(HLS_ROOT, relativePath);
    console.log(`[HLS] serve ${req.path} → ${filePath} (exists=${fs.existsSync(filePath)})`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!filePath.startsWith(HLS_ROOT)) {
        res.status(403).end();
        return;
    }
    if (!fs.existsSync(filePath)) {
        res.status(404).end();
        return;
    }
    // Set correct MIME types and CORS
    if (req.path.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    else if (req.path.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/MP2T');
        res.setHeader('Cache-Control', 'public, max-age=2');
    }
    res.sendFile(filePath);
});
// Sentry error handler (must be before 404)
if (process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler());
}
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