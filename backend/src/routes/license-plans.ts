import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

function serializePlan(row: any) {
  if (!row) return null
  return {
    ...row,
    features: row.features ? JSON.parse(row.features) : []
  }
}

router.get('/', authenticateToken, requireRole('super_admin'), async (_req, res) => {
  try {
    await initDb()
    const result = await db.query('SELECT * FROM license_plans ORDER BY price_monthly ASC, name ASC')
    res.json({ plans: result.rows.map(serializePlan) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/:slug', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const row = await db.get('SELECT * FROM license_plans WHERE slug=$1', [req.params.slug])
    if (!row) { res.status(404).json({ error: 'Plan not found' }); return }
    res.json({ plan: serializePlan(row) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const { slug, name, description, max_users, max_storage_gb, max_broadcasts, features, price_monthly, price_yearly, is_active, is_public } = req.body
    if (!slug || !name) { res.status(400).json({ error: 'slug and name required' }); return }

    const existing = await db.get('SELECT id FROM license_plans WHERE slug=$1', [slug])
    if (existing) { res.status(409).json({ error: 'Plan slug already exists' }); return }

    const id = uuidv4()
    await db.query(
      `INSERT INTO license_plans (id, slug, name, description, max_users, max_storage_gb, max_broadcasts, features, price_monthly, price_yearly, is_active, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, slug, name, description || null, max_users ?? null, max_storage_gb ?? null, max_broadcasts ?? null,
       JSON.stringify(features || []), price_monthly ?? 0, price_yearly ?? 0, is_active ?? true, is_public ?? true]
    )
    res.status(201).json({ plan: { id, slug, name } })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:slug', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const { slug, name, description, max_users, max_storage_gb, max_broadcasts, features, price_monthly, price_yearly, is_active, is_public } = req.body
    const currentSlug = req.params.slug

    const existing = await db.get('SELECT id FROM license_plans WHERE slug=$1', [currentSlug])
    if (!existing) { res.status(404).json({ error: 'Plan not found' }); return }

    if (slug && slug !== currentSlug) {
      const conflict = await db.get('SELECT id FROM license_plans WHERE slug=$1 AND id != $2', [slug, existing.id])
      if (conflict) { res.status(409).json({ error: 'Plan slug already in use' }); return }
    }

    await db.query(
      `UPDATE license_plans SET
        slug=COALESCE($1, slug),
        name=COALESCE($2, name),
        description=COALESCE($3, description),
        max_users=COALESCE($4, max_users),
        max_storage_gb=COALESCE($5, max_storage_gb),
        max_broadcasts=COALESCE($6, max_broadcasts),
        features=COALESCE($7, features),
        price_monthly=COALESCE($8, price_monthly),
        price_yearly=COALESCE($9, price_yearly),
        is_active=COALESCE($10, is_active),
        is_public=COALESCE($11, is_public),
        updated_at=NOW()
      WHERE id=$12`,
      [slug || null, name || null, description || null, max_users ?? null, max_storage_gb ?? null, max_broadcasts ?? null,
       features ? JSON.stringify(features) : null, price_monthly ?? null, price_yearly ?? null, is_active ?? null, is_public ?? null, existing.id]
    )
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:slug', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const existing = await db.get('SELECT id FROM license_plans WHERE slug=$1', [req.params.slug])
    if (!existing) { res.status(404).json({ error: 'Plan not found' }); return }

    const inUse = await db.get('SELECT id FROM tenant_licenses WHERE plan=$1 LIMIT 1', [req.params.slug])
    if (inUse) { res.status(409).json({ error: 'Plan is in use by one or more tenants' }); return }

    await db.query('DELETE FROM license_plans WHERE id=$1', [existing.id])
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
