import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    res.status(401).json({ error: 'Access token required' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.user = decoded
    console.log('[AUTH] authenticated user:', { id: decoded.id, email: decoded.email, role: decoded.role })
    next()
  } catch (err: any) {
    console.error('[AUTH] token verification failed:', err.message)
    res.status(403).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (req.user.role === 'super_admin') { next(); return }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}
