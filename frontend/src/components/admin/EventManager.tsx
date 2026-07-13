import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import {
  Calendar, Plus, X, Save, Trash2, Pencil, Users,
  Image, Loader2, Upload
} from 'lucide-react'

interface Event {
  id: string
  title: string
  description: string
  date: string
  time: string
  location: string
  image_url: string
  is_active: boolean
  category?: string
}

interface Rsvp {
  id: string
  name: string
  email: string
  phone: string
  guests: number
  created_at: string
}

const CATEGORIES = ['Conference', 'Service', 'Outreach', 'Bible Study', 'Fellowship', 'Youth', 'Other']

export default function EventManager() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '', location: '', image_url: '', is_active: true, category: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const [viewRsvps, setViewRsvps] = useState<string | null>(null)
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const [rsvpStats, setRsvpStats] = useState({ total: 0, guestTotal: 0 })
  const token = localStorage.getItem('token')

  async function fetchEvents() {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/events`)
      setEvents(res.data.events || [])
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEvents() }, [])

  function resetForm() {
    setForm({ title: '', description: '', date: '', time: '', location: '', image_url: '', is_active: true, category: '' })
    setImageFile(null)
    setImagePreview('')
    setEditingId(null)
  }

  function openCreate() {
    resetForm()
    setShowForm(true)
    setViewRsvps(null)
  }

  function openEdit(evt: Event) {
    setForm({
      title: evt.title,
      description: evt.description,
      date: evt.date,
      time: evt.time,
      location: evt.location,
      image_url: evt.image_url,
      is_active: evt.is_active,
      category: evt.category || ''
    })
    setImagePreview(evt.image_url || '')
    setImageFile(null)
    setEditingId(evt.id)
    setShowForm(true)
    setViewRsvps(null)
  }

  async function uploadToR2(file: File): Promise<string> {
    const { data: presigned } = await axios.get(`${API_BASE}/api/music/upload-url?folder=events&contentType=${encodeURIComponent(file.type || 'image/jpeg')}&ext=${(file.name.split('.').pop() || 'jpg')}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const res = await fetch(presigned.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } })
    if (!res.ok) throw new Error('R2 upload failed')
    return presigned.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { alert('Title is required'); return }
    setSubmitting(true); setUploadStep('')
    try {
      let imageUrl = form.image_url
      if (imageFile) {
        setUploadStep('Uploading image...')
        imageUrl = await uploadToR2(imageFile)
      }
      const payload = { ...form, image_url: imageUrl }
      if (editingId) {
        await axios.patch(`${API_BASE}/api/events/${editingId}`, payload, { headers: { Authorization: `Bearer ${token}` } })
      } else {
        await axios.post(`${API_BASE}/api/events`, payload, { headers: { Authorization: `Bearer ${token}` } })
      }
      setShowForm(false)
      resetForm()
      fetchEvents()
    } catch (err: any) {
      alert(err.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'}`)
    } finally {
      setSubmitting(false)
      setUploadStep('')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event?')) return
    try {
      await axios.delete(`${API_BASE}/api/events/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      fetchEvents()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  async function toggleActive(evt: Event) {
    try {
      await axios.patch(`${API_BASE}/api/events/${evt.id}`, { is_active: !evt.is_active }, { headers: { Authorization: `Bearer ${token}` } })
      fetchEvents()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update')
    }
  }

  async function loadRsvps(eventId: string) {
    setViewRsvps(eventId)
    setShowForm(false)
    try {
      const { data } = await axios.get(`${API_BASE}/api/events/${eventId}/rsvps`, { headers: { Authorization: `Bearer ${token}` } })
      setRsvps(data.rsvps || [])
      setRsvpStats({ total: data.total || 0, guestTotal: data.guestTotal || 0 })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to load RSVPs')
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (loading) return <div className="p-12 text-center text-sm" style={{ color: 'var(--dim)' }}>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Events</h2>
        <button onClick={openCreate} className="btn-gold text-xs" style={{ background: 'var(--gold)', color: '#1b1208' }}>
          <Plus className="w-3.5 h-3.5" /> Add Event
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl space-y-3" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? 'Edit Event' : 'New Event'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--dim)] hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <input required placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            className="input-dark text-sm w-full" />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-dark text-sm w-full h-20 resize-none" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              className="input-dark text-sm" />
            <input placeholder="Time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
              className="input-dark text-sm" />
            <input placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              className="input-dark text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="input-dark text-sm">
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm self-center" style={{ color: 'var(--parchment)' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
                className="rounded" /> Active
            </label>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg cursor-pointer transition-colors"
                style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}>
                <Upload className="w-3.5 h-3.5" />
                {imageFile ? 'Change Image' : 'Upload Banner'}
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
              {form.image_url && !imageFile && (
                <span className="text-[11px]" style={{ color: 'var(--dim)' }}>Using existing image</span>
              )}
            </div>
            {imagePreview && (
              <img src={imagePreview} alt="Preview" className="h-32 w-auto rounded-lg object-cover" style={{ border: '1px solid var(--line)' }} />
            )}
          </div>

          {uploadStep && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />{uploadStep}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-gold text-xs" style={{ background: 'var(--gold)', color: '#1b1208' }}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}
              {editingId ? 'Update' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-line text-xs"><X className="w-3.5 h-3.5 inline mr-1" /> Cancel</button>
          </div>
        </form>
      )}

      {viewRsvps && (
        <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Attendees
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>
                {rsvpStats.total} RSVPs · {rsvpStats.guestTotal} additional guests
              </p>
            </div>
            <button onClick={() => setViewRsvps(null)} className="text-[var(--dim)] hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {rsvps.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--dim)' }}>No RSVPs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--dim)', borderBottom: '1px solid var(--line)' }}>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Guests</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--line)' }}>
                  {rsvps.map(r => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3 text-xs" style={{ color: 'var(--dim)' }}>{r.email}</td>
                      <td className="py-2 pr-3 text-xs" style={{ color: 'var(--dim)' }}>{r.phone || '-'}</td>
                      <td className="py-2 pr-3 text-xs">{r.guests || 0}</td>
                      <td className="py-2 text-[11px]" style={{ color: 'var(--dim)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <div className="p-12 text-center rounded-xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <Calendar className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--line)' }} />
          <p style={{ color: 'var(--dim)' }}>No events yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {events.map(evt => (
            <div key={evt.id} className="p-3 rounded-xl flex gap-3 items-start" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
              <div className="w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: 'var(--ink)' }}>
                {evt.image_url ? (
                  <img src={evt.image_url} alt={evt.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Image className="w-6 h-6" style={{ color: 'var(--line)' }} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{evt.title}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--dim)' }}>
                  {evt.date}{evt.time ? ` · ${evt.time}` : ''}{evt.location ? ` · ${evt.location}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {evt.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(201,162,39,0.1)', color: 'var(--gold)' }}>{evt.category}</span>
                  )}
                  <button onClick={() => toggleActive(evt)} className="text-[10px] px-1.5 py-0.5 rounded border"
                    style={{ borderColor: 'var(--line)', color: evt.is_active ? '#4ade80' : 'var(--dim)' }}>
                    {evt.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => loadRsvps(evt.id)} className="p-1.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  title="View RSVPs" style={{ color: 'var(--dim)' }}>
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openEdit(evt)} className="p-1.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                  title="Edit" style={{ color: 'var(--dim)' }}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(evt.id)} className="p-1.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)] text-red-400 hover:text-red-300"
                  title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
