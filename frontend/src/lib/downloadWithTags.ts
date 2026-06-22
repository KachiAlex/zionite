import ID3Writer from 'browser-id3-writer'

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

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status})`)
  return res.arrayBuffer()
}

export async function downloadWithTags(opts: TagOptions): Promise<void> {
  const { title, artist, album, genre, year, comment, coverUrl, audioUrl, filename } = opts

  let songBuffer: ArrayBuffer
  try {
    songBuffer = await fetchBuffer(audioUrl)
  } catch {
    // If CORS blocks the fetch, fall back to plain anchor download
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = filename || `${title}.mp3`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return
  }

  const writer = new ID3Writer(songBuffer)

  writer.setFrame('TIT2', title)
  if (artist) writer.setFrame('TPE1', [artist])
  if (album) writer.setFrame('TALB', album)
  if (genre) writer.setFrame('TCON', [genre])
  if (year) writer.setFrame('TYER', year)
  if (comment) writer.setFrame('COMM', { description: '', text: comment, language: 'eng' })

  if (coverUrl) {
    try {
      const imgBuffer = await fetchBuffer(coverUrl)
      const mime = coverUrl.match(/\.png(\?|$)/i) ? 'image/png' : 'image/jpeg'
      writer.setFrame('APIC', {
        type: 3,
        data: imgBuffer,
        description: 'Cover',
        useUnicodeEncoding: false,
        mimeType: mime
      })
    } catch {
      // Cover fetch failed — embed tags without cover
    }
  }

  writer.addTag()

  const blob = writer.getBlob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename || `${title}.mp3`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
}
