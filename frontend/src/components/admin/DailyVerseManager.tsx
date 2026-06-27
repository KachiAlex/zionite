import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import { Send, BookOpen, Sparkles, Bell, Users } from 'lucide-react'

interface DailyVerse {
  id: string
  title: string
  content: string
  reference: string
  type: string
  created_at: string
}

export default function DailyVerseManager() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [reference, setReference] = useState('')
  const [type, setType] = useState('verse')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [verses, setVerses] = useState<DailyVerse[]>([])
  const [stats, setStats] = useState({ webPush: 0, fcm: 0 })
  const [fetching, setFetching] = useState(true)

  const token = localStorage.getItem('token')

  async function loadData() {
    setFetching(true)
    try {
      const [versesRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/push/verses?limit=10`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        axios.get(`${API_BASE}/api/push/stats`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
      ])
      setVerses(versesRes.data.verses || [])
      setStats(statsRes.data || { webPush: 0, fcm: 0 })
    } catch (e: any) {
      console.error('Load verses error:', e.message)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!title.trim() || !content.trim()) { setError('Title and content are required'); return }
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/api/push/verse`,
        { title, content, reference, type },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSuccess('Sent! Push notifications delivered to all subscribers.')
      setTitle('')
      setContent('')
      setReference('')
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,124,248,0.12)' }}>
            <Bell className="w-4 h-4" style={{ color: '#8b7cf8' }} />
          </div>
          <div>
            <p className="text-[10px] text-[#9c958a]">Web Push Subscribers</p>
            <p className="text-lg font-bold text-white">{stats.webPush}</p>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
            <Users className="w-4 h-4" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <p className="text-[10px] text-[#9c958a]">Mobile Push Subscribers</p>
            <p className="text-lg font-bold text-white">{stats.fcm}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
        <h3 className="text-xs font-semibold text-white tracking-wide mb-4 flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-[#c9a227]" /> Send Daily Word
        </h3>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm border"
            style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}>{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg text-sm border"
            style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', borderColor: 'rgba(74,222,128,0.15)' }}>{success}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-[#9c958a] mb-1.5">Type</label>
            <div className="flex gap-2">
              {['verse', 'prophetic_word'].map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    type === t ? 'bg-[#c9a227]/10 border-[#c9a227]/30 text-[#c9a227]' : 'bg-[#1c1d24] border-[rgba(243,238,228,0.08)] text-[#9c958a]'
                  }`}>
                  {t === 'verse' ? 'Scripture' : 'Prophetic Word'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#9c958a] mb-1.5">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border"
              style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
              placeholder="e.g., Words of Encouragement" required />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#9c958a] mb-1.5">Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
              className="w-full rounded-xl px-3 py-2.5 text-sm border resize-none"
              style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
              placeholder="Enter the verse or prophetic word..." required />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#9c958a] mb-1.5">Reference (optional)</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border"
              style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
              placeholder="e.g., Isaiah 40:31" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
            style={{ background: 'var(--gold)', color: '#1b1208' }}>
            <Send className="w-4 h-4" />
            {loading ? 'Sending…' : 'Send Push Notification'}
          </button>
        </form>
      </div>

      {/* Recent */}
      <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
        <h3 className="text-xs font-semibold text-white tracking-wide mb-3">Recent Daily Words</h3>
        {fetching ? (
          <div className="py-6 text-center text-[11px] text-[#9c958a]">Loading...</div>
        ) : verses.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-[#9c958a]">No daily words sent yet</div>
        ) : (
          <div className="space-y-3">
            {verses.map(v => (
              <div key={v.id} className="p-3 rounded-lg bg-[rgba(243,238,228,0.02)] border border-[rgba(243,238,228,0.06)]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {v.type === 'verse' ? <BookOpen className="w-3 h-3 text-[#c9a227]" /> : <Sparkles className="w-3 h-3 text-[#8b7cf8]" />}
                    <span className="text-[11px] font-medium text-white">{v.title}</span>
                  </div>
                  <span className="text-[9px] text-[#9c958a]">{v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-[11px] text-[#9c958a] leading-relaxed">{v.content}</p>
                {v.reference && <p className="text-[9px] text-[#c9a227] mt-1">{v.reference}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
