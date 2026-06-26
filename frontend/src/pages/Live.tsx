import { useEffect, useState, useRef } from 'react'
import Hls from 'hls.js'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  ArrowLeft, Send, Users, Radio, BookOpen, Play, Pause, Volume2, Volume1, VolumeX,
  Lock, Globe, MessageSquare, Clock, User, ChevronDown, Headphones, X, ArrowDown, HandHeart
} from 'lucide-react'

interface Broadcast {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  status: string
  started_at?: string
  broadcaster_id: string
  church_online_url?: string
  thumbnail_url?: string
  speaker?: string
}

interface ChatMessage {
  id: string
  user_id?: string
  user_name?: string
  guest_name?: string
  recipient_id?: string
  message: string
  is_private: boolean
  created_at: string
  reactions?: Record<string, number>
}

const REACTION_EMOJIS = ['👍','❤️','🙏','😂','🔥','😮']

/* ── AudioBars (visualizer) ───────────────────────── */
function AudioBars({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(Array(16).fill(20))
  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => {
      setHeights(Array.from({ length: 16 }, () => 15 + Math.random() * 65))
    }, 120)
    return () => clearInterval(iv)
  }, [active])

  return (
    <div className="flex items-end gap-[3px] h-10 px-1">
      {heights.map((h, i) => (
        <div key={i} className="w-[3px] rounded-full transition-all duration-150"
          style={{
            background: active ? 'var(--gold)' : 'var(--line)',
            height: `${active ? h : 15}%`,
            opacity: active ? 0.7 + (h / 100) * 0.3 : 0.3
          }} />
      ))}
    </div>
  )
}

/* ── StreamPlayer (simple <audio> for reliable background live streaming) ─────────────────────────────────── */
function StreamPlayer({ broadcastId, title, thumbnailUrl }: { broadcastId: string; title?: string; thumbnailUrl?: string }) {
  const [started, setStarted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [volume, setVolume] = useState(80)
  const [showVolume, setShowVolume] = useState(false)
  const [statusText, setStatusText] = useState('Tap to listen')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const sessionIdRef = useRef('')
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const infoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLiveRef = useRef(false)
  const isLoadingRef = useRef(false)
  const lastKnownChunkRef = useRef(-1)
  const blobUrlRef = useRef<string | null>(null)

  // Create the <audio> element once on mount
  useEffect(() => {
    const audio = document.createElement('audio')
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('preload', 'none')
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  function updateMediaSession(playing: boolean) {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }

  function setupMediaSession(broadcastTitle: string) {
    if (!('mediaSession' in navigator)) return
    const artwork: MediaImage[] = thumbnailUrl
      ? [{ src: thumbnailUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }]
    navigator.mediaSession.metadata = new MediaMetadata({
      title: broadcastTitle,
      artist: 'ZioniteFM',
      album: 'The Voice of Redemption',
      artwork
    })
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play().catch(() => {}))
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler('stop', () => {
      destroyHls()
      const a = audioRef.current
      if (a) { a.pause(); a.src = '' }
    })
  }

  async function fetchLatestChunk(): Promise<number> {
    try {
      const res = await fetch(`${API_BASE}/api/stream/${broadcastId}/info`)
      if (!res.ok) return -1
      const info = await res.json()
      return info.latestChunk ?? -1
    } catch { return -1 }
  }

  async function loadAudioSrc(fromChunk: number): Promise<boolean> {
    const audio = audioRef.current
    if (!audio) return false
    try {
      const res = await fetch(`${API_BASE}/api/stream/${broadcastId}/concat?from=${fromChunk}&_=${Date.now()}`)
      if (!res.ok) return false
      const latest = parseInt(res.headers.get('X-Latest-Chunk') || '-1', 10)
      if (latest >= 0) lastKnownChunkRef.current = latest
      const blob = await res.blob()
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      audio.src = url
      audio.volume = volume / 100
      return true
    } catch { return false }
  }

  async function startPlayback() {
    if (isLoadingRef.current) return
    const audio = audioRef.current
    if (!audio) return
    isLoadingRef.current = true
    setStatusText('Connecting…')

    // Find the latest chunk so we can start near live
    const latest = await fetchLatestChunk()
    if (latest < 0) {
      setStatusText('Stream offline')
      isLoadingRef.current = false
      audio.src = ''
      return
    }

    // Start a few chunks behind live so we have buffer, but not so far we replay old audio
    const startFrom = Math.max(0, latest - 2)
    lastKnownChunkRef.current = startFrom

    const loaded = await loadAudioSrc(startFrom)
    if (!loaded) {
      setStatusText('Stream offline')
      isLoadingRef.current = false
      audio.src = ''
      return
    }

    // Wire up event handlers (clear any old ones first)
    audio.onplay = () => { setIsPlaying(true); updateMediaSession(true) }
    audio.onpause = () => { setIsPlaying(false); updateMediaSession(false) }
    audio.onended = async () => {
      setIsPlaying(false); updateMediaSession(false)
      if (!isLiveRef.current) return
      // Check if new chunks actually exist before trying to resume
      const freshLatest = await fetchLatestChunk()
      if (freshLatest < 0) {
        isLoadingRef.current = false
        audio.src = ''
        return
      }
      lastKnownChunkRef.current = Math.max(lastKnownChunkRef.current, freshLatest)
      const resumeFrom = lastKnownChunkRef.current + 1
      if (resumeFrom > freshLatest) {
        // No new chunks yet — wait briefly and check again
        isLoadingRef.current = false
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          if (isLiveRef.current) startPlayback()
        }, 3000)
        return
      }
      const loaded2 = await loadAudioSrc(resumeFrom)
      if (loaded2) {
        audio.play().catch(() => {})
      } else {
        isLoadingRef.current = false
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = setTimeout(() => {
          if (isLiveRef.current) startPlayback()
        }, 3000)
      }
    }
    audio.onerror = () => {
      setStatusText('Connection error — retrying…')
      isLoadingRef.current = false
      if (!isLiveRef.current) return
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = setTimeout(() => {
        if (isLiveRef.current) startPlayback()
      }, 3000)
    }
    audio.onwaiting = () => { setStatusText('Buffering…') }
    audio.onplaying = () => { setStatusText('Live') }
    audio.oncanplay = () => { setStatusText('Live') }
    audio.onstalled = () => { setStatusText('Stalled — reconnecting…') }

    audio.play().then(() => {
      setIsPlaying(true)
      setStatusText('Live')
      setupMediaSession(title || 'Live Broadcast')
      isLoadingRef.current = false
    }).catch(() => {
      setStatusText('Tap play to start')
      isLoadingRef.current = false
    })
  }

  function destroyHls() {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }

  function startHlsPlayback() {
    const audio = audioRef.current
    if (!audio) return
    destroyHls()

    if (!Hls.isSupported()) {
      startPlayback()
      return
    }

    const hls = new Hls({
      enableWorker: false,
      liveSyncDurationCount: 2,
      maxMaxBufferLength: 30,
      backBufferLength: 10,
      startLevel: -1,
    })
    hlsRef.current = hls

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setStatusText('HLS error — falling back…')
        destroyHls()
        startPlayback()
      }
    })

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(`${API_BASE}/api/stream/${broadcastId}/playlist.m3u8`)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      audio.play().then(() => {
        setIsPlaying(true)
        setStatusText('Live')
        setupMediaSession(title || 'Live Broadcast')
        isLoadingRef.current = false
      }).catch(() => {
        setStatusText('Tap play to start')
        isLoadingRef.current = false
      })
    })

    hls.attachMedia(audio)
  }

  function handleStart() {
    if (!audioRef.current) return
    setStarted(true)
    isLiveRef.current = true
    isLoadingRef.current = true
    setStatusText('Connecting…')

    // Listener tracking
    sessionIdRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36)
    fetch(`${API_BASE}/api/stream/${broadcastId}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current })
    }).catch(() => {})

    heartbeatRef.current = setInterval(() => {
      fetch(`${API_BASE}/api/stream/${broadcastId}/heartbeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current })
      }).catch(() => {})
    }, 30000)

    infoIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stream/${broadcastId}/info`)
        if (res.ok) {
          const info = await res.json()
          setListenerCount(info.listenerCount || 0)
        }
      } catch {}
    }, 10000)

    // Service worker keep-alive ping while playing
    if ('serviceWorker' in navigator) {
      keepAliveRef.current = setInterval(() => {
        navigator.serviceWorker.controller?.postMessage('keepAlive')
      }, 20000)
    }

    // Start Android foreground service for background audio in native app
    try {
      const android = (window as any).AndroidAudio
      if (android && typeof android.startAudioService === 'function') {
        android.startAudioService()
      }
    } catch {}

    startPlayback()
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      const needsRestart = !audio.src || audio.src === '' || audio.error || audio.ended
      if (needsRestart) {
        if (isLiveRef.current) startPlayback()
        return
      }
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  // Recover when user returns to tab after backgrounding
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || !isLiveRef.current) return
      const audio = audioRef.current
      if (!audio) return
      if (audio.paused || audio.ended || audio.error) {
        setStatusText('Reconnecting…')
        startPlayback()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [broadcastId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isLiveRef.current = false
      destroyHls()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (infoIntervalRef.current) clearInterval(infoIntervalRef.current)
      if (keepAliveRef.current) clearInterval(keepAliveRef.current)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
      if (sessionIdRef.current) {
        fetch(`${API_BASE}/api/stream/${broadcastId}/leave`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current })
        }).catch(() => {})
      }
      const a = audioRef.current
      if (a) { a.pause(); a.src = '' }
      // Stop Android foreground service
      try {
        const android = (window as any).AndroidAudio
        if (android && typeof android.stopAudioService === 'function') {
          android.stopAudioService()
        }
      } catch {}
    }
  }, [broadcastId])

  // Volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  const VolumeIcon = volume === 0 ? VolumeX : volume > 50 ? Volume2 : Volume1

  useEffect(() => {
    if (!showVolume) return
    function dismiss(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-volume-ctrl]')) setShowVolume(false)
    }
    document.addEventListener('click', dismiss, true)
    return () => document.removeEventListener('click', dismiss, true)
  }, [showVolume])

  return (
    <div className="mx-2 sm:mx-4 mt-3 mb-4 rounded-xl p-3 sm:p-4 bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#ef4444]" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ef4444]" />
          </span>
          <span className="text-[11px] font-semibold tracking-wider text-white">LIVE AUDIO</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono flex items-center gap-1 text-[#9c958a]">
            <Users className="w-3 h-3" /> {listenerCount}
          </span>
          <span className="text-[10px] font-mono text-[#9c958a]">{statusText}</span>
        </div>
      </div>

      {!started ? (
        <button onClick={handleStart}
          className="w-full py-3.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] bg-[#c9a227] text-[#1b1208]">
          <Headphones className="w-4 h-4" /> Tap to Start Listening
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={togglePlay}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{ background: isPlaying ? '#c9a227' : '#1c1d24', border: `2px solid ${isPlaying ? '#c9a227' : 'rgba(243,238,228,0.08)'}` }}>
            {isPlaying ? <Pause className="w-4 h-4 text-[#1b1208]" /> : <Play className="w-4 h-4 text-[#c9a227] ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <AudioBars active={isPlaying} />
          </div>
          <div data-volume-ctrl="1" className="relative shrink-0 flex flex-col items-center">
            {/* Vertical slider popover */}
            {showVolume && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pb-2 pt-3 px-2 rounded-xl bg-[#1c1d24] border border-[rgba(243,238,228,0.1)] shadow-xl z-30"
                style={{ height: 120 }}>
                <span className="text-[9px] font-mono text-[#9c958a]">{volume}</span>
                <input
                  type="range" min={0} max={100} value={volume}
                  onChange={e => setVolume(parseInt(e.target.value))}
                  className="appearance-none cursor-pointer rounded-full"
                  style={{
                    writingMode: 'vertical-lr' as any,
                    direction: 'rtl',
                    width: 4,
                    height: 72,
                    background: `linear-gradient(to top, #c9a227 ${volume}%, rgba(243,238,228,0.08) ${volume}%)`,
                    outline: 'none',
                  }}
                />
              </div>
            )}
            <button
              onClick={() => setShowVolume(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: showVolume ? 'rgba(201,162,39,0.15)' : 'transparent' }}
              title={`Volume: ${volume}%`}
            >
              <VolumeIcon className="w-3.5 h-3.5" style={{ color: showVolume ? '#c9a227' : '#9c958a' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Live() {
  usePageTitle('Live Broadcast')
  const { broadcastId } = useParams()
  const { user } = useAuth()

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [chatMode, setChatMode] = useState<'public' | 'private'>('public')
  const [privateRecipient, setPrivateRecipient] = useState<{ user_id: string; user_name: string } | null>(null)
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('chat_guest_name') || '')
  const [guestNameSet, setGuestNameSet] = useState(() => !!sessionStorage.getItem('chat_guest_name'))
  const [chatUsers, setChatUsers] = useState<{ user_id: string; user_name: string }[]>([])
  const [showRecipientPicker, setShowRecipientPicker] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 768
  })

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const isAtBottomRef = useRef(true)
  const lastMsgCountRef = useRef(0)
  const chatOpenRef = useRef(chatOpen)
  useEffect(() => { chatOpenRef.current = chatOpen }, [chatOpen])

  useEffect(() => {
    fetchBroadcast(); fetchChatMessages(); fetchChatUsers()
    const broadcastPoll = setInterval(() => { fetchBroadcast(); fetchChatUsers() }, 8000)
    chatPollRef.current = setInterval(() => { fetchChatMessages() }, 2000)
    return () => {
      clearInterval(broadcastPoll)
      if (chatPollRef.current) clearInterval(chatPollRef.current)
    }
  }, [broadcastId])

  // Smart scroll: only auto-scroll when already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  function handleChatScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    isAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom)
  }

  function scrollToBottom() {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAtBottomRef.current = true
    setShowScrollBtn(false)
  }

  async function reactToMessage(msgId: string, emoji: string) {
    setReactingTo(null)
    try {
      const { data } = await axios.post(`${API_BASE}/api/chat/${msgId}/react`, { emoji })
      setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m))
    } catch {}
  }

  useEffect(() => {
    if (!reactingTo) return
    function dismiss(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-reaction-picker]') && !target.closest('[data-reaction-btn]')) {
        setReactingTo(null)
      }
    }
    document.addEventListener('click', dismiss, true)
    return () => document.removeEventListener('click', dismiss, true)
  }, [reactingTo])

  async function fetchBroadcast() {
    try {
      if (broadcastId && broadcastId !== 'current') {
        const { data } = await axios.get(`${API_BASE}/api/broadcasts/${broadcastId}`)
        setBroadcast(data.broadcast)
      } else {
        const { data } = await axios.get(`${API_BASE}/api/broadcasts/active`)
        setBroadcast(data.broadcast)
      }
    } catch { setBroadcast(null) }
    finally { setLoading(false) }
  }

  async function fetchChatMessages() {
    const bid = broadcastId || broadcast?.id
    if (!bid) return
    try {
      const { data } = await axios.get(`${API_BASE}/api/chat/${bid}`)
      const messages = data.messages || []
      if (messages.length > lastMsgCountRef.current) {
        // Only count as new if not the initial load and chat is closed
        if (lastMsgCountRef.current > 0 && !chatOpenRef.current) {
          setNewMsgCount(c => c + (messages.length - lastMsgCountRef.current))
        }
        lastMsgCountRef.current = messages.length
      }
      setChatMessages(messages)
    } catch {}
  }

  async function fetchChatUsers() {
    const bid = broadcastId || broadcast?.id
    if (!bid) return
    try {
      const { data } = await axios.get(`${API_BASE}/api/chat/${bid}/users`)
      setChatUsers((data.users || []).filter((u: any) => u.user_id !== user?.id))
      setOnlineCount(data.users?.length || 0)
    } catch {}
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const bid = broadcastId || broadcast?.id
    const text = newMessage.trim()
    if (!text || !bid) return
    try {
      if (user) {
        const payload: any = { message: text }
        if (chatMode === 'private' && privateRecipient) payload.recipientId = privateRecipient.user_id
        await axios.post(`${API_BASE}/api/chat/${bid}`, payload, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      } else {
        await axios.post(`${API_BASE}/api/chat/${bid}/guest`, { message: text, guestName: guestName.trim() || 'Guest' })
      }
      setNewMessage('')
      fetchChatMessages()
    } catch {}
  }

  function formatTime(ts: string) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  function displayName(msg: ChatMessage) { return msg.guest_name || msg.user_name || 'Anonymous' }
  function isOwnMessage(msg: ChatMessage) { return !!user && msg.user_id === user.id }
  function getChurchOnlineUrl(): string | null {
    if (broadcast?.church_online_url && broadcast.church_online_url.trim().length > 0) return broadcast.church_online_url
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1016] text-[#f3eee4]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c9a227]" />
      </div>
    )
  }

  if (!broadcast) {
    return (
      <div className="min-h-screen bg-[#0f1016] text-[#f3eee4]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs text-[#9c958a] hover:text-white transition-colors mb-12">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="max-w-md mx-auto text-center py-20">
            <Radio className="w-12 h-12 text-[#c9a227] mx-auto mb-5 opacity-60" />
            <h1 className="text-xl font-medium text-white mb-2 tracking-wide">No broadcast right now</h1>
            <p className="text-sm text-[#9c958a] mb-8 leading-relaxed">Check back during scheduled service times or browse our sermon archive.</p>
            <Link to="/archive" className="inline-flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-semibold px-6 py-2.5 rounded-full transition-colors">
              <BookOpen className="w-3.5 h-3.5" /> Browse Archive
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f1016] text-[#f3eee4]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[rgba(243,238,228,0.06)] bg-[#0f1016]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xs text-[#9c958a] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Back</span>
          </Link>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              {broadcast.status === 'live' && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#ef4444]" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ef4444]" />
                </span>
              )}
              <span className="text-[10px] font-mono font-medium tracking-widest text-[#c9a227]">{broadcast.status === 'live' ? 'LIVE NOW' : 'ENDED'}</span>
            </div>
            <div className="text-xs font-medium text-white max-w-[200px] sm:max-w-xs truncate">{broadcast.title}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setChatOpen(o => !o)
                setNewMsgCount(0)
              }}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.1)] text-white transition-colors relative">
              <MessageSquare className="w-3.5 h-3.5 text-[#c9a227]" />
              <span className="hidden sm:inline">{chatOpen ? 'Hide Chat' : 'Open Chat'}</span>
              <span className="sm:hidden">Chat</span>
              {newMsgCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: '#c9a227', color: '#1b1208' }}>
                  {newMsgCount > 9 ? '9+' : newMsgCount}
                </span>
              )}
            </button>
            <span className="text-[11px] font-mono flex items-center gap-1 text-[#9c958a]"><Users className="w-3.5 h-3.5" /> {onlineCount}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 flex flex-col overflow-y-auto ${chatOpen ? 'hidden md:block' : ''}`}>
          {getChurchOnlineUrl() ? (
            <>
              <div className="flex-1 relative min-h-[300px] md:min-h-0">
                <iframe ref={iframeRef} src={getChurchOnlineUrl()!} className="absolute inset-0 w-full h-full" style={{ border: 'none' }} allow="autoplay; fullscreen" allowFullScreen title="Live Broadcast" />
              </div>
              {broadcast.status === 'live' && <StreamPlayer broadcastId={broadcast.id} title={broadcast.title} thumbnailUrl={broadcast.thumbnail_url} />}
              {broadcast.scripture_reference && (
                <div className="mx-4 mb-4 rounded-xl p-4 text-center bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="text-[10px] font-mono font-medium tracking-widest text-[#c9a227] mb-1.5">NOW READING</div>
                  <div className="text-sm font-medium text-white">{broadcast.scripture_reference}</div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-md space-y-5">
                {/* Broadcast info card */}
                <div className="text-center space-y-3">
                  {broadcast.thumbnail_url ? (
                    <div className="w-32 h-32 rounded-2xl overflow-hidden border border-[rgba(243,238,228,0.08)] mx-auto shadow-lg">
                      <img src={broadcast.thumbnail_url} alt={broadcast.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full border border-[#c9a227]/20 flex items-center justify-center mx-auto">
                      <Radio className="w-7 h-7 text-[#c9a227]" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-white">{broadcast.title}</h2>
                    {broadcast.speaker && (
                      <p className="text-[11px] text-[#c9a227] mt-1 flex items-center justify-center gap-1">
                        <User className="w-3 h-3" />{broadcast.speaker}
                      </p>
                    )}
                    {broadcast.description && <p className="text-xs text-[#9c958a] mt-1 max-w-sm mx-auto">{broadcast.description}</p>}
                    {broadcast.scripture_reference && (
                      <p className="text-[11px] text-[#c9a227] mt-2 flex items-center justify-center gap-1"><BookOpen className="w-3 h-3" />{broadcast.scripture_reference}</p>
                    )}
                  </div>
                </div>
                {/* Player */}
                {broadcast.status === 'live' && <StreamPlayer broadcastId={broadcast.id} title={broadcast.title} thumbnailUrl={broadcast.thumbnail_url} />}
              </div>
            </div>
          )}
        </div>

        {/* Chat Section */}
        {chatOpen && (
          <div className="w-full md:w-80 lg:w-96 border-l border-[rgba(243,238,228,0.06)] flex flex-col bg-[#14141a] max-h-[calc(100dvh-3.5rem)] md:max-h-none">
            {/* Chat Header */}
            <div className="p-4 border-b border-[rgba(243,238,228,0.06)]">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                  <MessageSquare className="w-3.5 h-3.5 text-[#c9a227]" /> Chat
                </h3>
                <div className="flex items-center gap-2">
                  <Link to="/donate"
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                    style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)' }}>
                    <HandHeart className="w-3 h-3" /> Give
                  </Link>
                  <span className="text-[10px] font-mono text-[#9c958a]">{onlineCount} active</span>
                  <button onClick={() => setChatOpen(false)} className="md:hidden text-[#9c958a] p-0.5"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {user && (
                <div className="flex gap-1 rounded-lg p-0.5 bg-[#0f1016]">
                  <button onClick={() => { setChatMode('public'); setPrivateRecipient(null); }}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md transition-colors"
                    style={{ background: chatMode === 'public' ? '#c9a227' : 'transparent', color: chatMode === 'public' ? '#1b1208' : '#9c958a' }}>
                    <Globe className="w-3 h-3" /> Public
                  </button>
                  <button onClick={() => setChatMode('private')}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 rounded-md transition-colors"
                    style={{ background: chatMode === 'private' ? '#c9a227' : 'transparent', color: chatMode === 'private' ? '#1b1208' : '#9c958a' }}>
                    <Lock className="w-3 h-3" /> Private
                  </button>
                </div>
              )}
              {user && chatMode === 'private' && (
                <div className="mt-2 relative">
                  <button onClick={() => setShowRecipientPicker(!showRecipientPicker)}
                    className="w-full text-left text-[11px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[rgba(243,238,228,0.08)] bg-[#0f1016] text-[#9c958a]">
                    {privateRecipient ? (
                      <><User className="w-3 h-3 text-[#c9a227]" /><span className="text-white">{privateRecipient.user_name}</span></>
                    ) : (<>Select recipient...</>)}
                    <ChevronDown className="w-3 h-3 ml-auto" />
                  </button>
                  {showRecipientPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-[rgba(243,238,228,0.08)] bg-[#0f1016] z-10 overflow-hidden max-h-40 overflow-y-auto">
                      {chatUsers.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-[#9c958a]">No active users yet</div>
                      ) : (
                        chatUsers.map(u => (
                          <button key={u.user_id} onClick={() => { setPrivateRecipient(u); setShowRecipientPicker(false); }}
                            className="w-full text-left px-3 py-2 text-[11px] flex items-center gap-1.5 hover:bg-[rgba(243,238,228,0.04)] transition-colors text-white">
                            <User className="w-3 h-3 text-[#c9a227]" />{u.user_name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="relative flex-1 overflow-hidden">
              <div ref={chatScrollRef} onScroll={handleChatScroll} className="h-full overflow-y-auto p-4 space-y-3">
                {chatMessages.map((msg, idx) => {
                  const reactionEntries = Object.entries(msg.reactions || {}).filter(([,c]) => (c as number) > 0)
                  return (
                    <div key={msg.id} className={`flex flex-col ${isOwnMessage(msg) ? 'items-end' : 'items-start'}`}
                      style={{ animationDelay: `${Math.min(idx * 0.03, 0.3)}s` }}>
                      <div className="relative group">
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${isOwnMessage(msg) ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                          style={{
                            background: isOwnMessage(msg) ? (msg.is_private ? '#4a3b2a' : '#c9a227') : (msg.is_private ? '#2a2a3a' : '#0f1016'),
                            color: isOwnMessage(msg) && !msg.is_private ? '#1b1208' : '#f3eee4',
                            border: msg.is_private ? '1px solid rgba(243,238,228,0.08)' : '1px solid rgba(243,238,228,0.05)'
                          }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-[10px] font-medium" style={{ color: isOwnMessage(msg) && !msg.is_private ? '#1b1208' : '#c9a227' }}>{displayName(msg)}</span>
                            {msg.is_private && <Lock className="w-2.5 h-2.5 opacity-60" />}
                            {msg.guest_name && <span className="text-[9px] px-1 rounded bg-[rgba(243,238,228,0.08)] text-[#9c958a]">guest</span>}
                          </div>
                          <p className="text-[13px] leading-relaxed">{msg.message}</p>
                          <span className="text-[9px] mt-0.5 block opacity-50 flex items-center gap-0.5">
                            <Clock className="w-2 h-2" /> {formatTime(msg.created_at)}
                          </span>
                        </div>
                        {/* Reaction trigger button — visible on hover */}
                        <button
                          onClick={() => setReactingTo(reactingTo === msg.id ? null : msg.id)}
                          className={`absolute -bottom-1 ${isOwnMessage(msg) ? '-left-6' : '-right-6'} opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none p-0.5 rounded-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)]`}
                          title="React"
                          data-reaction-btn="1"
                        >😊</button>
                        {/* Reaction picker */}
                        {reactingTo === msg.id && (
                          <div data-reaction-picker="1" className={`absolute bottom-6 ${isOwnMessage(msg) ? 'right-0' : 'left-0'} flex gap-1 bg-[#1c1d24] border border-[rgba(243,238,228,0.1)] rounded-full px-2 py-1 shadow-xl z-20`}>
                            {REACTION_EMOJIS.map(e => (
                              <button key={e} onClick={() => reactToMessage(msg.id, e)}
                                className="text-lg leading-none hover:scale-125 transition-transform">{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Reaction counts */}
                      {reactionEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {reactionEntries.map(([emoji, count]) => (
                            <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)}
                              className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full transition-colors hover:bg-[rgba(201,162,39,0.2)]"
                              style={{ background: 'rgba(243,238,228,0.07)', border: '1px solid rgba(243,238,228,0.08)' }}>
                              <span>{emoji}</span><span className="text-[#9c958a]">{count as number}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {chatMessages.length === 0 && (
                  <div className="text-center py-8 text-xs text-[#9c958a]">
                    <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    No messages yet.<br />Be the first to say something!
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Scroll-to-bottom arrow */}
              {showScrollBtn && (
                <button onClick={scrollToBottom}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg transition-all animate-bounce-slow"
                  style={{ background: '#c9a227', color: '#1b1208' }}>
                  <ArrowDown className="w-3 h-3" /> New messages
                </button>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[rgba(243,238,228,0.06)]">
              {!user && !guestNameSet && (
                <div className="mb-2 flex gap-1.5">
                  <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && guestName.trim()) { sessionStorage.setItem('chat_guest_name', guestName.trim()); setGuestNameSet(true) }}}
                    placeholder="Your name to start chatting..." maxLength={20}
                    className="flex-1 rounded-lg px-3 py-1.5 text-[11px] border border-[rgba(243,238,228,0.08)] bg-[#0f1016] text-[#f3eee4] placeholder-[#9c958a] outline-none focus:border-[#c9a227]/30" />
                  <button type="button" onClick={() => { if (guestName.trim()) { sessionStorage.setItem('chat_guest_name', guestName.trim()); setGuestNameSet(true) }}}
                    className="px-2.5 py-1 rounded-lg bg-[#c9a227] text-[#1b1208] text-[11px] font-semibold shrink-0">
                    OK
                  </button>
                </div>
              )}
              {!user && guestNameSet && (
                <div className="mb-2 flex items-center justify-between text-[10px] text-[#9c958a]">
                  <span>Chatting as <span className="text-white font-medium">{guestName}</span></span>
                  <button type="button" onClick={() => { sessionStorage.removeItem('chat_guest_name'); setGuestNameSet(false) }}
                    className="text-[#c9a227] hover:underline">Change</button>
                </div>
              )}
              <form onSubmit={sendMessage}>
                <div className="flex gap-2">
                  <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    disabled={!user && !guestNameSet}
                    placeholder={!user && !guestNameSet ? 'Enter your name above first...' : chatMode === 'private' && privateRecipient ? `Message ${privateRecipient.user_name}...` : 'Send a message...'}
                    className="flex-1 rounded-lg px-3 py-2 text-sm border border-[rgba(243,238,228,0.08)] bg-[#0f1016] text-[#f3eee4] placeholder-[#9c958a] outline-none focus:border-[#c9a227]/30 disabled:opacity-50" />
                  <button type="submit" disabled={!newMessage.trim() || (chatMode === 'private' && !privateRecipient) || (!user && !guestNameSet)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: newMessage.trim() && (chatMode !== 'private' || privateRecipient) ? '#c9a227' : 'rgba(243,238,228,0.08)', color: newMessage.trim() && (chatMode !== 'private' || privateRecipient) ? '#1b1208' : '#9c958a' }}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
              {!user && (
                <div className="mt-2 text-center text-[10px] text-[#9c958a]">
                  <Link to="/login" className="underline hover:opacity-80 text-[#c9a227]">Sign in</Link> for private messaging
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Chat Toggle */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="md:hidden fixed bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center bg-[#c9a227] text-[#1b1208] shadow-lg z-50">
          <MessageSquare className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
