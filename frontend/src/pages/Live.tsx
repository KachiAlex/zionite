import { useEffect, useState, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowLeft, Send, Users, Radio, BookOpen, Play, Pause, Volume2, Volume1, VolumeX,
  Lock, Globe, MessageSquare, Clock, User, ChevronDown, Headphones, X
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
}

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

/* ── StreamPlayer ─────────────────────────────────── */
function StreamPlayer({ broadcastId }: { broadcastId: string }) {
  const [started, setStarted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [volume, setVolume] = useState(80)
  const [statusText, setStatusText] = useState('Waiting...')

  const decodedRef = useRef<AudioBuffer[]>([])
  const nextFetchRef = useRef(-1)
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playingRef = useRef(false)
  const userPausedRef = useRef(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const sessionIdRef = useRef('')

  async function fetchChunk(index: number): Promise<Blob | null> {
    try {
      const res = await fetch(`/api/stream/${broadcastId}/chunk/${index}`)
      if (res.ok) return await res.blob()
    } catch {}
    return null
  }

  async function decodeAndQueue(blob: Blob) {
    if (!ctxRef.current) return
    try {
      const ab = await blob.arrayBuffer()
      const buf = await ctxRef.current.decodeAudioData(ab)
      if (buf.duration > 0.05) decodedRef.current.push(buf)
    } catch {}
  }

  useEffect(() => {
    if (!started) return
    sessionIdRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36)
    fetch(`/api/stream/${broadcastId}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current })
    }).catch(() => {})

    const heartbeat = setInterval(() => {
      fetch(`/api/stream/${broadcastId}/heartbeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current })
      }).catch(() => {})
    }, 30000)

    fetchIntervalRef.current = setInterval(async () => {
      try {
        const infoRes = await fetch(`/api/stream/${broadcastId}/info`)
        if (!infoRes.ok) { setStatusText('Info error'); return }
        const info = await infoRes.json()
        setListenerCount(info.listenerCount || 0)
        const latest = info.latestChunk ?? -1
        if (latest < 0) { setStatusText('No stream'); return }
        if (nextFetchRef.current < 0) {
          nextFetchRef.current = Math.max(0, latest - 1)
          setStatusText(`Joined at chunk ${nextFetchRef.current}`)
        }
        while (nextFetchRef.current <= latest) {
          const blob = await fetchChunk(nextFetchRef.current)
          if (!blob) break
          if (blob.size > 0) await decodeAndQueue(blob)
          nextFetchRef.current++
        }
        setStatusText(`${decodedRef.current.length} buffered`)
        if (!playingRef.current && !userPausedRef.current && decodedRef.current.length >= 2) scheduleNext()
      } catch {}
    }, 2000)

    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current)
      clearInterval(heartbeat)
      fetch(`/api/stream/${broadcastId}/leave`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current })
      }).catch(() => {})
    }
  }, [broadcastId, started])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume / 100
  }, [volume])

  useEffect(() => {
    return () => { if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null } }
  }, [])

  function scheduleNext() {
    if (decodedRef.current.length === 0) { playingRef.current = false; setIsPlaying(false); return }
    if (userPausedRef.current) { playingRef.current = false; setIsPlaying(false); return }
    if (!ctxRef.current) return
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    playingRef.current = true
    setIsPlaying(true)
    const buf = decodedRef.current.shift()!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(gainRef.current!)
    src.start()
    src.onended = () => { scheduleNext() }
  }

  function togglePlay() {
    const ctx = ctxRef.current
    if (!ctx) { handleStart(); return }
    if (playingRef.current) {
      userPausedRef.current = true
      playingRef.current = false
      setIsPlaying(false)
      ctx.suspend().catch(() => {})
    } else {
      userPausedRef.current = false
      ctx.resume().catch(() => {})
      if (decodedRef.current.length > 0) scheduleNext()
    }
  }

  function handleStart() {
    if (!ctxRef.current) {
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const g = ctx.createGain()
      g.gain.value = volume / 100
      g.connect(ctx.destination)
      gainRef.current = g
    }
    setStarted(true)
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume > 50 ? Volume2 : Volume1

  return (
    <div className="mx-4 mt-3 mb-4 rounded-xl p-4 bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
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
          <div className="flex items-center gap-2 shrink-0 w-20">
            <VolumeIcon className="w-3.5 h-3.5 text-[#9c958a]" />
            <input type="range" min={0} max={100} value={volume}
              onChange={e => setVolume(parseInt(e.target.value))}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #c9a227 ${volume}%, rgba(243,238,228,0.08) ${volume}%)` }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Live() {
  const { broadcastId } = useParams()
  const [searchParams] = useSearchParams()
  const showChat = searchParams.get('chat') === '1'
  const { user } = useAuth()

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [chatMode, setChatMode] = useState<'public' | 'private'>('public')
  const [privateRecipient, setPrivateRecipient] = useState<{ user_id: string; user_name: string } | null>(null)
  const [guestName, setGuestName] = useState('')
  const [chatUsers, setChatUsers] = useState<{ user_id: string; user_name: string }[]>([])
  const [showRecipientPicker, setShowRecipientPicker] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetchBroadcast(); fetchChatMessages(); fetchChatUsers()
    const interval = setInterval(() => { fetchBroadcast(); fetchChatMessages(); fetchChatUsers() }, 4000)
    return () => clearInterval(interval)
  }, [broadcastId])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function fetchBroadcast() {
    try {
      if (broadcastId && broadcastId !== 'current') {
        const { data } = await axios.get(`/api/broadcasts/${broadcastId}`)
        setBroadcast(data.broadcast)
      } else {
        const { data } = await axios.get('/api/broadcasts/active')
        setBroadcast(data.broadcast)
      }
    } catch { setBroadcast(null) }
    finally { setLoading(false) }
  }

  async function fetchChatMessages() {
    const bid = broadcastId || broadcast?.id
    if (!bid) return
    try { const { data } = await axios.get(`/api/chat/${bid}`); setChatMessages(data.messages || []) } catch {}
  }

  async function fetchChatUsers() {
    const bid = broadcastId || broadcast?.id
    if (!bid) return
    try {
      const { data } = await axios.get(`/api/chat/${bid}/users`)
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
        await axios.post(`/api/chat/${bid}`, payload)
      } else {
        await axios.post(`/api/chat/${bid}/guest`, { message: text, guestName: guestName.trim() || 'Guest' })
      }
      setNewMessage(''); fetchChatMessages()
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
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
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
          <div className="text-[11px] font-mono flex items-center gap-1 text-[#9c958a]"><Users className="w-3.5 h-3.5" /> {onlineCount}</div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 flex flex-col overflow-y-auto ${showChat ? 'hidden md:block' : ''}`}>
          {getChurchOnlineUrl() ? (
            <div className="flex-1 relative min-h-[300px] md:min-h-0">
              <iframe ref={iframeRef} src={getChurchOnlineUrl()!} className="absolute inset-0 w-full h-full" style={{ border: 'none' }} allow="autoplay; fullscreen" allowFullScreen title="Live Broadcast" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#14141a] min-h-[280px]">
              <div className="w-16 h-16 rounded-full border border-[#c9a227]/20 flex items-center justify-center mb-5">
                <Radio className="w-7 h-7 text-[#c9a227]" />
              </div>
              <h2 className="text-base font-medium text-white mb-1.5">{broadcast.title}</h2>
              {broadcast.description && <p className="text-xs text-[#9c958a] mb-1 max-w-sm">{broadcast.description}</p>}
              {broadcast.scripture_reference && (
                <p className="text-[11px] text-[#c9a227] mt-1 flex items-center gap-1"><BookOpen className="w-3 h-3" />{broadcast.scripture_reference}</p>
              )}
              <div className="mt-5 inline-flex items-center gap-2 text-[10px] font-medium text-[#9c958a] px-3 py-1.5 rounded-full border border-[rgba(243,238,228,0.06)] bg-[#0f1016]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse" />Listening via audio stream
              </div>
            </div>
          )}
          {broadcast.status === 'live' && <StreamPlayer broadcastId={broadcast.id} />}
          {broadcast.scripture_reference && (
            <div className="mx-4 mb-4 rounded-xl p-4 text-center bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="text-[10px] font-mono font-medium tracking-widest text-[#c9a227] mb-1.5">NOW READING</div>
              <div className="text-sm font-medium text-white">{broadcast.scripture_reference}</div>
            </div>
          )}
        </div>

        {/* Chat Section */}
        {showChat && (
          <div className="w-full md:w-80 border-l border-[rgba(243,238,228,0.06)] flex flex-col bg-[#14141a]">
            {/* Chat Header */}
            <div className="p-4 border-b border-[rgba(243,238,228,0.06)]">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="flex items-center gap-2 text-sm font-medium text-white">
                  <MessageSquare className="w-3.5 h-3.5 text-[#c9a227]" /> Chat
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#9c958a]">{onlineCount} active</span>
                  <Link to={`/live/${broadcast?.id || ''}`} className="md:hidden text-[#9c958a] p-0.5"><X className="w-4 h-4" /></Link>
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${isOwnMessage(msg) ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${isOwnMessage(msg) ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isOwnMessage(msg) ? (msg.is_private ? '#4a3b2a' : '#c9a227') : (msg.is_private ? '#2a2a3a' : '#0f1016'),
                      color: isOwnMessage(msg) && !msg.is_private ? '#1b1208' : '#f3eee4',
                      border: msg.is_private ? '1px solid rgba(243,238,228,0.08)' : 'none'
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
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-xs text-[#9c958a]">
                  <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  No messages yet.<br />Be the first to say something!
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[rgba(243,238,228,0.06)]">
              {!user && (
                <div className="mb-2">
                  <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your name..." maxLength={20}
                    className="w-full rounded-lg px-3 py-1.5 text-[11px] border border-[rgba(243,238,228,0.08)] bg-[#0f1016] text-[#f3eee4] placeholder-[#9c958a] outline-none focus:border-[#c9a227]/30" />
                </div>
              )}
              <form onSubmit={sendMessage}>
                <div className="flex gap-2">
                  <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={chatMode === 'private' && privateRecipient ? `Message ${privateRecipient.user_name}...` : 'Send a message...'}
                    className="flex-1 rounded-lg px-3 py-2 text-sm border border-[rgba(243,238,228,0.08)] bg-[#0f1016] text-[#f3eee4] placeholder-[#9c958a] outline-none focus:border-[#c9a227]/30" />
                  <button type="submit" disabled={!newMessage.trim() || (chatMode === 'private' && !privateRecipient)}
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
      {!showChat && (
        <Link to={`/live/${broadcast.id}?chat=1`}
          className="md:hidden fixed bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center bg-[#c9a227] text-[#1b1208] shadow-lg">
          <Users className="w-5 h-5" />
        </Link>
      )}
    </div>
  )
}
