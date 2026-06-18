import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { authenticateToken, requireRole } from '../middleware/auth'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const uploadDir = './uploads/sermons'
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
} catch {
  // Vercel serverless has read-only filesystem; uploads won't persist
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`
    cb(null, unique)
  },
})

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } })

const router = Router()

router.get('/', async (_req, res) => {
  const db = await getDb()
  const sermons = await db.all('SELECT * FROM sermons ORDER BY date DESC')
  res.json({ sermons })
})

router.get('/series/list', async (_req, res) => {
  const db = await getDb()
  const series = await db.all(
    "SELECT DISTINCT series, COUNT(*) as count FROM sermons WHERE series != '' GROUP BY series ORDER BY series"
  )
  res.json({ series })
})

router.get('/series/:name', async (req, res) => {
  const db = await getDb()
  const sermons = await db.all(
    'SELECT * FROM sermons WHERE series = $1 ORDER BY date DESC',
    [req.params.name]
  )
  res.json({ sermons })
})

router.get('/stats/overview', async (_req, res) => {
  const db = await getDb()
  const totalSermons = await db.get('SELECT COUNT(*) as count FROM sermons')
  const totalSeries = await db.get("SELECT COUNT(DISTINCT series) as count FROM sermons WHERE series != ''")
  const totalSpeakers = await db.get("SELECT COUNT(DISTINCT speaker) as count FROM sermons WHERE speaker != ''")
  res.json({
    totalSermons: totalSermons?.count || 0,
    totalSeries: totalSeries?.count || 0,
    totalSpeakers: totalSpeakers?.count || 0
  })
})

router.get('/:id', async (req, res) => {
  const db = await getDb()
  const sermon = await db.get('SELECT * FROM sermons WHERE id = $1', [req.params.id])
  if (!sermon) {
    res.status(404).json({ error: 'Sermon not found' })
    return
  }
  res.json({ sermon })
})

router.post(
  '/',
  authenticateToken,
  requireRole('broadcaster', 'admin'),
  upload.single('audio'),
  async (req, res) => {
    const { title, description, scripture_reference, speaker, series, date, duration } = req.body
    if (!title || !date) {
      res.status(400).json({ error: 'Title and date are required' })
      return
    }

    const audioUrl = req.file ? `/uploads/sermons/${req.file.filename}` : null
    if (!audioUrl) {
      res.status(400).json({ error: 'Audio file is required' })
      return
    }

    const db = await getDb()
    const id = uuidv4()
    await db.run(
      'INSERT INTO sermons (id, title, description, scripture_reference, speaker, series, audio_url, date, duration) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, title, description || '', scripture_reference || '', speaker || '', series || '', audioUrl, date, duration || 0]
    )

    const sermon = await db.get('SELECT * FROM sermons WHERE id = $1', [id])
    res.status(201).json({ sermon })
  }
)

export default router
