import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET = process.env.R2_BUCKET || 'zionite'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '' // e.g. https://media.zionite.online

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
  // Fallback: serve through our backend proxy
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

  const ext = fileExtension || contentType.split('/')[1] || 'bin'
  const key = `${folder}/${uuidv4()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 })
  const publicUrl = getPublicUrl(key)

  return { uploadUrl, publicUrl, key }
}

export async function uploadBuffer(buffer: Buffer, folder: string, contentType: string): Promise<string> {
  if (!r2Configured) {
    throw new Error('R2 storage is not configured.')
  }

  const ext = contentType.split('/')[1] || 'bin'
  const key = `${folder}/${uuidv4()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })

  await getClient().send(command)
  return getPublicUrl(key)
}

export async function deleteFile(key: string): Promise<void> {
  if (!r2Configured) return

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  })

  await getClient().send(command)
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    // If using R2_PUBLIC_URL, the key is the pathname without leading /
    const key = u.pathname.replace(/^\//, '')
    return key || null
  } catch {
    return null
  }
}
