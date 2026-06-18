"use strict";
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
// Health check
app.get('/', (_req, res) => {
    res.json({ status: 'API is running' });
});
// DB health check
app.get('/health', async (_req, res) => {
    try {
        const result = await db_1.db.get('SELECT NOW() as now');
        res.json({ status: 'ok', db: 'connected', now: result?.now });
    }
    catch (err) {
        console.error('Health check failed:', err?.message);
        res.status(500).json({ status: 'error', db: 'disconnected', error: err?.message });
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
// Initialize database lazily — don't block Vercel cold start
(0, db_1.initDb)().catch(err => console.error('DB init failed (non-blocking):', err?.message || err));
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