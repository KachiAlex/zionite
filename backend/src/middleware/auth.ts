import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { db, initDb } from '../db.js'

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    role: string
    tenantId?: string
  }
  tenant?: { id: string; slug: string; name: string; primary_color: string; logo_url?: string; custom_domain?: string; plan: string; status: string }
  tenantId?: string
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
    // Set tenantId from JWT token for mobile app requests
    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId
    }
    console.log('[AUTH] authenticated user:', { id: decoded.id, email: decoded.email, role: decoded.role, tenantId: req.tenantId })
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

// Resolve tenant from subdomain
export async function resolveTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await initDb()
  const host = req.headers.host || ''
  const parts = host.split(':')[0].split('.')
  let slug = 'zionite'
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'app') {
    slug = parts[0]
  } else if (parts.length === 2 && parts[0] !== 'zionite' && parts[0] !== 'www' && parts[0] !== 'app') {
    slug = parts[0]
  }
  try {
    const tenant = await db.get('SELECT id, slug, name, description, logo_url, primary_color, custom_domain, plan, status FROM tenants WHERE slug=$1', [slug])
    if (tenant) {
      req.tenant = tenant
      req.tenantId = tenant.id
    } else {
      const fallback = await db.get('SELECT id, slug, name, description, logo_url, primary_color, custom_domain, plan, status FROM tenants WHERE slug=$1', ['zionite'])
      req.tenant = fallback || undefined
      req.tenantId = fallback?.id
    }
  } catch {
    req.tenant = undefined
    req.tenantId = undefined
  }
  next()
}
