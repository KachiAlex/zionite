import { useState } from 'react'
import axios from 'axios'
import { Radio, Play, Square, Plus, Loader2 } from 'lucide-react'

interface Broadcast {
  id: string
  title: string
  status: 'scheduled' | 'live' | 'ended'
  started_at?: string
  created_at: string
}

export default function BroadcastManager({ broadcasts, onRefresh }: { broadcasts: Broadcast[]; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', scripture_reference: '' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const token = localStorage.getItem('token')

  async function createBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setCreating(true)
    try {
      await axios.post('/api/broadcasts', form, { headers: { Authorization: `Bearer ${token}` } })
      setForm({ title: '', description: '', scripture_reference: '' })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create broadcast')
    } finally {
      setCreating(false)
    }
  }

  async function startBroadcast(id: string) {
    setActionLoading(id)
    try {
      await axios.patch(`/api/broadcasts/${id}/start`, {}, { headers: { Authorization: `Bearer ${token}` } })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start broadcast')
    } finally {
      setActionLoading(null)
    }
  }

  async function endBroadcast(id: string) {
    setActionLoading(id)
    try {
      await axios.patch(`/api/broadcasts/${id}/end`, {}, { headers: { Authorization: `Bearer ${token}` } })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to end broadcast')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create broadcast */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          New Broadcast
        </h3>
        <form onSubmit={createBroadcast} className="space-y-3">
          <input
            placeholder="Title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            placeholder="Scripture reference (optional)"
            value={form.scripture_reference}
            onChange={e => setForm({ ...form, scripture_reference: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <button
            type="submit"
            disabled={creating || !form.title.trim()}
            className="btn-gold disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Broadcast
          </button>
        </form>
      </div>

      {/* Broadcast list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
          <h3 className="font-semibold flex items-center gap-2">
            <Radio className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            All Broadcasts
          </h3>
        </div>
        {broadcasts.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>No broadcasts yet</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {broadcasts.map(b => (
              <div key={b.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                    {b.status === 'live' ? 'Live now' : b.started_at ? new Date(b.started_at).toLocaleString() : 'Scheduled'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={
                      b.status === 'live'
                        ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                        : b.status === 'ended'
                          ? { background: 'rgba(243,238,228,0.06)', color: 'var(--dim)' }
                          : { background: 'rgba(234,179,8,0.12)', color: '#eab308' }
                    }
                  >
                    {b.status}
                  </span>
                  {b.status === 'scheduled' && (
                    <button
                      onClick={() => startBroadcast(b.id)}
                      disabled={!!actionLoading}
                      className="p-1.5 rounded-lg hover:bg-green-900/30 transition-colors"
                      title="Go Live"
                    >
                      <Play className="w-4 h-4 text-green-400" />
                    </button>
                  )}
                  {b.status === 'live' && (
                    <button
                      onClick={() => endBroadcast(b.id)}
                      disabled={!!actionLoading}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 transition-colors"
                      title="End Broadcast"
                    >
                      <Square className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
