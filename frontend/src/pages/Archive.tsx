import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import {
  Play, Pause, Calendar, BookOpen, Headphones, User, Search, AlertCircle,
  Video, AudioLines, ArrowRight
} from 'lucide-react'

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
  usePageTitle('Sermon Archive')
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioPlayer()
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

  function handlePlayCard(e: React.MouseEvent, sermon: Sermon) {
    e.preventDefault()
    e.stopPropagation()
    if (!sermon.audio_url) return
    if (currentTrack?.id === sermon.id) {
      togglePlay()
      return
    }
    playTrack({
      id: sermon.id,
      title: sermon.title,
      speaker: sermon.speaker || 'Unknown speaker',
      audioUrl: sermon.audio_url,
      thumbnail: sermon.thumbnail_url
    })
  }

  function isThisPlaying(id: string): boolean {
    return currentTrack?.id === id && isPlaying
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8 lg:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Headphones className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Sermon Archive</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            Browse past messages, series, and biblical teachings from our collection.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dim)' }} />
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by title, speaker, or series..."
            className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
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

        {/* Sermons grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => {
              const isVideo = !!s.video_url && !s.audio_url
              const isAudio = !!s.audio_url && !s.video_url
              const hasBoth = !!s.audio_url && !!s.video_url
              const playing = isThisPlaying(s.id)

              return (
                <Link
                  key={s.id}
                  to={`/sermons/${s.id}`}
                  className="rounded-2xl overflow-hidden transition-all hover:scale-[1.02] group block"
                  style={{
                    background: playing ? 'rgba(201,162,39,0.08)' : 'var(--ink-2)',
                    border: `1px solid ${playing ? 'var(--gold)' : 'var(--line)'}`,
                    textDecoration: 'none',
                    color: 'inherit'
                  }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video relative overflow-hidden" style={{ background: 'var(--ink)' }}>
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Headphones className="w-12 h-12" style={{ color: 'var(--line)' }} />
                      </div>
                    )}

                    {/* Type badge */}
                    <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                      {isVideo ? <Video className="w-3 h-3" /> : <AudioLines className="w-3 h-3" />}
                      {isVideo ? 'Video' : isAudio ? 'Audio' : hasBoth ? 'Audio + Video' : 'Sermon'}
                    </div>

                    {/* Play overlay (audio only) */}
                    {isAudio && s.audio_url && (
                      <button
                        onClick={e => handlePlayCard(e, s)}
                        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--gold)', color: '#1b1208' }}>
                          {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                        </div>
                      </button>
                    )}

                    {/* Watch overlay (video only) */}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--gold)', color: '#1b1208' }}>
                          <Video className="w-6 h-6" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-medium truncate">{s.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: 'var(--dim)' }}>
                      {s.speaker && <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.speaker}</span>}
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{s.date}</span>
                    </div>
                    {s.scripture_reference && (
                      <div className="flex items-center gap-1 text-[11px] mt-2 px-1.5 py-0.5 rounded inline-flex" style={{ background: 'rgba(201,162,39,0.08)', color: 'var(--gold)' }}>
                        <BookOpen className="w-3 h-3" />{s.scripture_reference}
                      </div>
                    )}
                    {s.description && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--dim)' }}>{s.description}</p>}

                    <div className="flex items-center gap-2 mt-3 text-[11px] font-medium" style={{ color: 'var(--gold)' }}>
                      <span className="flex items-center gap-1">
                        {isVideo ? <Video className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {isVideo ? 'Watch' : playing ? 'Now Playing' : 'Listen'}
                      </span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
