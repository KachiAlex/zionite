import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { db, initDb } from '../db.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

const PLAN_DEFAULTS: Record<string, { max_users: number; max_storage_gb: number; max_broadcasts: number; features: string[] }> = {
  free: {
    max_users: 1,
    max_storage_gb: 5,
    max_broadcasts: 2,
    features: ['sermons', 'music', 'prayer', 'events']
  },
  basic: {
    max_users: 3,
    max_storage_gb: 50,
    max_broadcasts: 20,
    features: ['sermons', 'music', 'livestream', 'broadcast', 'events', 'prayer', 'testimonies', 'donations']
  },
  pro: {
    max_users: 10,
    max_storage_gb: 200,
    max_broadcasts: 100,
    features: ['sermons', 'music', 'livestream', 'broadcast', 'radio', 'events', 'prayer', 'testimonies', 'donations', 'analytics', 'custom_domain']
  },
  enterprise: {
    max_users: 1000,
    max_storage_gb: 2000,
    max_broadcasts: 1000,
    features: ['sermons', 'music', 'livestream', 'broadcast', 'radio', 'events', 'prayer', 'testimonies', 'donations', 'analytics', 'custom_domain', 'api_access', 'white_label']
  }
}

function serializeLicense(row: any) {
  if (!row) return null
  return {
    ...row,
    features: row.features ? JSON.parse(row.features) : []
  }
}

router.get('/', authenticateToken, requireRole('super_admin'), async (_req, res) => {
  try {
    await initDb()
    const result = await db.query(`
      SELECT t.id, t.slug, t.name, t.description, t.logo_url, t.primary_color, t.custom_domain, t.plan, t.status, t.created_at,
             l.id as license_id, l.plan as license_plan, l.status as license_status, l.starts_at, l.expires_at, l.trial_ends_at,
             l.billing_period, l.max_users, l.max_storage_gb, l.max_broadcasts, l.features
      FROM tenants t
      LEFT JOIN tenant_licenses l ON l.tenant_id = t.id
      ORDER BY t.created_at DESC
    `)
    const tenants = result.rows.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      logo_url: r.logo_url,
      primary_color: r.primary_color,
      custom_domain: r.custom_domain,
      plan: r.plan,
      status: r.status,
      created_at: r.created_at,
      license: serializeLicense({
        id: r.license_id,
        plan: r.license_plan,
        status: r.license_status,
        starts_at: r.starts_at,
        expires_at: r.expires_at,
        trial_ends_at: r.trial_ends_at,
        billing_period: r.billing_period,
        max_users: r.max_users,
        max_storage_gb: r.max_storage_gb,
        max_broadcasts: r.max_broadcasts,
        features: r.features
      })
    }))
    res.json({ tenants })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const { slug, name, description, primary_color, custom_domain, plan = 'free' } = req.body
    if (!slug || !name) { res.status(400).json({ error: 'slug and name required' }); return }
    const existing = await db.get('SELECT id FROM tenants WHERE slug=$1', [slug])
    if (existing) { res.status(409).json({ error: 'Slug already taken' }); return }

    const id = uuidv4()
    await db.query(`INSERT INTO tenants (id, slug, name, description, primary_color, custom_domain, plan, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, slug, name, description || null, primary_color || '#c9a227', custom_domain || null, plan, 'active'])

    const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free
    const licenseId = uuidv4()
    await db.query(`INSERT INTO tenant_licenses (id, tenant_id, plan, status, max_users, max_storage_gb, max_broadcasts, features) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [licenseId, id, plan, 'active', defaults.max_users, defaults.max_storage_gb, defaults.max_broadcasts, JSON.stringify(defaults.features)])

    res.status(201).json({ tenant: { id, slug, name, license: { id: licenseId, plan: plan, status: 'active' } } })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:id', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const { name, description, primary_color, custom_domain, plan, status, logo_url } = req.body
    await db.query(`UPDATE tenants SET name=$1, description=$2, primary_color=$3, custom_domain=$4, plan=$5, status=$6, logo_url=$7 WHERE id=$8`,
      [name, description, primary_color, custom_domain, plan, status, logo_url, req.params.id])
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/:id/license', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const tenantId = req.params.id
    const { plan, status, starts_at, expires_at, trial_ends_at, billing_period, max_users, max_storage_gb, max_broadcasts, features } = req.body

    const tenant = await db.get('SELECT id FROM tenants WHERE id=$1', [tenantId])
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return }

    const license = await db.get('SELECT id FROM tenant_licenses WHERE tenant_id=$1', [tenantId])
    const defaults = plan ? PLAN_DEFAULTS[plan] : null
    const finalPlan = plan || license?.plan || 'free'
    const finalFeatures = features ? JSON.stringify(features) : (defaults ? JSON.stringify(defaults.features) : null)

    if (license) {
      await db.query(`UPDATE tenant_licenses SET
        plan=COALESCE($1, plan),
        status=COALESCE($2, status),
        starts_at=COALESCE($3, starts_at),
        expires_at=COALESCE($4, expires_at),
        trial_ends_at=COALESCE($5, trial_ends_at),
        billing_period=COALESCE($6, billing_period),
        max_users=COALESCE($7, max_users),
        max_storage_gb=COALESCE($8, max_storage_gb),
        max_broadcasts=COALESCE($9, max_broadcasts),
        features=COALESCE($10, features),
        updated_at=NOW()
      WHERE id=$11`, [
        finalPlan, status, starts_at || null, expires_at || null, trial_ends_at || null,
        billing_period || null, max_users ?? null, max_storage_gb ?? null, max_broadcasts ?? null,
        finalFeatures, license.id
      ])
    } else {
      const licenseId = uuidv4()
      const defaultsToUse = PLAN_DEFAULTS[finalPlan] || PLAN_DEFAULTS.free
      await db.query(`INSERT INTO tenant_licenses (id, tenant_id, plan, status, starts_at, expires_at, trial_ends_at, billing_period, max_users, max_storage_gb, max_broadcasts, features)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [licenseId, tenantId, finalPlan, status || 'active', starts_at || null, expires_at || null, trial_ends_at || null,
         billing_period || null, max_users ?? defaultsToUse.max_users, max_storage_gb ?? defaultsToUse.max_storage_gb,
         max_broadcasts ?? defaultsToUse.max_broadcasts, finalFeatures || JSON.stringify(defaultsToUse.features)])
    }

    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:id/owner', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    await initDb()
    const tenantId = req.params.id
    const { email, password, name } = req.body
    if (!email || !password || !name) { res.status(400).json({ error: 'email, password and name required' }); return }

    const existing = await db.get('SELECT id FROM users WHERE email=$1', [email])
    if (existing) { res.status(409).json({ error: 'Email already registered' }); return }

    const hash = await bcrypt.hash(password, 10)
    const id = uuidv4()
    await db.query(`INSERT INTO users (id, email, password_hash, name, role, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, email, hash, name, 'admin', tenantId])

    res.status(201).json({ user: { id, email, name, role: 'admin', tenant_id: tenantId } })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
