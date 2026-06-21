import { useEffect, useState } from 'react'
import axios from 'axios'
import { Play, Calendar, BookOpen, Headphones, User, Search, AlertCircle, Video } from 'lucide-react'

interface Sermon {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  speaker?: string
  series?: string
  audio_url?: string
  video_url?: string
  thumbnail_url?: string
  date: string
  duration?: number
}

export default function Archive() {
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQ, setSearchQ] = useState('')

  useEffect(() => {
    fetchSermons()
  }, [])

  async function fetchSermons() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/sermons', { timeout: 8000 })
      setSermons(data.sermons || [])
    } catch (err: any) {
      console.error('Failed to fetch sermons:', err)
      setError(err.response?.data?.error || 'Failed to load sermons. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = sermons.filter(s =>
    !searchQ ||
    s.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    (s.speaker && s.speaker.toLowerCase().includes(searchQ.toLowerCase())) ||
    (s.series && s.series.toLowerCase().includes(searchQ.toLowerCase()))
  )

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--gold)' }}
          >
            <Headphones className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Sermon Archive</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            Browse past messages, series, and biblical teachings from our collection.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--dim)' }} />
            <input
              type="text"
              placeholder="Search sermons..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border"
              style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
            <button onClick={fetchSermons} className="ml-auto underline" style={{ color: 'var(--gold)' }}>Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} />
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <Headphones className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <h3 className="text-lg font-semibold mb-2">{searchQ ? 'No matching sermons' : 'No sermons yet'}</h3>
            <p style={{ color: 'var(--dim)' }}>{searchQ ? 'Try a different search term.' : 'The archive is empty.'}</p>
          </div>
        )}

        {/* Sermons List */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(s => (
              <div
                key={s.id}
                className="p-5 flex items-start gap-4 rounded-2xl transition-shadow"
                style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
              >
                {s.thumbnail_url ? (
                  <img src={s.thumbnail_url} alt="" loading="lazy" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}>
                    {s.video_url ? <Video className="w-6 h-6" style={{ color: 'var(--gold)' }} /> : <Play className="w-6 h-6" style={{ color: 'var(--gold)' }} />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{s.title}</h3>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    {s.speaker && <span className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--ink)', color: 'var(--dim)' }}><User className="w-3.5 h-3.5" />{s.speaker}</span>}
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--ink)', color: 'var(--dim)' }}><Calendar className="w-3.5 h-3.5" />{s.date}</span>
                    {s.scripture_reference && <span className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'rgba(201,162,39,0.08)', color: 'var(--gold-soft)' }}><BookOpen className="w-3.5 h-3.5" />{s.scripture_reference}</span>}
                    {s.duration && <span className="px-2 py-1 rounded-md" style={{ background: 'var(--ink)', color: 'var(--dim)' }}>{Math.floor(s.duration / 60)} min</span>}
                  </div>
                  {s.description && <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--dim)' }}>{s.description}</p>}
                </div>
                <a
                  href={s.video_url || s.audio_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shrink-0 no-underline transition-colors"
                  style={{ background: 'rgba(201,162,39,0.08)', color: 'var(--gold)' }}
                >
                  {s.video_url ? <Video className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {s.video_url ? 'Watch' : 'Play'}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
