import { useEffect, useState, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, Send, Users, Radio, BookOpen, Play } from 'lucide-react'

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
  user_name: string
  message: string
  created_at: string
}

// Church Online Platform Church ID
const CHURCH_ONLINE_ID = 'zionitefm'

/* ── StreamPlayer ─────────────────────────────────── */
function StreamPlayer({ broadcastId }: { broadcastId: string }) {
  const [started, setStarted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const queueRef = useRef<Blob[]>([])
  const nextFetchRef = useRef(-1) // -1 = position unknown
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alignIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [bufferedCount, setBufferedCount] = useState(0)
  const playingRef = useRef(false)
  const consecutive404sRef = useRef(0)

  // Align: query /info to find a valid starting chunk
  async function align() {
    try {
      const infoRes = await fetch(`/api/stream/${broadcastId}/info`)
      if (!infoRes.ok) return
      const info = await infoRes.json()
      const latest = info.latestChunk ?? -1
      if (latest < 0) return
      if (nextFetchRef.current < 0) {
        // First alignment: start 1 chunk behind latest
        nextFetchRef.current = Math.max(0, latest - 1)
      } else if (nextFetchRef.current > latest + 2) {
        // We've raced too far ahead (missed chunks), realign
        nextFetchRef.current = Math.max(0, latest - 1)
        consecutive404sRef.current = 0
      }
    } catch {}
  }

  useEffect(() => {
    if (!started) return
    align()
    alignIntervalRef.current = setInterval(align, 8000)

    fetchIntervalRef.current = setInterval(async () => {
      if (nextFetchRef.current < 0) return // not aligned yet
      try {
        const res = await fetch(`/api/stream/${broadcastId}/chunk/${nextFetchRef.current}`)
        if (res.ok) {
          consecutive404sRef.current = 0
          const blob = await res.blob()
          if (blob.size > 0) {
            queueRef.current.push(blob)
            setBufferedCount(c => c + 1)
            if (!playingRef.current) playNext()
          }
          nextFetchRef.current++
        } else if (res.status === 404) {
          consecutive404sRef.current++
          if (consecutive404sRef.current >= 3) {
            // Chunk is missing — skip it and move on
            nextFetchRef.current++
            consecutive404sRef.current = 0
          }
        }
      } catch {}
    }, 2000)

    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current)
      if (alignIntervalRef.current) clearInterval(alignIntervalRef.current)
    }
  }, [broadcastId, started])

  async function playNext() {
    if (queueRef.current.length === 0) {
      playingRef.current = false
      return
    }
    playingRef.current = true
    const blob = queueRef.current.shift()!
    const url = URL.createObjectURL(blob)
    const audio = audioRef.current
    if (!audio) { URL.revokeObjectURL(url); playNext(); return }
    audio.src = url
    audio.onended = () => { URL.revokeObjectURL(url); playNext() }
    audio.onerror = () => { URL.revokeObjectURL(url); playNext() }
    try { await audio.play() } catch { URL.revokeObjectURL(url); playNext() }
  }

  function handleStart() {
    setStarted(true)
  }

  return (
    <div className="mx-4 mt-4 rounded-xl p-4" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Audio Stream
        </span>
        <span className="text-xs" style={{ color: 'var(--dim)' }}>{bufferedCount} chunks buffered</span>
      </div>
      {!started ? (
        <button onClick={handleStart}
          className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors hover:opacity-90"
          style={{ background: 'var(--gold)', color: 'var(--ink)' }}>
          <Play className="w-4 h-4" /> Click to Listen
        </button>
      ) : (
        <audio ref={audioRef} className="w-full" controls style={{ height: 40 }} />
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
  const [onlineCount, setOnlineCount] = useState(0)
  const [loading, setLoading] = useState(true)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetchBroadcast()
    fetchChatMessages()
    
    // Poll for updates
    const interval = setInterval(() => {
      fetchBroadcast()
      fetchChatMessages()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [broadcastId])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function fetchBroadcast() {
    try {
      // If specific broadcast ID provided, fetch that one
      if (broadcastId && broadcastId !== 'current') {
        const { data } = await axios.get(`/api/broadcasts/${broadcastId}`)
        setBroadcast(data.broadcast)
      } else {
        // Otherwise fetch active broadcast
        const { data } = await axios.get('/api/broadcasts/active')
        setBroadcast(data.broadcast)
      }
    } catch {
      setBroadcast(null)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChatMessages() {
    const bid = broadcastId || broadcast?.id
    if (!bid) return
    try {
      const { data } = await axios.get(`/api/chat/${bid}`)
      setChatMessages(data.messages || [])
      setOnlineCount(data.messages?.length || 0)
    } catch {
      // Silent fail
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const bid = broadcastId || broadcast?.id
    if (!newMessage.trim() || !bid || !user) return

    try {
      const { data } = await axios.post(`/api/chat/${bid}`, {
        message: newMessage.trim()
      })
      setChatMessages(prev => [...prev, data.message])
      setNewMessage('')
    } catch {
      // Silent fail
    }
  }

  // Get Church Online Platform embed URL
  function getChurchOnlineUrl(): string | null {
    // Only return URL if broadcast has a configured one
    if (broadcast?.church_online_url && broadcast.church_online_url.trim().length > 0) {
      return broadcast.church_online_url
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold)' }} />
      </div>
    )
  }

  if (!broadcast) {
    return (
      <div className="min-h-screen p-6" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
        <Link to="/" className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--dim)' }}>
          <ArrowLeft size={18} />
          Back home
        </Link>
        
        <div className="max-w-md mx-auto text-center py-16">
          <h1 className="font-serif text-2xl mb-4" style={{ fontWeight: 500 }}>No broadcast right now</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--dim)' }}>Check back during scheduled service times or browse the archive.</p>
          <Link to="/archive" className="btn-gold inline-block">Browse archive</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <Link to="/" className="flex items-center gap-2 text-sm" style={{ color: 'var(--dim)' }}>
          <ArrowLeft size={18} />
          Back
        </Link>
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
            {broadcast.status === 'live' ? 'LIVE NOW' : 'ENDED'}
          </div>
          <div className="font-serif text-sm" style={{ fontWeight: 500 }}>{broadcast.title}</div>
        </div>
        <div className="font-mono text-xs flex items-center gap-1" style={{ color: 'var(--dim)' }}>
          <Users size={14} />
          {onlineCount} online
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Player Section - Church Online Platform Embed */}
        <div className={`flex-1 flex flex-col ${showChat ? 'hidden md:block' : ''}`}>
          {getChurchOnlineUrl() ? (
            /* Church Online Platform iframe */
            <div className="flex-1 relative">
              <iframe
                ref={iframeRef}
                src={getChurchOnlineUrl()!}
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
                allow="autoplay; fullscreen"
                allowFullScreen
                title="Live Broadcast"
              />
            </div>
          ) : (
            /* Audio-only placeholder when no Church Online URL configured */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              style={{ background: 'var(--ink-2)' }}>
              <Radio className="w-12 h-12 mb-4" style={{ color: 'var(--gold)' }} />
              <h2 className="text-lg font-medium mb-2">{broadcast.title}</h2>
              <p className="text-sm mb-1" style={{ color: 'var(--dim)' }}>{broadcast.description}</p>
              {broadcast.scripture_reference && (
                <p className="text-xs mt-2" style={{ color: 'var(--gold)' }}>
                  <BookOpen className="w-3 h-3 inline mr-1" />{broadcast.scripture_reference}
                </p>
              )}
              <div className="mt-4 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                Listening via audio stream
              </div>
            </div>
          )}
          
          {/* Stream Audio Player */}
          {broadcast.status === 'live' && <StreamPlayer broadcastId={broadcast.id} />}

          {/* Scripture */}
          {broadcast.scripture_reference && (
            <div
              className="mx-4 mt-4 mb-4 rounded-xl p-4 text-center"
              style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--gold)' }}>
                Now reading
              </div>
              <div className="font-serif text-lg" style={{ fontWeight: 500 }}>
                {broadcast.scripture_reference}
              </div>
            </div>
          )}
        </div>

        {/* Chat Section */}
        {showChat && (
          <div 
            className="w-full md:w-80 border-l flex flex-col"
            style={{ borderColor: 'var(--line)', background: 'var(--ink-2)' }}
          >
            <div className="p-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <h3 className="font-serif" style={{ fontWeight: 500 }}>Chat</h3>
              <p className="text-xs" style={{ color: 'var(--dim)' }}>Be kind and encouraging</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg) => (
                <div key={msg.id}>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--gold-soft)' }}>
                    {msg.user_name}
                  </span>
                  <p className="text-sm">{msg.message}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            {user ? (
              <form onSubmit={sendMessage} className="p-4 border-t" style={{ borderColor: 'var(--line)' }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 rounded-lg px-3 py-2 text-sm border"
                    style={{
                      background: 'var(--ink)',
                      borderColor: 'var(--line)',
                      color: 'var(--parchment)'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: newMessage.trim() ? 'var(--gold)' : 'var(--line)',
                      color: newMessage.trim() ? '#1b1208' : 'var(--dim)'
                    }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 border-t text-center text-sm" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
                <Link to="/login" className="underline" style={{ color: 'var(--gold-soft)' }}>Sign in</Link> to chat
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Chat Toggle */}
      {!showChat && (
        <Link
          to={`/live/${broadcast.id}?chat=1`}
          className="md:hidden fixed bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: 'var(--gold)', color: '#1b1208' }}
        >
          <Users size={20} />
        </Link>
      )}
    </div>
  )
}
