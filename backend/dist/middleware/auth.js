"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_REFRESH_SECRET = exports.JWT_SECRET = void 0;
exports.authenticateToken = authenticateToken;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET not set. Using fallback - INSECURE for production!');
}
if (!JWT_REFRESH_SECRET) {
    console.warn('WARNING: JWT_REFRESH_SECRET not set. Using fallback - INSECURE for production!');
}
const secret = JWT_SECRET || 'fallback-jwt-secret-change-me-immediately';
exports.JWT_SECRET = secret;
const refreshSecret = JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-me-immediately';
exports.JWT_REFRESH_SECRET = refreshSecret;
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.user = decoded;
        next();
    }
    catch {
        res.status(403).json({ error: 'Invalid token' });
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map