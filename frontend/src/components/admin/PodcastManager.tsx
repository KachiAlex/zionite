import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Headphones, Plus, X, Save, Trash2, Edit3, Star, Upload, Music } from 'lucide-react'

interface Podcast {
  id: string
  title: string
  speaker: string
  duration: string
  audio_url: string
  thumbnail_url: string
  description: string
  date: string
  category: string
  is_featured: boolean
  listen_count: number
  created_at: string
}

const emptyForm = { title: '', speaker: '', duration: '', audio_url: '', thumbnail_url: '', description: '', date: '', category: '', is_featured: false }

export default function PodcastManager() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)
  const token = localStorage.getItem('token')

  async function fetchPodcasts() {
    setLoading(true)
    try {
      const res = await axios.get('/api/podcasts')
      setPodcasts(res.data.podcasts || [])
    } catch (err) {
      console.error('Failed to fetch podcasts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPodcasts() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(p: Podcast) {
    setEditingId(p.id)
    setForm({
      title: p.title, speaker: p.speaker || '', duration: p.duration || '', audio_url: p.audio_url || '',
      thumbnail_url: p.thumbnail_url || '', description: p.description || '', date: p.date || '',
      category: p.category || '', is_featured: p.is_featured
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload = { ...form, is_featured: form.is_featured === true }
      if (editingId) {
        await axios.patch(`/api/podcasts/${editingId}`, payload, { headers: { Authorization: `Bearer ${token}` } })
      } else {
        await axios.post('/api/podcasts', payload, { headers: { Authorization: `Bearer ${token}` } })
      }
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
      fetchPodcasts()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this podcast?')) return
    try {
      await axios.delete(`/api/podcasts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      fetchPodcasts()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAudio(true)
    const fd = new FormData()
    fd.append('audio', file)
    try {
      const res = await axios.post('/api/uploads/audio', fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      })
      setForm({ ...form, audio_url: res.data.audio_url })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Audio upload failed')
    } finally {
      setUploadingAudio(false)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  async function handleThumbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingThumb(true)
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await axios.post('/api/uploads/image', fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      })
      setForm({ ...form, thumbnail_url: res.data.image_url })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Thumbnail upload failed')
    } finally {
      setUploadingThumb(false)
      if (thumbInputRef.current) thumbInputRef.current.value = ''
    }
  }

  if (loading) return <div className="p-12 text-center text-sm" style={{ color: 'var(--dim)' }}>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Podcasts</h2>
        <button onClick={openCreate} className="btn-gold text-xs" style={{ background: 'var(--gold)', color: '#1b1208' }}>
          <Plus className="w-3.5 h-3.5" /> Add Podcast
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl space-y-3" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input required placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="input-dark text-sm" />
            <input placeholder="Speaker / Host" value={form.speaker} onChange={e => setForm({ ...form, speaker: e.target.value })}
              className="input-dark text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="Duration (e.g. 42:15)" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}
              className="input-dark text-sm" />
            <input placeholder="Category (e.g. Teaching, Interview)" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="input-dark text-sm" />
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              className="input-dark text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--dim)' }}>Audio File</label>
              <div className="flex gap-2">
                <input placeholder="Audio URL" value={form.audio_url} onChange={e => setForm({ ...form, audio_url: e.target.value })}
                  className="input-dark text-sm flex-1" />
                <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                <button type="button" onClick={() => audioInputRef.current?.click()} disabled={uploadingAudio}
                  className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}>
                  {uploadingAudio ? <Music className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--dim)' }}>Thumbnail</label>
              <div className="flex gap-2">
                <input placeholder="Thumbnail URL" value={form.thumbnail_url} onChange={e => setForm({ ...form, thumbnail_url: e.target.value })}
                  className="input-dark text-sm flex-1" />
                <input ref={thumbInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbUpload} />
                <button type="button" onClick={() => thumbInputRef.current?.click()} disabled={uploadingThumb}
                  className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}>
                  {uploadingThumb ? <Upload className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {form.thumbnail_url && (
            <div className="w-24 h-24 rounded-lg overflow-hidden">
              <img src={form.thumbnail_url} alt="Thumbnail preview" className="w-full h-full object-cover" />
            </div>
          )}

          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-dark text-sm w-full h-20 resize-none" />

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--parchment)' }}>
            <input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} className="rounded" />
            <Star className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} /> Featured episode
          </label>

          <div className="flex gap-2">
            <button type="submit" className="btn-gold text-xs"><Save className="w-3.5 h-3.5" /> {editingId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); setEditingId(null) }} className="btn-line text-xs"><X className="w-3.5 h-3.5" /> Cancel</button>
          </div>
        </form>
      )}

      {podcasts.length === 0 ? (
        <div className="p-12 text-center rounded-xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <Headphones className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--line)' }} />
          <p style={{ color: 'var(--dim)' }}>No podcasts yet</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {podcasts.map(p => (
            <div key={p.id} className="px-4 py-3 flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--ink)' }}>
                  {p.thumbnail_url ? (
                    <img src={p.thumbnail_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Headphones className="w-4 h-4" style={{ color: 'var(--line)' }} /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.title}{p.is_featured && <Star className="w-3 h-3 inline ml-1.5" style={{ color: 'var(--gold)' }} />}</p>
                  <p className="text-xs" style={{ color: 'var(--dim)' }}>{p.speaker} · {p.duration}{p.date ? ` · ${p.date}` : ''}{p.category ? ` · ${p.category}` : ''} · {p.listen_count || 0} plays</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <button onClick={() => openEdit(p)} className="text-[#9c958a] hover:text-[#c9a227]" title="Edit"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
