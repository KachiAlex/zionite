import { API_BASE } from './api'

export interface TagOptions {
  title: string
  artist?: string
  album?: string
  genre?: string
  year?: string
  comment?: string
  coverUrl?: string
  audioUrl: string
  filename?: string
}

function extractR2Key(url: string): string | null {
  try {
    const u = new URL(url)
    // Backend proxy: https://zionite.fly.dev/r2-files/{key}
    if (u.pathname.startsWith('/r2-files/')) {
      return u.pathname.replace(/^\/r2-files\//, '')
    }
    // Direct R2 public URL: https://pub-xxx.r2.dev/{key} or custom domain
    if (u.hostname.endsWith('.r2.dev') || u.hostname.endsWith('.cloudflarestorage.com')) {
      return u.pathname.replace(/^\//, '')
    }
    return null
  } catch {
    return null
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function downloadWithTags(opts: TagOptions): Promise<void> {
  const { title, audioUrl, filename: rawFilename } = opts
  const filename = rawFilename || `${title}.mp3`

  // Extract R2 key from the audio URL and route through the backend proxy
  // with ?download=filename to force Content-Disposition: attachment
  const r2Key = extractR2Key(audioUrl)
  if (r2Key) {
    const downloadUrl = `${API_BASE}/r2-files/${r2Key}?download=${encodeURIComponent(filename)}`
    triggerDownload(downloadUrl, filename)
    return
  }

  // Fallback: try a direct anchor download (works for same-origin or CORS-enabled URLs)
  triggerDownload(audioUrl, filename)
}

