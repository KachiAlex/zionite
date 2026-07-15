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

  // Route through the backend download proxy, which fetches the audio
  // server-side and returns it with Content-Disposition: attachment.
  // This works for any R2 URL format (direct public URL, custom domain,
  // or legacy Cloudinary URLs) without fragile key extraction.
  const downloadUrl = `${API_BASE}/download?url=${encodeURIComponent(audioUrl)}&filename=${encodeURIComponent(filename)}`
  triggerDownload(downloadUrl, filename)
}

