import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { usePageTitle } from '../hooks/usePageTitle'
import { Headphones, Play, Pause, Calendar, User, Clock, ArrowLeft, AlertCircle, Star } from 'lucide-react'

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

export default function PodcastDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [related, setRelated] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasTracked = useRef(false)

  usePageTitle(podcast?.title || 'Podcast')

  useEffect(() => {
    if (!id) return
    fetchPodcast()
  }, [id])

  async function fetchPodcast() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get(`/api/podcasts/${id}`, { timeout: 8000 })
      setPodcast(data.podcast)
      fetchRelated(data.podcast.id)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load podcast.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchRelated(excludeId: string) {
    try {
      const { data } = await axios.get('/api/podcasts', { timeout: 8000 })
      const filtered = (data.podcasts || [])
        .filter((p: Podcast) => p.id !== excludeId)
        .slice(0, 4)
      setRelated(filtered)
    } catch (err) {
      console.error('Failed to fetch related podcasts:', err)
    }
  }

  async function trackListen() {
    if (hasTracked.current) return
    hasTracked.current = true
    try {
      await axios.post(`/api/podcasts/${id}/listen`)
    } catch (err) {
      console.error('Failed to track listen:', err)
    }
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
      trackListen()
    }
    setIsPlaying(!isPlaying)
  }

  function onTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
      setDuration(audioRef.current.duration || 0)
    }
  }

  function onEnded() {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  function formatTime(seconds: number) {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    if (audioRef.current && isFinite(val)) {
      audioRef.current.currentTime = val
      setCurrentTime(val)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} />
    </div>
  )

  if (error || !podcast) return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-3xl mx-auto px-6">
        <div className="p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertCircle className="w-5 h-5 shrink-0" />{error || 'Podcast not found'}
        </div>
        <button onClick={() => navigate('/podcasts')} className="mt-4 text-sm underline" style={{ color: 'var(--gold)' }}>
          <ArrowLeft className="w-4 h-4 inline mr-1" />Back to Podcasts
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-3xl mx-auto px-6">
        <button onClick={() => navigate('/podcasts')} className="text-sm mb-6 flex items-center gap-1.5 transition-colors hover:text-[#e0bd5a]" style={{ color: 'var(--gold)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Podcasts
        </button>

        <div className="p-6 rounded-2xl mb-8" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-48 h-48 rounded-xl overflow-hidden shrink-0 relative" style={{ background: 'var(--ink)' }}>
              {podcast.thumbnail_url ? (
                <img src={podcast.thumbnail_url} alt={podcast.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Headphones className="w-12 h-12" style={{ color: 'var(--line)' }} />
                </div>
              )}
              {podcast.is_featured && (
                <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  <Star className="w-3 h-3" /> Featured
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{podcast.title}</h1>
              <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--dim)' }}>
                {podcast.speaker && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{podcast.speaker}</span>}
                {podcast.date && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(podcast.date).toLocaleDateString()}</span>}
                {podcast.duration && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{podcast.duration}</span>}
                {podcast.category && <span className="px-2 py-0.5 rounded-md" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>{podcast.category}</span>}
                <span>{podcast.listen_count || 0} plays</span>
              </div>
              {podcast.description && <p className="text-sm leading-relaxed" style={{ color: 'var(--dim)' }}>{podcast.description}</p>}
            </div>
          </div>

          {podcast.audio_url && (
            <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
              <audio ref={audioRef} src={podcast.audio_url} onTimeUpdate={onTimeUpdate} onEnded={onEnded} preload="metadata" />
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <input type="range" min={0} max={duration || 1} value={currentTime} onChange={seek}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--gold)', background: 'var(--ink-2)' }} />
                  <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--dim)' }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {related.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>More Episodes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {related.map(p => (
                <Link key={p.id} to={`/podcasts/${p.id}`} className="p-4 rounded-xl flex items-start gap-3 transition-colors hover:opacity-90 no-underline"
                  style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}>
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--ink)' }}>
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Headphones className="w-5 h-5" style={{ color: 'var(--line)' }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>{p.speaker} · {p.duration}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
