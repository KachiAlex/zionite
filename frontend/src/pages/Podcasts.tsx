import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { usePageTitle } from '../hooks/usePageTitle'
import { Headphones, Play, Pause, Calendar, User, Search, AlertCircle, Star, Clock } from 'lucide-react'

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

export default function Podcasts() {
  usePageTitle('Podcasts')
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasTracked = useRef<Set<string>>(new Set())

  useEffect(() => { fetchPodcasts() }, [])

  async function fetchPodcasts() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/podcasts', { timeout: 8000 })
      setPodcasts(data.podcasts || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load podcasts.')
    } finally {
      setLoading(false)
    }
  }

  async function trackListen(id: string) {
    if (hasTracked.current.has(id)) return
    hasTracked.current.add(id)
    try { await axios.post(`/api/podcasts/${id}/listen`) } catch (err) { console.error('Failed to track listen:', err) }
  }

  function togglePlay(id: string, audioUrl: string) {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) { setCurrentTime(audioRef.current.currentTime); setDuration(audioRef.current.duration || 0) }
      })
      audioRef.current.addEventListener('ended', () => { setPlayingId(null); setCurrentTime(0) })
      audioRef.current.addEventListener('loadedmetadata', () => { if (audioRef.current) setDuration(audioRef.current.duration || 0) })
    }

    if (playingId === id) {
      audioRef.current.pause()
      setPlayingId(null)
    } else {
      if (playingId && audioRef.current.src !== audioUrl) {
        audioRef.current.pause()
        audioRef.current.src = audioUrl
        audioRef.current.load()
      } else if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl
        audioRef.current.load()
      }
      audioRef.current.play()
      setPlayingId(id)
      trackListen(id)
    }
  }

  function formatTime(seconds: number) {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    if (audioRef.current && isFinite(val)) { audioRef.current.currentTime = val; setCurrentTime(val) }
  }

  const filtered = podcasts.filter(p =>
    !searchQ || p.title.toLowerCase().includes(searchQ.toLowerCase()) || p.speaker?.toLowerCase().includes(searchQ.toLowerCase()) || p.category?.toLowerCase().includes(searchQ.toLowerCase())
  )

  const featured = filtered.filter(p => p.is_featured)
  const regular = filtered.filter(p => !p.is_featured)

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Headphones className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Podcasts</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            Listen to powerful messages, teachings, and conversations on the go.
          </p>
        </div>

        <div className="relative max-w-md mb-8">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--dim)' }} />
          <input type="text" placeholder="Search podcasts..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border"
            style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
          />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
            <AlertCircle className="w-5 h-5 shrink-0" />{error}
            <button onClick={fetchPodcasts} className="ml-auto underline" style={{ color: 'var(--gold)' }}>Retry</button>
          </div>
        )}

        {loading && <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} /></div>}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <Headphones className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <h3 className="text-lg font-semibold mb-2">{searchQ ? 'No matching podcasts' : 'No podcasts yet'}</h3>
            <p style={{ color: 'var(--dim)' }}>{searchQ ? 'Try a different search term.' : 'Check back soon for new episodes.'}</p>
          </div>
        )}

        {!loading && featured.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--gold)' }}>Featured Episodes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featured.map(p => (
                <PodcastCard key={p.id} podcast={p} playingId={playingId} currentTime={currentTime} duration={duration}
                  onToggle={() => togglePlay(p.id, p.audio_url)} onSeek={seek} formatTime={formatTime} />
              ))}
            </div>
          </div>
        )}

        {!loading && regular.length > 0 && (
          <div>
            {featured.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--dim)' }}>All Episodes</h2>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {regular.map(p => (
                <PodcastCard key={p.id} podcast={p} playingId={playingId} currentTime={currentTime} duration={duration}
                  onToggle={() => togglePlay(p.id, p.audio_url)} onSeek={seek} formatTime={formatTime} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PodcastCard({ podcast, playingId, currentTime, duration, onToggle, onSeek, formatTime }: {
  podcast: Podcast
  playingId: string | null
  currentTime: number
  duration: number
  onToggle: () => void
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  formatTime: (s: number) => string
}) {
  const isPlaying = playingId === podcast.id

  return (
    <div className="p-5 rounded-2xl" style={{ background: 'var(--ink-2)', border: podcast.is_featured ? '1px solid rgba(201,162,39,0.3)' : '1px solid var(--line)' }}>
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 relative" style={{ background: 'var(--ink)' }}>
          {podcast.thumbnail_url ? (
            <img src={podcast.thumbnail_url} alt={podcast.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Headphones className="w-6 h-6" style={{ color: 'var(--line)' }} /></div>
          )}
          {podcast.is_featured && (
            <div className="absolute top-1 left-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--gold)', color: '#1b1208' }}>
              <Star className="w-2.5 h-2.5 inline" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/podcasts/${podcast.id}`} className="font-semibold text-base truncate block no-underline hover:underline" style={{ color: 'var(--parchment)' }}>
            {podcast.title}
          </Link>
          <div className="flex flex-wrap gap-2 mt-1.5 text-[11px]" style={{ color: 'var(--dim)' }}>
            {podcast.speaker && <span className="flex items-center gap-1"><User className="w-3 h-3" />{podcast.speaker}</span>}
            {podcast.date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(podcast.date).toLocaleDateString()}</span>}
            {podcast.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{podcast.duration}</span>}
            {podcast.listen_count > 0 && <span>{podcast.listen_count} plays</span>}
          </div>
          {podcast.category && <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}>{podcast.category}</span>}
        </div>
      </div>

      {podcast.audio_url && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={onToggle} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105"
            style={{ background: 'var(--gold)', color: '#1b1208' }}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          {isPlaying && (
            <div className="flex-1 min-w-0">
              <input type="range" min={0} max={duration || 1} value={currentTime} onChange={onSeek}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--gold)', background: 'var(--ink)' }} />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--dim)' }}>
                <span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span>
              </div>
            </div>
          )}
          <Link to={`/podcasts/${podcast.id}`} className="text-[11px] px-3 py-1.5 rounded-lg no-underline transition-colors shrink-0"
            style={{ background: 'rgba(201,162,39,0.08)', color: 'var(--gold)', border: '1px solid rgba(201,162,39,0.2)' }}>
            Details
          </Link>
        </div>
      )}
    </div>
  )
}
