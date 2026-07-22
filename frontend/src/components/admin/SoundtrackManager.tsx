import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import { Music, Upload, Trash2, Loader2, Library, X } from 'lucide-react'

interface Soundtrack {
  id: string
  title: string
  audio_url: string
  duration: number
  file_format: string
  file_size: number
  created_at: string
}

export default function SoundtrackManager() {
  const [soundtracks, setSoundtracks] = useState<Soundtrack[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { fetchSoundtracks() }, [])

  async function fetchSoundtracks() {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const { data } = await axios.get(`${API_BASE}/api/soundtracks`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      setSoundtracks(data.soundtracks || [])
    } catch {
      setSoundtracks([])
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('audio', file)
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''))

      await axios.post(`${API_BASE}/api/soundtracks`, formData, {
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } : { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      })
      await fetchSoundtracks()
    } catch {
      alert('Failed to upload soundtrack')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this soundtrack? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`${API_BASE}/api/soundtracks/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      setSoundtracks(prev => prev.filter(s => s.id !== id))
    } catch {
      alert('Failed to delete soundtrack')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDuration(seconds: number) {
    if (!seconds) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function formatSize(bytes: number) {
    if (!bytes) return '--'
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Library className="w-5 h-5 text-[#c9a227]" />
            Shared Soundtrack Library
          </h2>
          <p className="text-xs text-[#9c958a] mt-1">Upload background music tracks available to all broadcasters.</p>
        </div>
      </div>

      {/* Upload area */}
      <div className="rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] p-4">
        <label className="relative flex items-center gap-2 cursor-pointer px-3 py-3 rounded-lg transition-colors"
          style={{ background: 'rgba(243,238,228,0.03)', border: '1px dashed rgba(243,238,228,0.15)' }}>
          <Upload className="w-4 h-4 flex-shrink-0 text-[#c9a227]" />
          <span className="text-xs" style={{ color: 'var(--dim)' }}>
            {uploading ? `Uploading... ${uploadProgress}%` : 'Click to upload audio file (MP3, WAV, OGG…)'}
          </span>
          {uploading && (
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(243,238,228,0.1)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: '#c9a227' }} />
              </div>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c9a227]" />
            </div>
          )}
          <input type="file" accept="audio/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: 10 }}
            disabled={uploading}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              await handleUpload(file)
              e.target.value = ''
            }} />
        </label>
      </div>

      {/* Soundtracks list */}
      <div className="rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#c9a227]" />
          </div>
        ) : soundtracks.length === 0 ? (
          <div className="text-center py-8">
            <Music className="w-8 h-8 mx-auto text-[#9c958a] opacity-40 mb-2" />
            <p className="text-xs text-[#9c958a]">No shared soundtracks yet. Upload one above.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'rgba(243,238,228,0.04)' }}>
            {soundtracks.map(st => (
              <div key={st.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(243,238,228,0.02)] transition-colors">
                <Music className="w-4 h-4 flex-shrink-0 text-[#c9a227]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{st.title}</div>
                  <div className="text-[10px] text-[#9c958a] flex items-center gap-2">
                    <span>{formatDuration(st.duration)}</span>
                    <span>·</span>
                    <span>{formatSize(st.file_size)}</span>
                    <span>·</span>
                    <span>{new Date(st.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(st.id)}
                  disabled={deletingId === st.id}
                  className="p-1.5 rounded-lg hover:bg-[rgba(243,238,228,0.06)] transition-colors disabled:opacity-50">
                  {deletingId === st.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" /> : <Trash2 className="w-3.5 h-3.5 text-red-400/70 hover:text-red-400" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
