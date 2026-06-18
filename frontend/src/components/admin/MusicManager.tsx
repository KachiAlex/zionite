import { useState, useRef } from 'react'
import axios from 'axios'
import { Music, Plus, Loader2, Trash2, Link2, Upload, FileAudio } from 'lucide-react'

interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  audio_url: string
  cover_url: string
  duration: number
  lyrics: string
  file_format: string
  file_size: number
  created_at: string
}

export default function MusicManager({ music, onRefresh }: { music: MusicTrack[]; onRefresh: () => void }) {
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [form, setForm] = useState({
    title: '', artist: '', album: '', genre: '', cover_url: '', duration: '', lyrics: '', audio_url: ''
  })
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const token = localStorage.getItem('token')

  const acceptedTypes = '.mp3,.wav,.aac,.ogg,.flac,.m4a,.webm,.wma'

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  function formatDuration(seconds: number) {
    if (!seconds) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { alert('Title is required'); return }

    if (mode === 'file' && !file && !form.audio_url) { alert('Audio file or URL required'); return }
    if (mode === 'url' && !form.audio_url.trim()) { alert('Audio URL is required'); return }

    setSubmitting(true)
    try {
      let payload: FormData | object
      let headers: any = { Authorization: `Bearer ${token}` }

      if (mode === 'file' && file) {
        const data = new FormData()
        data.append('audio', file)
        data.append('title', form.title)
        data.append('artist', form.artist)
        data.append('album', form.album)
        data.append('genre', form.genre)
        data.append('cover_url', form.cover_url)
        data.append('duration', form.duration)
        data.append('lyrics', form.lyrics)
        payload = data
      } else {
        payload = {
          title: form.title,
          artist: form.artist,
          album: form.album,
          genre: form.genre,
          audio_url: form.audio_url,
          cover_url: form.cover_url,
          duration: parseInt(form.duration) || 0,
          lyrics: form.lyrics
        }
        headers['Content-Type'] = 'application/json'
      }

      await axios.post('/api/music', payload, { headers })
      setForm({ title: '', artist: '', album: '', genre: '', cover_url: '', duration: '', lyrics: '', audio_url: '' })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload music')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteTrack(id: string) {
    if (!confirm('Delete this track?')) return
    setDeleting(id)
    try {
      await axios.delete(`/api/music/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          Add Music
        </h3>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('file')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            style={mode === 'file' ? { background: 'var(--gold)', color: '#1b1208' } : { background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
          >
            <Upload className="w-3.5 h-3.5" /> File Upload
          </button>
          <button
            onClick={() => setMode('url')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            style={mode === 'url' ? { background: 'var(--gold)', color: '#1b1208' } : { background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
          >
            <Link2 className="w-3.5 h-3.5" /> External URL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'file' ? (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--dim)' }}>
                Audio File <span style={{ color: 'var(--dim)' }}>(MP3, WAV, AAC, OGG, FLAC, M4A, WEBM — max 5MB)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedTypes}
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium"
                style={{ background: 'var(--ink)', color: 'var(--parchment)' }}
              />
              {file && (
                <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                  <FileAudio className="w-3 h-3 inline mr-1" />
                  {file.name} ({formatBytes(file.size)})
                </p>
              )}
            </div>
          ) : (
            <input
              placeholder="Audio URL (e.g. CDN link)"
              value={form.audio_url}
              onChange={e => setForm({ ...form, audio_url: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          )}

          <input
            placeholder="Title *"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Artist"
              value={form.artist}
              onChange={e => setForm({ ...form, artist: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
            <input
              placeholder="Album"
              value={form.album}
              onChange={e => setForm({ ...form, album: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Genre"
              value={form.genre}
              onChange={e => setForm({ ...form, genre: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
            <input
              placeholder="Duration (seconds)"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          </div>
          <input
            placeholder="Cover image URL (optional)"
            value={form.cover_url}
            onChange={e => setForm({ ...form, cover_url: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <textarea
            placeholder="Lyrics (optional)"
            value={form.lyrics}
            onChange={e => setForm({ ...form, lyrics: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            rows={3}
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <button type="submit" disabled={submitting} className="btn-gold disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Track
          </button>
        </form>
      </div>

      {/* Music list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
          <h3 className="font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            Music Library ({music.length})
          </h3>
        </div>
        {music.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>No tracks yet</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {music.map(track => (
              <div key={track.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}>
                  {track.cover_url ? (
                    <img src={track.cover_url} alt="" className="w-full h-full rounded-xl object-cover" />
                  ) : (
                    <Music className="w-5 h-5" style={{ color: 'var(--dim)' }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{track.title}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--dim)' }}>
                    {track.artist && `${track.artist} | `}{track.album && `${track.album} | `}{formatDuration(track.duration)}
                    {track.file_size > 0 && ` | ${formatBytes(track.file_size)}`}
                  </p>
                </div>
                <audio src={track.audio_url} controls className="h-8 w-40 hidden sm:block" />
                <button
                  onClick={() => deleteTrack(track.id)}
                  disabled={deleting === track.id}
                  className="p-1.5 rounded-lg hover:bg-red-900/30 transition-colors shrink-0"
                  title="Delete"
                >
                  {deleting === track.id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
