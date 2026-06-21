import { useEffect, useState } from 'react'
import axios from 'axios'
import { Calendar, MapPin, Clock, AlertCircle } from 'lucide-react'

interface Event {
  id: string
  title: string
  description: string
  date: string
  time: string
  location: string
  image_url: string
  is_active: boolean
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { fetchEvents() }, [])

  async function fetchEvents() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/events', { timeout: 8000 })
      setEvents(data.events || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load events.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Calendar className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Upcoming Events</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            Join us for conferences, gatherings, and special services.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
            <AlertCircle className="w-5 h-5 shrink-0" />{error}
            <button onClick={fetchEvents} className="ml-auto underline" style={{ color: 'var(--gold)' }}>Retry</button>
          </div>
        )}

        {loading && <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} /></div>}

        {!loading && events.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <h3 className="text-lg font-semibold mb-2">No events yet</h3>
            <p style={{ color: 'var(--dim)' }}>Check back soon for upcoming events.</p>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {events.map(evt => (
              <div key={evt.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
                {evt.image_url ? (
                  <img src={evt.image_url} alt="" loading="lazy" className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center" style={{ background: 'var(--ink)' }}>
                    <Calendar className="w-10 h-10" style={{ color: 'var(--dim)' }} />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-semibold text-lg mb-2">{evt.title}</h3>
                  {evt.description && <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--dim)' }}>{evt.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--dim)' }}>
                    {evt.date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{evt.date}</span>}
                    {evt.time && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{evt.time}</span>}
                    {evt.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{evt.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
