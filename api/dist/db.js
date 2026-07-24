import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
const rawDbUrl = process.env.DATABASE_URL?.trim();
const dbUrl = rawDbUrl?.startsWith('psql ') ? rawDbUrl.slice(5) : rawDbUrl;
console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] VERCEL:', process.env.VERCEL || 'undefined');
console.log('[DB] DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('[DB] dbUrl present:', !!dbUrl);
export let dbReady = !!dbUrl;
let _sqlInitError = null;
let _sql = null;
function getSql() {
    if (_sql)
        return _sql;
    if (!dbReady)
        throw new Error('DATABASE_URL not configured');
    try {
        const u = new URL(dbUrl);
        console.log(`[DB] host: ${u.hostname}, protocol: ${u.protocol}, pathname: ${u.pathname}`);
        _sql = neon(dbUrl);
        console.log('[DB] neon client created OK');
        return _sql;
    }
    catch (e) {
        console.error('[DB] Failed to create neon client:', e?.message || e);
        _sqlInitError = e?.message || String(e);
        dbReady = false;
        throw new Error('Failed to create database client: ' + _sqlInitError);
    }
}
async function queryWithRetry(sqlStr, params, retries = 3) {
    if (!dbReady)
        throw new Error('DATABASE_URL not configured');
    const sql = getSql();
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return (await sql.query(sqlStr, params));
        }
        catch (err) {
            const isLast = attempt === retries;
            console.warn(`[DB] query failed (attempt ${attempt}/${retries}):`, err?.message || err);
            if (isLast)
                throw err;
            await new Promise(r => setTimeout(r, 300 * attempt));
        }
    }
    throw new Error('DB query failed after retries');
}
export const db = {
    async query(sqlStr, params) {
        const rows = await queryWithRetry(sqlStr, params);
        return { rows: rows, rowCount: rows.length };
    },
    async get(sqlStr, params) {
        const rows = await queryWithRetry(sqlStr, params);
        return rows[0];
    },
    async all(sqlStr, params) {
        const rows = await queryWithRetry(sqlStr, params);
        return rows;
    },
    async run(sqlStr, params) {
        const rows = await queryWithRetry(sqlStr, params);
        return { lastID: 0, changes: rows.length };
    }
};
/** Fire-and-forget DB write that never throws — use for non-critical writes like chunk persistence */
export async function dbWriteSafe(sqlStr, params) {
    try {
        await queryWithRetry(sqlStr, params, 2);
    }
    catch (err) {
        console.warn('[DB] safe write failed (non-critical):', err?.message || err);
    }
}
export async function getDb() {
    return db;
}
const SCHEMA_QUERIES = [
    `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'listener', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled', started_at TIMESTAMP, ended_at TIMESTAMP,
    broadcaster_id TEXT NOT NULL, audio_path TEXT, stream_key TEXT, stream_type TEXT DEFAULT 'church_online',
    church_online_url TEXT, thumbnail_url TEXT, speaker TEXT, init_segment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS init_segment TEXT`,
    `CREATE TABLE IF NOT EXISTS sermons (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, scripture_reference TEXT,
    speaker TEXT, series TEXT, audio_url TEXT, video_url TEXT, thumbnail_url TEXT, date TEXT NOT NULL, duration INTEGER,
    is_featured BOOLEAN DEFAULT FALSE, play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `ALTER TABLE sermons ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, broadcast_id TEXT, user_id TEXT, user_name TEXT,
    recipient_id TEXT, guest_name TEXT, message TEXT NOT NULL, is_private BOOLEAN DEFAULT FALSE, reactions TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions TEXT`,
    `CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, day_of_week INTEGER NOT NULL,
    time TEXT NOT NULL, type TEXT DEFAULT 'service', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS guest_speakers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT, photo_url TEXT,
    topic TEXT, date TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS prayer_requests (
    id TEXT PRIMARY KEY, name TEXT, request TEXT NOT NULL, is_anonymous BOOLEAN DEFAULT FALSE,
    prayers_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, date TEXT,
    time TEXT, location TEXT, image_url TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS featured_sermons (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL UNIQUE, display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY, sermon_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT, album TEXT, genre TEXT,
    audio_url TEXT NOT NULL, cover_url TEXT, duration INTEGER, lyrics TEXT,
    file_format TEXT, file_size INTEGER, play_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `ALTER TABLE music ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS music_plays (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    user_id TEXT,
    session_id TEXT,
    duration_played INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    platform TEXT DEFAULT 'web',
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE INDEX IF NOT EXISTS idx_music_plays_track ON music_plays (track_id)`,
    `CREATE INDEX IF NOT EXISTS idx_music_plays_played_at ON music_plays (played_at)`,
    `CREATE TABLE IF NOT EXISTS music_share_clicks (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL,
    referrer TEXT,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE INDEX IF NOT EXISTS idx_music_share_clicks_track ON music_share_clicks (track_id)`,
    `ALTER TABLE radio_state ADD COLUMN IF NOT EXISTS manual_stop BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE radio_state ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT FALSE`,
    `CREATE TABLE IF NOT EXISTS stream_chunks (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    chunk_data TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `DELETE FROM stream_chunks WHERE id NOT IN (SELECT MIN(id) FROM stream_chunks GROUP BY broadcast_id, chunk_index)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_chunks_broadcast_chunk ON stream_chunks (broadcast_id, chunk_index)`,
    `CREATE TABLE IF NOT EXISTS stream_listeners (
    id TEXT PRIMARY KEY, broadcast_id TEXT NOT NULL, session_id TEXT NOT NULL,
    platform TEXT DEFAULT 'web', last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip TEXT, country TEXT, region TEXT, city TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, amount NUMERIC NOT NULL,
    message TEXT, is_anonymous BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS testimonies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, content TEXT NOT NULL,
    status TEXT DEFAULT 'pending', is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, goal_amount NUMERIC NOT NULL,
    current_amount NUMERIC DEFAULT 0, end_date TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    user_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS fcm_tokens (
    id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, user_id TEXT, platform TEXT DEFAULT 'android',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL, counter INTEGER DEFAULT 0, device_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS daily_verses (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, reference TEXT, type TEXT DEFAULT 'verse',
    created_by TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY,
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    live_broadcast_push BOOLEAN DEFAULT TRUE,
    live_broadcast_email BOOLEAN DEFAULT TRUE,
    sermon_radio_push BOOLEAN DEFAULT TRUE,
    sermon_radio_email BOOLEAN DEFAULT TRUE,
    daily_verse_push BOOLEAN DEFAULT TRUE,
    daily_verse_email BOOLEAN DEFAULT TRUE,
    events_push BOOLEAN DEFAULT TRUE,
    events_email BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS live_broadcast_push BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS live_broadcast_email BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sermon_radio_push BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sermon_radio_email BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS daily_verse_push BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS daily_verse_email BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS events_push BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS events_email BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `CREATE TABLE IF NOT EXISTS notification_log (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    push_count INTEGER DEFAULT 0,
    email_count INTEGER DEFAULT 0,
    fcm_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS notification_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
    `CREATE TABLE IF NOT EXISTS soundtracks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration INTEGER DEFAULT 0,
    file_format TEXT,
    file_size INTEGER,
    uploaded_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
];
// ── Multi-tenant schema ────────────────────────────────────────
async function _initTenantSchema() {
    await db.query(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#c9a227',
    custom_domain TEXT,
    plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
    const tablesNeedingTenant = [
        'users', 'broadcasts', 'sermons', 'chat_messages', 'schedule', 'music',
        'stream_chunks', 'stream_listeners', 'featured_sermons', 'transcripts',
        'guest_speakers', 'donations', 'prayer_requests', 'prayer_interactions',
        'events', 'event_rsvps', 'testimonies', 'campaigns', 'newsletter_subscribers',
        'push_subscriptions', 'webauthn_credentials', 'fcm_tokens',
        'notification_preferences', 'notification_log', 'notification_queue', 'spiritual_health',
        'playlists', 'playlist_items', 'radio_schedules', 'radio_state', 'daily_verses',
        'music_plays', 'music_share_clicks'
    ];
    for (const tbl of tablesNeedingTenant) {
        try {
            await db.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
        }
        catch { }
    }
    const defaultTenant = await db.get(`SELECT * FROM tenants WHERE slug=$1`, ['zionite']);
    let defaultTenantId;
    if (!defaultTenant) {
        defaultTenantId = uuidv4();
        await db.query(`INSERT INTO tenants (id, slug, name, primary_color, plan, status) VALUES ($1,$2,$3,$4,$5,$6)`, [defaultTenantId, 'zionite', 'Zionite', '#c9a227', 'pro', 'active']);
    }
    else {
        defaultTenantId = defaultTenant.id;
    }
    for (const tbl of tablesNeedingTenant) {
        try {
            await db.query(`UPDATE ${tbl} SET tenant_id=$1 WHERE tenant_id IS NULL`, [defaultTenantId]);
        }
        catch { }
    }
    // Plan catalogue: reusable plan definitions managed by superadmin
    await db.query(`CREATE TABLE IF NOT EXISTS license_plans (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    max_users INTEGER,
    max_storage_gb INTEGER,
    max_broadcasts INTEGER,
    features TEXT,
    price_monthly INTEGER DEFAULT 0,
    price_yearly INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
    // Seed default plan catalogue if empty
    const existingPlan = await db.get('SELECT id FROM license_plans LIMIT 1');
    if (!existingPlan) {
        const plans = [
            { slug: 'free', name: 'Free', description: 'Single-admin starter plan for small ministries.', max_users: 1, max_storage_gb: 5, max_broadcasts: 2, features: ['sermons', 'music', 'prayer', 'events'], price_monthly: 0, price_yearly: 0 },
            { slug: 'basic', name: 'Basic', description: 'Small team plan with livestream and giving.', max_users: 3, max_storage_gb: 50, max_broadcasts: 20, features: ['sermons', 'music', 'livestream', 'broadcast', 'events', 'prayer', 'testimonies', 'donations'], price_monthly: 2900, price_yearly: 29000 },
            { slug: 'pro', name: 'Pro', description: 'Full-featured plan with radio, analytics and custom domain.', max_users: 10, max_storage_gb: 200, max_broadcasts: 100, features: ['sermons', 'music', 'livestream', 'broadcast', 'radio', 'events', 'prayer', 'testimonies', 'donations', 'analytics', 'custom_domain'], price_monthly: 7900, price_yearly: 79000 },
            { slug: 'enterprise', name: 'Enterprise', description: 'Unlimited white-label plan with API access and priority support.', max_users: 1000, max_storage_gb: 2000, max_broadcasts: 1000, features: ['sermons', 'music', 'livestream', 'broadcast', 'radio', 'events', 'prayer', 'testimonies', 'donations', 'analytics', 'custom_domain', 'api_access', 'white_label'], price_monthly: 24900, price_yearly: 249000 }
        ];
        for (const p of plans) {
            await db.query(`INSERT INTO license_plans (id, slug, name, description, max_users, max_storage_gb, max_broadcasts, features, price_monthly, price_yearly)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [uuidv4(), p.slug, p.name, p.description, p.max_users, p.max_storage_gb, p.max_broadcasts, JSON.stringify(p.features), p.price_monthly, p.price_yearly]);
        }
        console.log('[DB] license plans seeded');
    }
    // License table: one active license per tenant
    await db.query(`CREATE TABLE IF NOT EXISTS tenant_licenses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    trial_ends_at TIMESTAMP,
    billing_period TEXT DEFAULT 'monthly',
    max_users INTEGER,
    max_storage_gb INTEGER,
    max_broadcasts INTEGER,
    features TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
    // Seed a default pro license for the default tenant if none exists
    const defaultLicense = await db.get('SELECT id FROM tenant_licenses WHERE tenant_id=$1', [defaultTenantId]);
    if (!defaultLicense) {
        const defaultLicenseId = uuidv4();
        await db.query(`INSERT INTO tenant_licenses (id, tenant_id, plan, status, billing_period, max_users, max_storage_gb, max_broadcasts, features)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [defaultLicenseId, defaultTenantId, 'pro', 'active', 'lifetime', 1000, 200, 1000,
            JSON.stringify(['sermons', 'music', 'livestream', 'broadcast', 'radio', 'events', 'prayer', 'testimonies', 'donations', 'analytics', 'custom_domain', 'api_access'])]);
        console.log('[DB] default license seeded');
    }
    return defaultTenantId;
}
let _dbInitPromise = null;
let _dbInitDone = false;
export async function initDb() {
    if (_dbInitDone)
        return;
    if (_dbInitPromise)
        return _dbInitPromise;
    _dbInitPromise = _initDbInternal();
    return _dbInitPromise;
}
async function _initDbInternal() {
    console.log('[DB] init starting...');
    try {
        console.log('[DB] testing connection with SELECT 1...');
        await db.query('SELECT 1 as test');
        console.log('[DB] connection OK');
    }
    catch (e) {
        console.error('[DB] connection test failed:', e.message);
        throw e;
    }
    for (let i = 0; i < SCHEMA_QUERIES.length; i++) {
        await db.query(SCHEMA_QUERIES[i]);
    }
    console.log('[DB] schema OK');
    // Run structured migrations
    const { runMigrations } = await import('./migrations/runner.js');
    await runMigrations();
    // Initialize tenant schema (tables kept for compatibility but not used)
    await _initTenantSchema();
    console.log('[DB] tenant schema OK');
    const existingSchedule = await db.get('SELECT * FROM schedule LIMIT 1');
    if (!existingSchedule) {
        await db.run(`
      INSERT INTO schedule (id, title, day_of_week, time, type) VALUES
      ($1, 'Sunday Gathering', 0, '10:00', 'service'),
      ($2, 'Midweek Study', 3, '19:00', 'study'),
      ($3, 'Prayer Meeting', 5, '18:00', 'prayer')
    `, [uuidv4(), uuidv4(), uuidv4()]);
        console.log('[DB] schedule seeded');
    }
    const admin = await db.get('SELECT * FROM users WHERE role = $1', ['super_admin']);
    if (!admin) {
        try {
            const hash = await bcrypt.hash('admin123', 10);
            await db.run(`INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, ['admin-1', 'admin@zionite.online', hash, 'Admin User', 'super_admin']);
            console.log('[DB] admin seeded');
        }
        catch (e) {
            if (e.code === '23505') {
                console.log('[DB] admin already exists, skipping seed');
            }
            else {
                console.error('[DB] admin seed error:', e.message);
            }
        }
    }
    // Seed the requested superadmin account if it does not exist yet
    const requestedSuperadmin = await db.get('SELECT * FROM users WHERE email = $1', ['superadmin@zionite.online']);
    if (!requestedSuperadmin) {
        try {
            const hash = await bcrypt.hash('superadmin123', 10);
            await db.run(`INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`, ['superadmin-1', 'superadmin@zionite.online', hash, 'Super Admin', 'super_admin']);
            console.log('[DB] requested superadmin seeded');
        }
        catch (e) {
            if (e.code === '23505') {
                console.log('[DB] requested superadmin already exists, skipping seed');
            }
            else {
                console.error('[DB] requested superadmin seed error:', e.message);
            }
        }
    }
    console.log('[DB] init complete');
    _dbInitDone = true;
}
//# sourceMappingURL=db.js.map