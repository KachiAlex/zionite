import type { Request, Response, NextFunction } from 'express'
import sharp from 'sharp'

export async function optimizeImage(req: Request, res: Response, next: NextFunction) {
  if (!req.file || !req.file.buffer) { next(); return }

  try {
    const optimized = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer()

    req.file.buffer = optimized
    req.file.mimetype = 'image/jpeg'
    req.file.originalname = req.file.originalname.replace(/\.[^.]+$/, '.jpg')
    next()
  } catch (err) {
    console.error('[IMAGE] optimization failed:', err)
    next()
  }
}
