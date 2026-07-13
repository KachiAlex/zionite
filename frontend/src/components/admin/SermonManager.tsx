import { useState } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import { Headphones, Plus, Loader2, Image, Upload, Cloud, Video, AudioLines, Star, Pencil, X, Save } from 'lucide-react'

interface Sermon {
  id: string
  title: string
  speaker: string
  audio_url: string
  video_url: string
  thumbnail_url: string
  date: string
  is_featured?: boolean
  scripture_reference?: string
  series?: string
  description?: string
  duration?: number
}

type UploadMode = 'audio' | 'video'

export default function SermonManager({ sermons, onRefresh }: { sermons: Sermon[]; onRefresh: () => void }) {
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingSermon, setEditingSermon] = useState<Sermon | null>(null)
  const [editForm, setEditForm] = useState({ title: '', speaker: '', scripture_reference: '', series: '', description: '', duration: '', date: '', video_url: '', audio_url: '', thumbnail_url: '' })
  const [editThumbnailFile, setEditThumbnailFile] = useState<File | null>(null)
  const [editThumbnailPreview, setEditThumbnailPreview] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editStep, setEditStep] = useState('')
  const [mode, setMode] = useState<UploadMode>('audio')
  const [form, setForm] = useState({ title: '', speaker: '', video_url: '', scripture_reference: '', series: '', description: '', duration: '' })
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const token = localStorage.getItem('token')

  const featuredSermons = sermons.filter(s => s.is_featured)
  const featuredCount = featuredSermons.length

  function errMsg(err: any): string {
    if (typeof err === 'string') return err
    if (err?.response?.data?.error) return err.response.data.error
    if (err?.message) return err.message
    return 'Failed to add sermon'
  }

  async function uploadToR2(file: File, folder: string): Promise<string> {
    const { data: presigned } = await axios.get(`${API_BASE}/api/music/upload-url?folder=${folder}&contentType=${encodeURIComponent(file.type || 'application/octet-stream')}&ext=${(file.name.split('.').pop() || 'bin')}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const res = await fetch(presigned.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    if (!res.ok) throw new Error('R2 upload failed')
    return presigned.publicUrl
  }

  async function toggleFeatured(s: Sermon) {
    setTogglingId(s.id)
    try {
      await axios.patch(`${API_BASE}/api/sermons/${s.id}/featured`, { is_featured: !s.is_featured }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      onRefresh()
    } catch {}
    finally { setTogglingId(null) }
  }

  function openEdit(s: Sermon) {
    setEditingSermon(s)
    setEditForm({
      title: s.title || '',
      speaker: s.speaker || '',
      scripture_reference: s.scripture_reference || '',
      series: s.series || '',
      description: s.description || '',
      duration: s.duration ? String(s.duration) : '',
      date: s.date || '',
      video_url: s.video_url || '',
      audio_url: s.audio_url || '',
      thumbnail_url: s.thumbnail_url || '',
    })
    setEditThumbnailFile(null)
    setEditThumbnailPreview('')
  }

  function closeEdit() {
    setEditingSermon(null)
    setEditThumbnailFile(null)
    setEditThumbnailPreview('')
    setEditStep('')
  }

  function handleEditThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null
    setEditThumbnailFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setEditThumbnailPreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setEditThumbnailPreview('')
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSermon) return
    setEditSubmitting(true)
    try {
      let thumbnail_url = editForm.thumbnail_url
      if (editThumbnailFile) {
        setEditStep('Uploading thumbnail...')
        thumbnail_url = await uploadToR2(editThumbnailFile, 'zionite/sermons/thumbnails')
      }
      setEditStep('Saving...')
      await axios.patch(`${API_BASE}/api/sermons/${editingSermon.id}`, {
        ...editForm,
        thumbnail_url,
        duration: editForm.duration || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } })
      closeEdit()
      onRefresh()
    } catch (err: any) {
      alert(errMsg(err))
    } finally {
      setEditSubmitting(false)
      setEditStep('')
    }
  }

  function resetForm() {
    setForm({ title: '', speaker: '', video_url: '', scripture_reference: '', series: '', description: '', duration: '' })
    setAudioFile(null)
    setThumbnailFile(null)
    setThumbnailPreview('')
  }

  function isFormValid(): boolean {
    if (!form.title.trim()) return false
    if (mode === 'audio') return !!audioFile
    if (mode === 'video') return !!form.speaker.trim() && !!form.description.trim() && !!form.video_url.trim()
    return false
  }

  async function addSermon(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { alert('Title is required'); return }

    if (mode === 'audio') {
      if (!audioFile) { alert('Audio file is required'); return }
    } else {
      if (!form.speaker.trim()) { alert('Speaker is required'); return }
      if (!form.description.trim()) { alert('Description is required'); return }
      if (!form.video_url.trim()) { alert('Video embed URL is required'); return }
    }

    setSubmitting(true)
    try {
      let audioUrl = ''
      let thumbnailUrl = ''

      if (mode === 'audio' && audioFile) {
        setUploadStep('Uploading audio to R2...')
        audioUrl = await uploadToR2(audioFile, 'zionite/sermons/audio')
      }

      if (thumbnailFile) {
        setUploadStep('Uploading thumbnail to R2...')
        thumbnailUrl = await uploadToR2(thumbnailFile, 'zionite/sermons/thumbnails')
      }

      setUploadStep('Saving sermon...')
      await axios.post(`${API_BASE}/api/sermons`, {
        title: form.title,
        speaker: form.speaker,
        scripture_reference: form.scripture_reference,
        series: form.series,
        description: form.description,
        duration: form.duration,
        video_url: form.video_url,
        audio_url: audioUrl,
        thumbnail_url: thumbnailUrl
      }, { headers: { Authorization: `Bearer ${token}` } })

      resetForm()
      onRefresh()
    } catch (err: any) {
      alert(errMsg(err))
    } finally {
      setSubmitting(false)
      setUploadStep('')
    }
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null
    setThumbnailFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setThumbnailPreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setThumbnailPreview('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit modal */}
      {editingSermon && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Pencil className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Edit Sermon
              </h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--dim)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="Title *"
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  required
                  className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Speaker"
                  value={editForm.speaker}
                  onChange={e => setEditForm({ ...editForm, speaker: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Scripture reference"
                  value={editForm.scripture_reference}
                  onChange={e => setEditForm({ ...editForm, scripture_reference: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Series"
                  value={editForm.series}
                  onChange={e => setEditForm({ ...editForm, series: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Duration (minutes)"
                  value={editForm.duration}
                  onChange={e => setEditForm({ ...editForm, duration: e.target.value })}
                  type="number"
                  min="0"
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Date"
                  value={editForm.date}
                  onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  type="date"
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <input
                  placeholder="Video URL (YouTube / Vimeo embed)"
                  value={editForm.video_url}
                  onChange={e => setEditForm({ ...editForm, video_url: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                <textarea
                  placeholder="Description"
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                />
                {/* Thumbnail */}
                <div className="sm:col-span-2">
                  <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--dim)' }}>
                    <Image className="w-3 h-3" /> Thumbnail
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditThumbnailChange}
                      className="flex-1 rounded-xl px-4 py-2 text-sm"
                      style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
                    />
                    {(editThumbnailPreview || editForm.thumbnail_url) && (
                      <img
                        src={editThumbnailPreview || editForm.thumbnail_url}
                        alt="Preview"
                        className="w-10 h-10 rounded-lg object-cover"
                        style={{ border: '1px solid var(--line)' }}
                      />
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2 flex gap-2 pt-1">
                  <button type="button" onClick={closeEdit} disabled={editSubmitting}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={editSubmitting || !editForm.title.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--gold)', color: '#0a0a0a' }}>
                    {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editSubmitting ? editStep || 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Add sermon form */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          Add Sermon
        </h3>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => { setMode('audio'); resetForm() }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{
              background: mode === 'audio' ? 'var(--gold)' : 'var(--ink)',
              color: mode === 'audio' ? '#0a0a0a' : 'var(--parchment)'
            }}
          >
            <AudioLines className="w-4 h-4" /> Audio Sermon
          </button>
          <button
            type="button"
            onClick={() => { setMode('video'); resetForm() }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{
              background: mode === 'video' ? 'var(--gold)' : 'var(--ink)',
              color: mode === 'video' ? '#0a0a0a' : 'var(--parchment)'
            }}
          >
            <Video className="w-4 h-4" /> Video Sermon
          </button>
        </div>

        <form onSubmit={addSermon} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Common: Title */}
          <input
            placeholder="Title *"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />

          {/* Common: Speaker */}
          <input
            placeholder={mode === 'video' ? 'Speaker *' : 'Speaker'}
            value={form.speaker}
            onChange={e => setForm({ ...form, speaker: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />

          {/* Audio: file upload */}
          {mode === 'audio' && (
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--dim)' }}>Audio Message *</label>
              <input
                type="file"
                accept="audio/*"
                onChange={e => setAudioFile(e.target.files?.[0] || null)}
                className="w-full rounded-xl px-4 py-2 text-sm"
                style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
              />
              {audioFile && (
                <div className="flex items-center gap-2 mt-1">
                  <Cloud className="w-3 h-3" style={{ color: 'var(--dim)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--dim)' }}>{audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                </div>
              )}
            </div>
          )}

          {/* Video: embed URL */}
          {mode === 'video' && (
            <input
              placeholder="Video embed URL * (YouTube, Vimeo, etc.)"
              value={form.video_url}
              onChange={e => setForm({ ...form, video_url: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          )}

          {/* Thumbnail file picker */}
          <div className="sm:col-span-2">
            <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--dim)' }}>
              <Image className="w-3 h-3" /> Thumbnail
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                className="flex-1 rounded-xl px-4 py-2 text-sm"
                style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
              />
              {thumbnailPreview && (
                <img src={thumbnailPreview} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-[var(--line)]" />
              )}
            </div>
          </div>

          {/* Optional fields */}
          <input
            placeholder="Scripture reference"
            value={form.scripture_reference}
            onChange={e => setForm({ ...form, scripture_reference: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            placeholder="Series"
            value={form.series}
            onChange={e => setForm({ ...form, series: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />

          {mode === 'audio' && (
            <input
              placeholder="Duration (minutes)"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          )}

          <textarea
            placeholder={mode === 'video' ? 'Description *' : 'Description'}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
            rows={2}
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />

          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting || !isFormValid()} className="btn-gold disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {submitting ? uploadStep || 'Uploading...' : 'Upload Sermon'}
            </button>
          </div>
        </form>
      </div>

      {/* Featured Slots Preview */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Star className="w-4 h-4 fill-[#c9a227] text-[#c9a227]" />
            Featured Sermons on Home Page
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: featuredCount === 4 ? 'rgba(74,222,128,0.12)' : 'rgba(201,162,39,0.12)', color: featuredCount === 4 ? '#4ade80' : '#c9a227' }}>
            {featuredCount}/4 slots filled
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => {
            const s = featuredSermons[i]
            return (
              <div key={i} className="rounded-xl overflow-hidden aspect-[4/3] relative flex items-center justify-center"
                style={{ background: s ? 'var(--ink)' : 'rgba(243,238,228,0.03)', border: `1px solid ${s ? 'rgba(201,162,39,0.3)' : 'var(--line)'}` }}>
                {s ? (
                  <>
                    {s.thumbnail_url
                      ? <img src={s.thumbnail_url} alt={s.title} className="w-full h-full object-cover" />
                      : <Headphones className="w-6 h-6" style={{ color: 'var(--dim)' }} />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-1.5">
                      <p className="text-[10px] font-medium text-white leading-tight line-clamp-2">{s.title}</p>
                    </div>
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#c9a227] flex items-center justify-center">
                      <Star className="w-2.5 h-2.5 fill-[#1b1208] text-[#1b1208]" />
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="w-6 h-6 rounded-full border border-dashed mx-auto mb-1 flex items-center justify-center" style={{ borderColor: 'var(--line)' }}>
                      <Star className="w-3 h-3" style={{ color: 'var(--dim)' }} />
                    </div>
                    <p className="text-[9px]" style={{ color: 'var(--dim)' }}>Empty slot</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {featuredCount === 4 && (
          <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--dim)' }}>
            All 4 slots filled. Starring a new sermon will automatically replace the oldest featured one.
          </p>
        )}
      </div>

      {/* Sermon list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
          <h3 className="font-semibold flex items-center gap-2">
            <Headphones className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            All Sermons ({sermons.length})
          </h3>
          <span className="text-[11px]" style={{ color: 'var(--dim)' }}>Click ★ to feature/unfeature</span>
        </div>
        {sermons.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>No sermons yet</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {sermons.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {s.thumbnail_url ? (
                    <img src={s.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--ink)' }}>
                      <Headphones className="w-5 h-5" style={{ color: 'var(--dim)' }} />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                      {s.speaker && `${s.speaker} | `}{s.date}{s.video_url ? ' | Video' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(s)}
                    title="Edit sermon"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleFeatured(s)}
                    disabled={togglingId === s.id}
                    title={s.is_featured ? 'Remove from featured' : 'Feature on home page'}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: s.is_featured ? 'rgba(201,162,39,0.15)' : 'var(--ink)', border: '1px solid var(--line)' }}
                  >
                    <Star className="w-3.5 h-3.5" fill={s.is_featured ? '#c9a227' : 'none'} style={{ color: s.is_featured ? '#c9a227' : 'var(--dim)' }} />
                  </button>
                  <a
                    href={s.video_url || s.audio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-yellow-500"
                    style={{ borderColor: 'var(--line)', color: 'var(--parchment)' }}
                  >
                    {s.video_url ? 'Watch' : 'Listen'}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
