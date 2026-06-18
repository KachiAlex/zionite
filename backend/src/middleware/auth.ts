import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

if (!JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set. Using fallback - INSECURE for production!')
}
if (!JWT_REFRESH_SECRET) {
  console.warn('WARNING: JWT_REFRESH_SECRET not set. Using fallback - INSECURE for production!')
}

const secret = JWT_SECRET || 'fallback-jwt-secret-change-me-immediately'
const refreshSecret = JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-me-immediately'

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string }
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    res.status(401).json({ error: 'Access token required' })
    return
  }

  try {
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string }
    req.user = decoded
    next()
  } catch {
    res.status(403).json({ error: 'Invalid token' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}

export { secret as JWT_SECRET, refreshSecret as JWT_REFRESH_SECRET }
