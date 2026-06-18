import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2, Disc3 } from 'lucide-react'

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
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showLyrics, setShowLyrics] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

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

  function playTrack(track: Track) {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    setCurrentTrack(track)
    setIsPlaying(true)
    setProgress(0)
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  function playNext() {
    if (!currentTrack || tracks.length === 0) return
    const idx = tracks.findIndex(t => t.id === currentTrack.id)
    const next = tracks[(idx + 1) % tracks.length]
    playTrack(next)
  }

  function playPrev() {
    if (!currentTrack || tracks.length === 0) return
    const idx = tracks.findIndex(t => t.id === currentTrack.id)
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length]
    playTrack(prev)
  }

  function onTimeUpdate() {
    if (!audioRef.current) return
    const { currentTime, duration } = audioRef.current
    if (duration) setProgress((currentTime / duration) * 100)
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current) return
    const duration = audioRef.current.duration
    if (duration) {
      audioRef.current.currentTime = (parseFloat(e.target.value) / 100) * duration
      setProgress(parseFloat(e.target.value))
    }
  }

  function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tracks.map(track => (
              <div
                key={track.id}
                onClick={() => playTrack(track)}
                className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
                style={{
                  background: currentTrack?.id === track.id ? 'rgba(201,162,39,0.08)' : 'var(--ink-2)',
                  border: `1px solid ${currentTrack?.id === track.id ? 'var(--gold)' : 'var(--line)'}`
                }}
              >
                <div className="aspect-square rounded-xl mb-3 overflow-hidden relative" style={{ background: 'var(--ink)' }}>
                  {track.cover_url ? (
                    <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
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

      {/* Persistent player */}
      {currentTrack && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t"
          style={{ background: 'var(--ink-2)', borderColor: 'var(--line)' }}
        >
          <audio
            ref={audioRef}
            src={currentTrack.audio_url}
            onTimeUpdate={onTimeUpdate}
            onEnded={playNext}
            autoPlay
            muted={muted}
          />
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            {/* Track info */}
            <div className="flex items-center gap-3 w-48 shrink-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--ink)' }}>
                {currentTrack.cover_url ? (
                  <img src={currentTrack.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-5 h-5 m-2.5" style={{ color: 'var(--dim)' }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{currentTrack.title}</p>
                <p className="text-xs truncate" style={{ color: 'var(--dim)' }}>{currentTrack.artist}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center gap-3">
                <button onClick={playPrev} className="p-1 hover:text-[var(--gold)] transition-colors">
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button onClick={playNext} className="p-1 hover:text-[var(--gold)] transition-colors">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>
              <div className="w-full flex items-center gap-2">
                <span className="text-xs w-10 text-right" style={{ color: 'var(--dim)' }}>
                  {formatTime(audioRef.current?.currentTime || 0)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={onSeek}
                  className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--gold) ${progress}%, var(--line) ${progress}%)`
                  }}
                />
                <span className="text-xs w-10" style={{ color: 'var(--dim)' }}>
                  {formatTime(audioRef.current?.duration || 0)}
                </span>
              </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 w-32 shrink-0 justify-end">
              <button onClick={() => setMuted(!muted)} className="p-1">
                {muted ? <VolumeX className="w-4 h-4" style={{ color: 'var(--dim)' }} /> : <Volume2 className="w-4 h-4" style={{ color: 'var(--dim)' }} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={e => {
                  setVolume(parseFloat(e.target.value))
                  if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value)
                }}
                className="w-20 h-1 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--gold) ${volume * 100}%, var(--line) ${volume * 100}%)`
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
