import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import { Music, Play, Pause, Loader2, Disc3, Search } from 'lucide-react'

interface Track {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  audio_url: string
  cover_url: string
  duration: number
  lyrics: string
}

export default function MusicPage() {
  const { currentTrack, isPlaying, playTrack: globalPlayTrack, togglePlay } = useAudioPlayer()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [showLyrics, setShowLyrics] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = tracks.filter(t => {
    const q = query.toLowerCase()
    return t.title.toLowerCase().includes(q) ||
           t.artist.toLowerCase().includes(q) ||
           t.album.toLowerCase().includes(q)
  })

  useEffect(() => {
    fetchTracks()
  }, [])

  async function fetchTracks() {
    try {
      const { data } = await axios.get('/api/music')
      setTracks(data.music || [])
    } catch (err) {
      console.error('Failed to fetch music:', err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlay(track: Track) {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    globalPlayTrack({
      id: track.id,
      title: track.title,
      speaker: track.artist || 'Unknown artist',
      audioUrl: track.audio_url,
      thumbnail: track.cover_url
    })
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8 lg:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Disc3 className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
            Music Library
          </h1>
          <p className="mt-2" style={{ color: 'var(--dim)' }}>
            Stream worship music and gospel tracks
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dim)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by song, artist, or album..."
            className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
        </div>

        {/* Tracks grid */}
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--gold)' }} />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-20">
            <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <p style={{ color: 'var(--dim)' }}>No tracks available yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <p style={{ color: 'var(--dim)' }}>No results for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(track => (
              <div
                key={track.id}
                onClick={() => handlePlay(track)}
                className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
                style={{
                  background: currentTrack?.id === track.id ? 'rgba(201,162,39,0.08)' : 'var(--ink-2)',
                  border: `1px solid ${currentTrack?.id === track.id ? 'var(--gold)' : 'var(--line)'}`
                }}
              >
                <div className="aspect-square rounded-xl mb-3 overflow-hidden relative" style={{ background: 'var(--ink)' }}>
                  {track.cover_url ? (
                    <img src={track.cover_url} alt={track.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-12 h-12" style={{ color: 'var(--line)' }} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                    {currentTrack?.id === track.id && isPlaying ? (
                      <Pause className="w-10 h-10" style={{ color: 'var(--parchment)' }} />
                    ) : (
                      <Play className="w-10 h-10" style={{ color: 'var(--parchment)' }} />
                    )}
                  </div>
                </div>
                <h3 className="font-medium truncate">{track.title}</h3>
                <p className="text-sm truncate mt-0.5" style={{ color: 'var(--dim)' }}>
                  {track.artist || 'Unknown artist'}{track.album && ` | ${track.album}`}
                </p>
                {track.lyrics && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowLyrics(showLyrics === track.id ? null : track.id) }}
                    className="text-xs mt-2 underline"
                    style={{ color: 'var(--gold)' }}
                  >
                    {showLyrics === track.id ? 'Hide lyrics' : 'Show lyrics'}
                  </button>
                )}
                {showLyrics === track.id && track.lyrics && (
                  <pre className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--dim)' }}>
                    {track.lyrics}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
