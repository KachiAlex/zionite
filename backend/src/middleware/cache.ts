import type { Request, Response, NextFunction } from 'express'

const cache = new Map<string, { data: any; expiry: number }>()

export function cacheMiddleware(durationMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') { next(); return }
    const key = req.originalUrl || req.url
    const hit = cache.get(key)
    if (hit && Date.now() < hit.expiry) {
      res.json(hit.data)
      return
    }
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      cache.set(key, { data: body, expiry: Date.now() + durationMs })
      return originalJson(body)
    }
    next()
  }
}

export function clearCache() {
  cache.clear()
}
