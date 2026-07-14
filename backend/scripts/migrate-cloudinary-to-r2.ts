import 'dotenv/config'
import { v2 as cloudinary } from 'cloudinary'
import { execSync } from 'child_process'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { db } from '../src/db.js'
import { getPresignedUploadUrl, r2Configured } from '../src/lib/r2.js'
import { v4 as uuidv4 } from 'uuid'

function parseCloudinaryUrl(): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const url = process.env.CLOUDINARY_URL || ''
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
  if (!match) return null
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] }
}

function configureCloudinary() {
  const cfg = parseCloudinaryUrl()
  if (!cfg) throw new Error('CLOUDINARY_URL not configured')
  cloudinary.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret })
  return cfg
}

function isCloudinaryUrl(url: string): boolean {
  return typeof url === 'string' && url.includes('res.cloudinary.com')
}

function getResourceType(url: string): 'image' | 'video' | 'raw' {
  const path = new URL(url).pathname
  if (path.includes('/image/upload/')) return 'image'
  if (path.includes('/raw/upload/')) return 'raw'
  return 'video'
}

function extractPublicId(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const match = path.match(/\/(?:image|video|raw)\/upload(?:\/v\d+)?\/(.+)$/)
    if (!match) return null
    return match[1].replace(/\.[^.]+$/, '')
  } catch {
    return null
  }
}

function folderForUrl(url: string, column: string): string {
  const path = new URL(url).pathname
  if (column === 'audio_url') return path.includes('sermons') ? 'zionite/sermons/audio' : 'zionite/music/audio'
  if (column === 'cover_url') return 'zionite/music/covers'
  if (column === 'thumbnail_url') return path.includes('sermons') ? 'zionite/sermons/thumbnails' : 'zionite/thumbnails'
  if (column === 'image_url') return 'events'
  if (column === 'photo_url') return 'guest_speakers'
  return 'zionite'
}

async function fetchFile(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer: Buffer.from(arrayBuffer), contentType }
}

async function uploadViaCurl(buffer: Buffer, folder: string, contentType: string): Promise<string> {
  const ext = contentType.split('/')[1]?.split(';')[0] || 'bin'
  const { uploadUrl, publicUrl } = await getPresignedUploadUrl(folder, contentType, ext)
  const tmpFile = path.join(os.tmpdir(), `migrate-${uuidv4()}.tmp`)
  fs.writeFileSync(tmpFile, buffer)
  try {
    execSync(
      `curl -s -f -X PUT -H "Content-Type: ${contentType}" --data-binary @${tmpFile} "${uploadUrl}"`,
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } finally {
    fs.unlinkSync(tmpFile)
  }
  return publicUrl
}

interface MigrationConfig {
  table: string
  columns: string[]
  extraWhere?: string
}

const MIGRATION_CONFIG: MigrationConfig[] = [
  { table: 'music', columns: ['audio_url', 'cover_url'] },
  { table: 'sermons', columns: ['audio_url', 'thumbnail_url'] },
  { table: 'events', columns: ['image_url'] },
  { table: 'guest_speakers', columns: ['photo_url'] },
]

interface FailureRecord {
  table: string
  column: string
  id: string
  url: string
  error: string
}

interface Report {
  migrated: number
  failed: FailureRecord[]
  deleted: number
}

async function migrateRecord(
  table: string,
  id: string,
  column: string,
  url: string,
  report: Report,
  deleteAfter: boolean
) {
  try {
    console.log(`[MIGRATE] ${table}.${column} id=${id}`)
    const { buffer, contentType } = await fetchFile(url)
    const folder = folderForUrl(url, column)
    const newUrl = await uploadViaCurl(buffer, folder, contentType)

    await db.run(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [newUrl, id])
    report.migrated++
    console.log(`[MIGRATE] -> ${newUrl}`)

    if (deleteAfter) {
      const publicId = extractPublicId(url)
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: getResourceType(url) })
          report.deleted++
          console.log(`[MIGRATE] deleted Cloudinary asset ${publicId}`)
        } catch (delErr: any) {
          console.warn(`[MIGRATE] failed to delete Cloudinary asset ${publicId}:`, delErr.message)
        }
      }
    }
  } catch (err: any) {
    console.error(`[MIGRATE] failed ${table}.${column} id=${id}:`, err.message)
    report.failed.push({ table, column, id, url, error: err.message })
  }
}

async function migrateTable(config: MigrationConfig, limit: number, report: Report, deleteAfter: boolean) {
  let processed = 0
  for (const column of config.columns) {
    const rows = await db.all<{ id: string; [key: string]: any }>(
      `SELECT id, ${column} FROM ${config.table} WHERE ${column} IS NOT NULL AND ${column} <> ''`,
      []
    )
    for (const row of rows) {
      const url = row[column]
      if (!isCloudinaryUrl(url)) continue
      if (limit > 0 && processed >= limit) return
      await migrateRecord(config.table, row.id, column, url, report, deleteAfter)
      processed++
    }
  }
}

async function run() {
  if (!r2Configured) throw new Error('R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not configured.')
  const cfg = configureCloudinary()
  console.log('[MIGRATE] Cloudinary cloud_name:', cfg.cloudName)
  console.log('[MIGRATE] R2 bucket:', process.env.R2_BUCKET || 'zionite')

  const args = process.argv.slice(2)
  const tableArg = args.find(a => a.startsWith('--table='))?.split('=')[1] || 'all'
  const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
  const deleteAfter = args.includes('--delete-after')

  const limit = Number.isNaN(limitArg) ? 0 : limitArg
  const configs = tableArg === 'all' ? MIGRATION_CONFIG : MIGRATION_CONFIG.filter(c => c.table === tableArg)
  if (configs.length === 0) throw new Error(`Unknown table: ${tableArg}`)

  const report: Report = { migrated: 0, failed: [], deleted: 0 }
  for (const config of configs) {
    console.log(`[MIGRATE] table=${config.table} columns=${config.columns.join(',')}`)
    await migrateTable(config, limit, report, deleteAfter)
  }

  console.log('\n=== MIGRATION REPORT ===')
  console.log('Migrated:', report.migrated)
  console.log('Deleted:', report.deleted)
  console.log('Failed:', report.failed.length)
  if (report.failed.length) {
    console.log('Failures:')
    for (const f of report.failed) {
      console.log(`  - ${f.table}.${f.column} id=${f.id} url=${f.url} error=${f.error}`)
    }
  }
  if (report.failed.length > 0) process.exit(1)
}

run().catch(err => {
  console.error('[MIGRATE] fatal:', err.message)
  process.exit(1)
})
