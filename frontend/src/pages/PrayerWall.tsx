import { useEffect, useState } from 'react'
import axios from 'axios'
import { usePageTitle } from '../hooks/usePageTitle'
import { prayerRequestSchema } from '../lib/validation'
import { Heart, Send, AlertCircle, User } from 'lucide-react'

interface Prayer {
  id: string
  name: string | null
  request: string
  is_anonymous: boolean
  prayers_count: number
  created_at: string
}

export default function PrayerWall() {
  usePageTitle('Prayer Wall')
  const [prayers, setPrayers] = useState<Prayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [request, setRequest] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState('')

  useEffect(() => { fetchPrayers() }, [])

  async function fetchPrayers() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/prayer', { timeout: 8000 })
      setPrayers(data.prayers || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load prayer requests.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError('')
    const result = prayerRequestSchema.safeParse({ name, request, isAnonymous })
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message || 'Invalid input')
      return
    }
    setSubmitting(true)
    try {
      await axios.post('/api/prayer', { name: name.trim() || 'Anonymous', request: request.trim(), is_anonymous: isAnonymous })
      setName('')
      setRequest('')
      setIsAnonymous(false)
      fetchPrayers()
    } catch (err: any) {
      setValidationError(err.response?.data?.error || 'Failed to submit prayer request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePray(id: string) {
    try {
      await axios.post(`/api/prayer/${id}/pray`)
      setPrayers(prayers.map(p => p.id === id ? { ...p, prayers_count: p.prayers_count + 1 } : p))
    } catch (err: any) {
      console.error('Pray failed:', err)
    }
  }

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Heart className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Prayer Wall</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            Submit your prayer requests and pray for others. You can remain anonymous.
          </p>
        </div>

        {/* Submit form */}
        <form onSubmit={handleSubmit} className="mb-10 p-6 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <h3 className="font-semibold mb-4">Share a Prayer Request</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input placeholder="Your name (optional)" value={name} onChange={e => setName(e.target.value)}
              className="input-dark text-sm w-full" disabled={isAnonymous} />
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--parchment)' }}>
              <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="rounded" />
              Submit anonymously
            </label>
          </div>
          <textarea placeholder="Write your prayer request..." value={request} onChange={e => setRequest(e.target.value)}
            required className="input-dark text-sm w-full h-24 resize-none mb-3" />
          {validationError && (
            <p className="text-xs mb-3" style={{ color: '#fca5a5' }}>{validationError}</p>
          )}
          <button type="submit" disabled={submitting} className="btn-gold text-sm">
            <Send className="w-4 h-4" />{submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        {error && (
          <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
            <AlertCircle className="w-5 h-5 shrink-0" />{error}
            <button onClick={fetchPrayers} className="ml-auto underline" style={{ color: 'var(--gold)' }}>Retry</button>
          </div>
        )}

        {loading && <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} /></div>}

        {!loading && prayers.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <Heart className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <h3 className="text-lg font-semibold mb-2">No prayer requests yet</h3>
            <p style={{ color: 'var(--dim)' }}>Be the first to share a prayer request.</p>
          </div>
        )}

        {!loading && prayers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prayers.map(p => (
              <div key={p.id} className="p-5 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--gold)', color: '#1b1208' }}>
                    {p.is_anonymous || !p.name ? <User className="w-4 h-4" /> : p.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{p.is_anonymous || !p.name ? 'Anonymous' : p.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--dim)' }}>{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--parchment)' }}>{p.request}</p>
                <button onClick={() => handlePray(p.id)} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors hover:border-[#c9a227]"
                  style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
                  <Heart className="w-3.5 h-3.5" /> {p.prayers_count} Praying
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
