"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const auth_1 = __importDefault(require("./routes/auth"));
const broadcasts_1 = __importDefault(require("./routes/broadcasts"));
const sermons_1 = __importDefault(require("./routes/sermons"));
const status_1 = __importDefault(require("./routes/status"));
const chat_1 = __importDefault(require("./routes/chat"));
const prayer_1 = __importDefault(require("./routes/prayer"));
const schedule_1 = __importDefault(require("./routes/schedule"));
const app = (0, express_1.default)();
// Vercel rewrites /api/* to this function; strip /api so routes match
app.use((req, res, next) => {
    const originalUrl = req.url;
    const originalPath = req.path;
    if (req.url.startsWith('/api/')) {
        req.url = req.url.slice(4);
    }
    else if (req.url === '/api') {
        req.url = '/';
    }
    console.log(`[REQ] ${req.method} original=${originalUrl} path=${originalPath} stripped=${req.url}`);
    res.on('finish', () => {
        console.log(`[RES] ${req.method} ${req.url} → ${res.statusCode}`);
    });
    next();
});
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// Mount all API routes at root (Vercel will add /api prefix)
app.use('/auth', auth_1.default);
app.use('/broadcasts', broadcasts_1.default);
app.use('/sermons', sermons_1.default);
app.use('/status', status_1.default);
app.use('/chat', chat_1.default);
app.use('/prayer', prayer_1.default);
app.use('/schedule', schedule_1.default);
// Debug endpoint (no auth needed)
app.get('/debug', (_req, res) => {
    const router = app._router;
    res.json({
        env: {
            nodeEnv: process.env.NODE_ENV,
            vercel: process.env.VERCEL,
            dbUrlPresent: !!process.env.DATABASE_URL,
        },
        routes: router?.stack?.map((layer) => ({
            route: layer.route?.path,
            name: layer.name,
        })) || 'unavailable',
        time: new Date().toISOString(),
    });
});
// Health check
app.get('/', (_req, res) => {
    res.json({ status: 'API is running' });
});
// DB health check
app.get('/health', async (_req, res) => {
    try {
        const { initDb } = await Promise.resolve().then(() => __importStar(require('./db')));
        await initDb();
        const result = await db_1.db.get('SELECT NOW() as now');
        res.json({ status: 'ok', db: 'connected', now: result?.now });
    }
    catch (err) {
        console.error('Health check failed:', err?.message || err);
        res.status(500).json({ status: 'error', db: 'disconnected', error: err?.message || String(err) });
    }
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    const message = typeof err === 'string' ? err : (err?.message || 'Internal Server Error');
    res.status(err.status || 500).json({
        error: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
// Routes call initDb() themselves before querying
// Export for Vercel serverless
const serverless_http_1 = __importDefault(require("serverless-http"));
exports.default = (0, serverless_http_1.default)(app);
// Local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
//# sourceMappingURL=index.js.map