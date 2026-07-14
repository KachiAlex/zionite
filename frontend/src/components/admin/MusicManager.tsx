import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import { Music, Plus, Loader2, Trash2, Link2, Upload, FileAudio, Image, BarChart3, Headphones, Clock, Share2, TrendingUp, Copy, Check } from 'lucide-react'

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

interface AnalyticsData {
  stats: {
    totalPlays: number
    uniqueListeners: number
    totalPlaytime: number
    completedPlays: number
    shareClicks: number
    totalTracks: number
  }
  topTracks: Array<{
    id: string
    title: string
    artist: string
    cover_url: string
    duration: number
    plays: number
    avg_playtime: number
    completed_count: number
  }>
  playsOverTime: Array<{ date: string; plays: number }>
  shareClicksOverTime: Array<{ date: string; clicks: number }>
}

export default function MusicManager({ music, onRefresh }: { music: MusicTrack[]; onRefresh: () => void }) {
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [form, setForm] = useState({
    title: '', artist: '', album: '', genre: '', duration: '', lyrics: '', audio_url: ''
  })
  const [file, setFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const token = localStorage.getItem('token')

  async function fetchAnalytics() {
    setAnalyticsLoading(true)
    try {
      const { data } = await axios.get(`${API_BASE}/api/music/analytics/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAnalytics(data)
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  useEffect(() => {
    if (showAnalytics && !analytics) fetchAnalytics()
  }, [showAnalytics])

  function formatPlaytime(seconds: number) {
    if (!seconds) return '0s'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  async function copyShareLink(trackId: string) {
    const url = `${window.location.origin}/music?track=${trackId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(trackId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      alert(url)
    }
  }

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
      let audioUrl = form.audio_url
      let coverUrl = ''

      // ── Step 1: Upload files directly to R2 via presigned URL ──
      // Use fetch (not axios) so the global Authorization header isn't sent to R2
      if (file) {
        const { data: presigned } = await axios.get(`${API_BASE}/api/music/upload-url?folder=zionite/music/audio&contentType=${encodeURIComponent(file.type || 'audio/mpeg')}&ext=${(file.name.split('.').pop() || 'mp3')}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const res = await fetch(presigned.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'audio/mpeg' } })
        if (!res.ok) throw new Error('R2 audio upload failed')
        audioUrl = presigned.publicUrl
      }

      if (coverFile) {
        const { data: presigned } = await axios.get(`${API_BASE}/api/music/upload-url?folder=zionite/music/covers&contentType=${encodeURIComponent(coverFile.type || 'image/jpeg')}&ext=${(coverFile.name.split('.').pop() || 'jpg')}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const res = await fetch(presigned.uploadUrl, { method: 'PUT', body: coverFile, headers: { 'Content-Type': coverFile.type || 'image/jpeg' } })
        if (!res.ok) throw new Error('R2 cover upload failed')
        coverUrl = presigned.publicUrl
      }

      // ── Step 2: Save metadata + R2 URLs to backend ──
      await axios.post(`${API_BASE}/api/music`, {
        title: form.title,
        artist: form.artist,
        album: form.album,
        genre: form.genre,
        audio_url: audioUrl,
        cover_url: coverUrl,
        duration: parseInt(form.duration) || 0,
        lyrics: form.lyrics
      }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })

      setForm({ title: '', artist: '', album: '', genre: '', duration: '', lyrics: '', audio_url: '' })
      setFile(null)
      setCoverFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (coverInputRef.current) coverInputRef.current.value = ''
      onRefresh()
    } catch (err: any) {
      let msg = 'Failed to upload music'
      const data = err?.response?.data
      if (data) {
        if (typeof data === 'string') msg = data
        else if (data.error) msg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        else msg = JSON.stringify(data)
      } else if (err?.message) {
        msg = err.message
      }
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteTrack(id: string) {
    if (!confirm('Delete this track?')) return
    setDeleting(id)
    try {
      await axios.delete(`${API_BASE}/api/music/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Analytics toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: showAnalytics ? 'var(--gold)' : 'var(--ink-2)', color: showAnalytics ? '#1b1208' : 'var(--parchment)', border: '1px solid var(--line)' }}
        >
          <BarChart3 className="w-4 h-4" /> {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
        </button>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          {analyticsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: 'var(--gold)' }} />
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={<Headphones className="w-4 h-4" />} label="Total Plays" value={analytics.stats.totalPlays.toLocaleString()} />
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Unique Listeners" value={analytics.stats.uniqueListeners.toLocaleString()} />
                <StatCard icon={<Clock className="w-4 h-4" />} label="Total Playtime" value={formatPlaytime(analytics.stats.totalPlaytime)} />
                <StatCard icon={<Check className="w-4 h-4" />} label="Completed" value={analytics.stats.completedPlays.toLocaleString()} />
                <StatCard icon={<Share2 className="w-4 h-4" />} label="Share Clicks" value={analytics.stats.shareClicks.toLocaleString()} />
                <StatCard icon={<Music className="w-4 h-4" />} label="Total Tracks" value={analytics.stats.totalTracks.toLocaleString()} />
              </div>

              {/* Top tracks table */}
              {analytics.topTracks.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Top Tracks
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: 'var(--dim)', borderBottom: '1px solid var(--line)' }}>
                          <th className="text-left py-2 px-2 font-medium">Track</th>
                          <th className="text-right py-2 px-2 font-medium">Plays</th>
                          <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Avg Listen</th>
                          <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topTracks.map((t, i) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs" style={{ color: 'var(--dim)' }}>#{i + 1}</span>
                                {t.cover_url ? (
                                  <img src={t.cover_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--ink)' }}>
                                    <Music className="w-3 h-3" style={{ color: 'var(--dim)' }} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium truncate max-w-[150px]">{t.title}</p>
                                  <p className="text-xs truncate" style={{ color: 'var(--dim)' }}>{t.artist || 'Unknown'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right py-2 px-2 font-medium">{t.plays.toLocaleString()}</td>
                            <td className="text-right py-2 px-2 hidden sm:table-cell" style={{ color: 'var(--dim)' }}>{formatPlaytime(t.avg_playtime)}</td>
                            <td className="text-right py-2 px-2 hidden sm:table-cell" style={{ color: 'var(--dim)' }}>{t.completed_count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Plays over time (simple bar chart) */}
              {analytics.playsOverTime.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-sm">Plays (Last 30 Days)</h4>
                  <div className="flex items-end gap-1 h-24">
                    {analytics.playsOverTime.map((d, i) => {
                      const max = Math.max(...analytics.playsOverTime.map(p => p.plays), 1)
                      const height = Math.max((d.plays / max) * 100, 2)
                      return (
                        <div key={i} className="flex-1 rounded-t" style={{ height: `${height}%`, background: 'var(--gold)', opacity: 0.7 }} title={`${d.date}: ${d.plays} plays`} />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center py-4 text-sm" style={{ color: 'var(--dim)' }}>No analytics data yet</p>
          )}
        </div>
      )}

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
                Audio File <span style={{ color: 'var(--dim)' }}>(MP3, WAV, AAC, OGG, FLAC, M4A, WEBM — max 25MB)</span>
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
            <select
              value={form.genre}
              onChange={e => setForm({ ...form, genre: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm appearance-none"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            >
              <option value="">Select genre</option>
              <option value="Gospel">Gospel</option>
              <option value="Contemporary Christian">Contemporary Christian</option>
              <option value="Worship">Worship</option>
              <option value="Praise & Worship">Praise & Worship</option>
              <option value="Hymns">Hymns</option>
              <option value="Afrobeat Gospel">Afrobeat Gospel</option>
              <option value="Hip Hop Gospel">Hip Hop Gospel</option>
              <option value="R&B Gospel">R&B Gospel</option>
              <option value="Reggae Gospel">Reggae Gospel</option>
              <option value="Classical">Classical</option>
              <option value="Instrumental">Instrumental</option>
              <option value="Choir">Choir</option>
              <option value="Sermon / Messages">Sermon / Messages</option>
              <option value="Other">Other</option>
            </select>
            <input
              placeholder="Duration (seconds)"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--dim)' }}>
              Cover image <span style={{ color: 'var(--dim)' }}>(JPG, PNG, WEBP — max 10MB)</span>
            </label>
            <input
              ref={coverInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif"
              onChange={e => setCoverFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium"
              style={{ background: 'var(--ink)', color: 'var(--parchment)' }}
            />
            {coverFile && (
              <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                <Image className="w-3 h-3 inline mr-1" />
                {coverFile.name} ({formatBytes(coverFile.size)})
              </p>
            )}
          </div>
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
                <button
                  onClick={() => copyShareLink(track.id)}
                  className="p-1.5 rounded-lg transition-colors shrink-0"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}
                  title="Copy share link"
                >
                  {copiedId === track.id ? <Check className="w-4 h-4" style={{ color: 'var(--gold)' }} /> : <Copy className="w-4 h-4" style={{ color: 'var(--dim)' }} />}
                </button>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--dim)' }}>
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-bold text-lg">{value}</p>
    </div>
  )
}
