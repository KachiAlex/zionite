import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET = process.env.R2_BUCKET || 'zionite'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''
const R2_WORKER_URL = process.env.R2_WORKER_URL || 'https://r2-upload-worker.zionite-r2.workers.dev'

export const r2Configured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)

let client: S3Client | null = null

export function getClient(): S3Client {
  if (client) return client
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return client
}

export function getPublicUrl(key: string): string {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`
  }
  return `https://zionite.fly.dev/r2-files/${key}`
}

export async function getPresignedUploadUrl(folder: string, contentType: string, fileExtension?: string): Promise<{
  uploadUrl: string
  publicUrl: string
  key: string
}> {
  if (!r2Configured) {
    throw new Error('R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY env vars.')
  }

  const ext = fileExtension || contentType.split('/')[1]?.split(';')[0] || 'bin'
  const key = `${folder}/${uuidv4()}.${ext}`
  const uploadUrl = `${R2_WORKER_URL}/upload/${key}`
  const publicUrl = getPublicUrl(key)

  return { uploadUrl, publicUrl, key }
}

export async function uploadBuffer(buffer: Buffer, folder: string, contentType: string): Promise<string> {
  if (!r2Configured) {
    throw new Error('R2 storage is not configured.')
  }

  const ext = contentType.split('/')[1]?.split(';')[0] || 'bin'
  const key = `${folder}/${uuidv4()}.${ext}`

  const res = await fetch(`${R2_WORKER_URL}/upload/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(buffer),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error')
    throw new Error(`R2 upload failed: ${err}`)
  }

  return getPublicUrl(key)
}

export async function deleteFile(key: string): Promise<void> {
  if (!r2Configured) return

  try {
    const res = await fetch(`${R2_WORKER_URL}/delete/${key}`, { method: 'DELETE' })
    if (!res.ok) {
      throw new Error(`R2 delete failed: ${res.status}`)
    }
  } catch (workerErr) {
    // Fallback to S3 API for delete (deletes are less critical, can retry)
    const command = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })
    await getClient().send(command)
  }
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const key = u.pathname.replace(/^\//, '')
    return key || null
  } catch {
    return null
  }
}
