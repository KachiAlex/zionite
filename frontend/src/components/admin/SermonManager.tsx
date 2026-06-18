import { useState } from 'react'
import axios from 'axios'
import { Headphones, Plus, Loader2 } from 'lucide-react'

interface Sermon {
  id: string
  title: string
  speaker: string
  audio_url: string
  date: string
}

export default function SermonManager({ sermons, onRefresh }: { sermons: Sermon[]; onRefresh: () => void }) {
  const [form, setForm] = useState({ title: '', speaker: '', audio_url: '', date: '', scripture_reference: '', series: '', description: '', duration: '' })
  const [submitting, setSubmitting] = useState(false)
  const token = localStorage.getItem('token')

  async function addSermon(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.audio_url.trim() || !form.date) {
      alert('Title, audio URL, and date are required')
      return
    }
    setSubmitting(true)
    try {
      await axios.post('/api/sermons', {
        title: form.title,
        speaker: form.speaker,
        audio_url: form.audio_url,
        date: form.date,
        scripture_reference: form.scripture_reference,
        series: form.series,
        description: form.description,
        duration: parseInt(form.duration) || 0
      }, { headers: { Authorization: `Bearer ${token}` } })
      setForm({ title: '', speaker: '', audio_url: '', date: '', scripture_reference: '', series: '', description: '', duration: '' })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add sermon')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add sermon form */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          Add Sermon
        </h3>
        <form onSubmit={addSermon} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            placeholder="Title *"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            placeholder="Speaker"
            value={form.speaker}
            onChange={e => setForm({ ...form, speaker: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            placeholder="Audio URL *"
            value={form.audio_url}
            onChange={e => setForm({ ...form, audio_url: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
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
          <input
            placeholder="Duration (minutes)"
            value={form.duration}
            onChange={e => setForm({ ...form, duration: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm sm:col-span-2"
            rows={2}
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting} className="btn-gold disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Sermon
            </button>
          </div>
        </form>
      </div>

      {/* Sermon list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
          <h3 className="font-semibold flex items-center gap-2">
            <Headphones className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            Sermons ({sermons.length})
          </h3>
        </div>
        {sermons.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>No sermons yet</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {sermons.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                    {s.speaker && `${s.speaker} | `}{s.date}
                  </p>
                </div>
                <a
                  href={s.audio_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-yellow-500"
                  style={{ borderColor: 'var(--line)', color: 'var(--parchment)' }}
                >
                  Listen
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
