import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import {
  Headphones, Play, Pause, Calendar, BookOpen, User, Clock, ArrowLeft,
  AlertCircle, Video, AudioLines, Share2, Download
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

export default function SermonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioPlayer()
  const [sermon, setSermon] = useState<Sermon | null>(null)
  const [related, setRelated] = useState<Sermon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  usePageTitle(sermon?.title || 'Sermon')

  useEffect(() => {
    if (!id) return
    fetchSermon()
  }, [id])

  async function fetchSermon() {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get(`/api/sermons/${id}`, { timeout: 8000 })
      setSermon(data.sermon)
      fetchRelated(data.sermon.id)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load sermon.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchRelated(excludeId: string) {
    try {
      const { data } = await axios.get('/api/sermons', { timeout: 8000 })
      const filtered = (data.sermons || [])
        .filter((s: Sermon) => s.id !== excludeId)
        .slice(0, 4)
      setRelated(filtered)
    } catch (err) {
      console.error('Failed to fetch related sermons:', err)
    }
  }

  function isThisPlaying(): boolean {
    return currentTrack?.id === id && isPlaying
  }

  function handlePlay() {
    if (!sermon?.audio_url) return
    if (currentTrack?.id === id) {
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

  function handleDownload() {
    if (!sermon?.audio_url) return
    const a = document.createElement('a')
    a.href = sermon.audio_url
    a.download = `${sermon.title}${sermon.audio_url.match(/\.\w+$/)?.[0] || '.mp3'}`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleShare() {
    if (!sermon) return
    const shareUrl = `${window.location.origin}/sermons/${sermon.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: sermon.title, text: `Listen to "${sermon.title}" on ZioniteFM`, url: shareUrl })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        alert('Link copied to clipboard!')
      }
    } catch { /* user cancelled */ }
  }

  function getVideoEmbedUrl(url: string): string {
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return url
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} />
    </div>
  )

  if (error || !sermon) return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-3xl mx-auto px-6">
        <div className="p-4 rounded-xl text-sm flex items-center gap-3" style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertCircle className="w-5 h-5 shrink-0" />{error || 'Sermon not found'}
        </div>
        <button onClick={() => navigate('/archive')} className="mt-4 text-sm underline" style={{ color: 'var(--gold)' }}>
          <ArrowLeft className="w-4 h-4 inline mr-1" />Back to Sermons
        </button>
      </div>
    </div>
  )

  const isAudioSermon = !!sermon.audio_url && !sermon.video_url
  const isVideoSermon = !!sermon.video_url

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-3xl mx-auto px-6">
        <button onClick={() => navigate('/archive')} className="text-sm mb-6 flex items-center gap-1.5 transition-colors hover:text-[#e0bd5a]" style={{ color: 'var(--gold)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Sermons
        </button>

        {/* Hero card */}
        <div className="p-6 rounded-2xl mb-8" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-48 h-48 rounded-xl overflow-hidden shrink-0 relative" style={{ background: 'var(--ink)' }}>
              {sermon.thumbnail_url ? (
                <img src={sermon.thumbnail_url} alt={sermon.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Headphones className="w-12 h-12" style={{ color: 'var(--line)' }} />
                </div>
              )}
              {isVideoSermon && (
                <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  <Video className="w-3 h-3" /> Video
                </div>
              )}
              {isAudioSermon && (
                <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  <AudioLines className="w-3 h-3" /> Audio
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{sermon.title}</h1>
              <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--dim)' }}>
                {sermon.speaker && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{sermon.speaker}</span>}
                {sermon.date && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(sermon.date).toLocaleDateString()}</span>}
                {sermon.duration && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{Math.floor(sermon.duration / 60)} min</span>}
                {sermon.series && <span className="px-2 py-0.5 rounded-md" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>{sermon.series}</span>}
              </div>
              {sermon.scripture_reference && (
                <div className="flex items-center gap-1.5 text-xs mb-3 px-2 py-1 rounded-md inline-flex" style={{ background: 'rgba(201,162,39,0.08)', color: 'var(--gold)' }}>
                  <BookOpen className="w-3.5 h-3.5" />{sermon.scripture_reference}
                </div>
              )}
              {sermon.description && <p className="text-sm leading-relaxed" style={{ color: 'var(--dim)' }}>{sermon.description}</p>}
            </div>
          </div>

          {/* Player area */}
          {isAudioSermon && sermon.audio_url && (
            <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-4">
                <button onClick={handlePlay} className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  {isThisPlaying() ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{isThisPlaying() ? 'Now Playing' : 'Listen to this sermon'}</p>
                  <p className="text-xs" style={{ color: 'var(--dim)' }}>{sermon.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleShare} className="p-2 rounded-lg transition-colors" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }} title="Share">
                    <Share2 className="w-4 h-4" style={{ color: 'var(--dim)' }} />
                  </button>
                  <button onClick={handleDownload} className="p-2 rounded-lg transition-colors" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }} title="Download">
                    <Download className="w-4 h-4" style={{ color: 'var(--dim)' }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {isVideoSermon && sermon.video_url && (
            <div className="mt-6 rounded-xl overflow-hidden" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
              <div className="relative w-full aspect-video">
                <iframe
                  src={getVideoEmbedUrl(sermon.video_url)}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={sermon.title}
                />
              </div>
            </div>
          )}
        </div>

        {/* Related sermons */}
        {related.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>More Sermons</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {related.map(s => (
                <Link key={s.id} to={`/sermons/${s.id}`} className="p-4 rounded-xl flex items-start gap-3 transition-colors hover:opacity-90 no-underline"
                  style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}>
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--ink)' }}>
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt={s.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Headphones className="w-5 h-5" style={{ color: 'var(--line)' }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>
                      {s.speaker || 'Unknown speaker'} · {s.date}
                    </p>
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
