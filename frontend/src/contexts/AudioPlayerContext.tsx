import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { API_BASE } from '../lib/api'

export interface Track {
  id: string
  title: string
  speaker: string
  audioUrl: string
  thumbnail?: string
  trackType?: 'music' | 'sermon'
}

type RepeatMode = 'off' | 'all' | 'one'

interface AudioPlayerContextType {
  currentTrack: Track | null
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  queue: Track[]
  queueIndex: number
  shuffle: boolean
  repeat: RepeatMode
  playTrack: (track: Track) => void
  playQueue: (tracks: Track[], startIndex?: number) => void
  togglePlay: () => void
  stop: () => void
  next: () => void
  prev: () => void
  setVolume: (v: number) => void
  seek: (time: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([])
  const [originalIndex, setOriginalIndex] = useState(0)
  const [shuffleOn, setShuffleOn] = useState(false)
  const [shuffleIndices, setShuffleIndices] = useState<number[]>([])
  const [shufflePos, setShufflePos] = useState(0)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.8)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const currentTrack = queue.length > 0
    ? queue[shuffleOn ? shuffleIndices[shufflePos] : originalIndex]
    : null

  const trackPlay = useCallback((track: Track) => {
    if (!track.trackType) return
    const endpoint = track.trackType === 'music' ? `${API_BASE}/api/music/${track.id}/play` : `${API_BASE}/api/sermons/${track.id}/play`
    fetch(endpoint, { method: 'POST' }).catch(() => {})
  }, [])

  const loadAndPlay = useCallback((track: Track) => {
    if (audioRef.current) {
      audioRef.current.src = track.audioUrl
      audioRef.current.play().catch(() => setIsPlaying(false))
      setIsPlaying(true)
      trackPlay(track)
    }
  }, [trackPlay])

  const playTrack = useCallback((track: Track) => {
    setQueue([track])
    setOriginalIndex(0)
    setShuffleOn(false)
    setShuffleIndices([0])
    setShufflePos(0)
    loadAndPlay(track)
  }, [loadAndPlay])

  const playQueue = useCallback((tracks: Track[], startIndex: number = 0) => {
    setQueue(tracks)
    setOriginalIndex(startIndex)
    const indices = tracks.map((_, i) => i)
    const shuffled = shuffleArray(indices)
    const pos = shuffled.indexOf(startIndex)
    if (pos !== -1) { [shuffled[0], shuffled[pos]] = [shuffled[pos], shuffled[0]] }
    setShuffleIndices(shuffled)
    setShufflePos(0)
    setShuffleOn(false)
    loadAndPlay(tracks[startIndex])
  }, [loadAndPlay])

  const advance = useCallback((direction: 1 | -1) => {
    if (queue.length === 0) return
    if (repeat === 'one' && currentTrack) {
      loadAndPlay(currentTrack)
      return
    }
    if (shuffleOn) {
      const newPos = (shufflePos + direction + shuffleIndices.length) % shuffleIndices.length
      setShufflePos(newPos)
      const track = queue[shuffleIndices[newPos]]
      loadAndPlay(track)
      return
    }
    const newIdx = (originalIndex + direction + queue.length) % queue.length
    if (repeat === 'off' && direction === 1 && originalIndex >= queue.length - 1) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setIsPlaying(false)
      setProgress(0)
      return
    }
    setOriginalIndex(newIdx)
    const track = queue[newIdx]
    loadAndPlay(track)
  }, [queue, originalIndex, shuffleOn, shufflePos, shuffleIndices, repeat, currentTrack, loadAndPlay])

  const next = useCallback(() => advance(1), [advance])
  const prev = useCallback(() => advance(-1), [advance])

  const toggleShuffle = useCallback(() => {
    setShuffleOn(prev => {
      const nextVal = !prev
      if (nextVal && queue.length > 0) {
        const indices = queue.map((_, i) => i)
        const shuffled = shuffleArray(indices)
        const currentIdx = prev ? shuffleIndices[shufflePos] : originalIndex
        const pos = shuffled.indexOf(currentIdx)
        if (pos !== -1) { [shuffled[0], shuffled[pos]] = [shuffled[pos], shuffled[0]] }
        setShuffleIndices(shuffled)
        setShufflePos(0)
      }
      return nextVal
    })
  }, [queue.length, shuffleOn, shufflePos, shuffleIndices, originalIndex])

  const cycleRepeat = useCallback(() => {
    setRepeat(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off')
  }, [])

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentTrack) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false))
      setIsPlaying(true)
    }
  }, [isPlaying, currentTrack])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
    setProgress(0)
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setProgress(time)
    }
  }, [])

  // Keep a ref to next() so the ended listener always calls the latest version
  const nextRef = useRef(next)
  nextRef.current = next

  useEffect(() => {
    if (!audioRef.current) return
    const audio = audioRef.current
    const onTime = () => setProgress(audio.currentTime)
    const onLoaded = () => setDuration(audio.duration || 0)
    const onEnd = () => nextRef.current()
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnd)
    }
  }, [currentTrack])

  return (
    <AudioPlayerContext.Provider value={{
      currentTrack, isPlaying, progress, duration, volume,
      queue, queueIndex: shuffleOn ? shuffleIndices[shufflePos] : originalIndex,
      shuffle: shuffleOn, repeat,
      playTrack, playQueue, togglePlay, stop, next, prev,
      setVolume, seek, toggleShuffle, cycleRepeat
    }}>
      {children}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext)
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider')
  return ctx
}
