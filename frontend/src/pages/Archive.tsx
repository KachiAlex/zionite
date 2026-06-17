import { useEffect, useState } from 'react'
import axios from 'axios'
import { Play, Calendar, BookOpen, Upload, Headphones, User, Search } from 'lucide-react'

interface Sermon {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  speaker?: string
  series?: string
  audio_url: string
  date: string
  duration?: number
}

export default function Archive() {
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', scripture_reference: '', speaker: '', series: '', date: new Date().toISOString().split('T')[0] })
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchSermons() }, [])

  async function fetchSermons() {
    try { const { data } = await axios.get('/api/sermons'); setSermons(data.sermons) } catch {} finally { setLoading(false) }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!audioFile || !form.title || !form.date) return
    setUploading(true)
    const data = new FormData()
    data.append('audio', audioFile)
    Object.entries(form).forEach(([k, v]) => data.append(k, v))
    try { await axios.post('/api/sermons', data); setUploadOpen(false); setForm({ title: '', description: '', scripture_reference: '', speaker: '', series: '', date: new Date().toISOString().split('T')[0] }); setAudioFile(null); fetchSermons() } catch {} finally { setUploading(false) }
  }

  if (loading) return (
    <div className="container-custom py-12">
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    </div>
  )

  return (
    <div className="container-custom py-8 lg:py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Headphones className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Sermon Archive</h1>
        <p className="text-gray-600 mt-2 max-w-xl mx-auto">Browse past messages, series, and biblical teachings from our collection.</p>
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search sermons..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button onClick={() => setUploadOpen(!uploadOpen)} className="btn-primary ml-4"><Upload className="w-4 h-4 mr-2" />Upload</button>
        </div>

      {uploadOpen && (
        <form onSubmit={handleUpload} className="card p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload New Sermon</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required />
            <input placeholder="Speaker" value={form.speaker} onChange={e => setForm({ ...form, speaker: e.target.value })} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input placeholder="Series" value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input placeholder="Scripture" value={form.scripture_reference} onChange={e => setForm({ ...form, scripture_reference: e.target.value })} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required />
            <input type="file" accept="audio/*" onChange={e => setAudioFile(e.target.files?.[0] || null)} className="rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4" />
          <button type="submit" disabled={uploading} className="btn-primary">{uploading ? 'Uploading...' : 'Upload Sermon'}</button>
        </form>
      )}

      {sermons.length === 0 ? (
        <div className="text-center py-16 card">
          <Headphones className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No sermons yet</h3>
          <p className="text-gray-500 mb-4">The archive is empty. Upload your first sermon to get started.</p>
          <button onClick={() => setUploadOpen(true)} className="btn-primary">Upload Sermon</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sermons.map(s => (
            <div key={s.id} className="card p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0"><Play className="w-6 h-6 text-primary-600" /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-lg truncate">{s.title}</h3>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                  {s.speaker && <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md"><User className="w-3.5 h-3.5" />{s.speaker}</span>}
                  <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md"><Calendar className="w-3.5 h-3.5" />{s.date}</span>
                  {s.scripture_reference && <span className="flex items-center gap-1.5 bg-primary-50 text-primary-700 px-2 py-1 rounded-md"><BookOpen className="w-3.5 h-3.5" />{s.scripture_reference}</span>}
                  {s.duration && <span className="bg-gray-100 px-2 py-1 rounded-md">{Math.floor(s.duration / 60)} min</span>}
                </div>
                {s.description && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{s.description}</p>}
              </div>
              <a href={s.audio_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-primary-50 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-100 flex items-center gap-2 shrink-0 transition-colors"><Play className="w-4 h-4" />Play</a>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
