import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Radio, BookOpen, Headphones, FileText, Heart, MessageSquare, Users, Mic2,
  Calendar, DollarSign, Bell, Bookmark, History, User, Settings, Search, Play, Pause,
  Volume2, VolumeX, Send, ChevronRight, TrendingUp, Smartphone, Cross, BookOpenCheck,
  Menu, X
} from 'lucide-react'

/* ─── Types ─── */
interface Broadcast { id: string; title: string; description?: string; scripture_reference?: string; status: string; started_at?: string; broadcaster_id: string }
interface Sermon { id: string; title: string; scripture_reference?: string; speaker?: string; series?: string; duration?: number; date: string; audio_url?: string; video_url?: string; thumbnail_url?: string }
interface Prayer { id: string; name: string | null; request: string; is_anonymous: boolean; prayers_count: number; created_at: string }
interface Testimony { id: string; name: string; content: string; created_at: string }
interface GuestSpeaker { id: string; name: string; topic: string; date: string; photo_url: string }
interface ChatMessage { id: string; user_id?: string; user_name?: string; message: string; created_at: string; is_private?: boolean }

const sidebarNav = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Live Radio', path: '/live', icon: Radio },
  { label: 'Sermons', path: '/archive', icon: BookOpen },
  { label: 'Podcast Archive', path: '/podcasts', icon: Headphones },
  { label: 'Transcripts', path: '/archive', icon: FileText },
  { label: 'Prayer Wall', path: '/prayer', icon: Heart },
  { label: 'Testimonies', path: '/testimonies', icon: MessageSquare },
  { label: 'Community Chat', path: '/live', icon: Users },
  { label: 'Guest Speakers', path: '/events', icon: Mic2 },
  { label: 'Events', path: '/events', icon: Calendar },
  { label: 'Giving & Donations', path: '/donate', icon: DollarSign },
]
const bottomNav = [
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Saved Items', path: '/saved', icon: Bookmark },
  { label: 'Listening History', path: '/history', icon: History },
  { label: 'My Profile', path: '/profile', icon: User },
  { label: 'Settings', path: '/settings', icon: Settings },
]

function Sidebar({ activePath, mobileOpen, onClose }: { activePath: string; mobileOpen?: boolean; onClose?: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      )}
      <aside className={`${mobileOpen ? 'fixed inset-y-0 left-0 z-50 translate-x-0' : 'hidden lg:flex'} flex-col w-60 h-screen lg:h-[calc(100vh-3.5rem)] lg:sticky lg:top-14 border-r border-[rgba(243,238,228,0.08)] bg-[#0f0f14] overflow-y-auto transition-transform duration-300 ${mobileOpen ? '' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c9a227]/10 border border-[#c9a227]/20 flex items-center justify-center">
              <Cross className="w-5 h-5 text-[#c9a227]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">ZIONITEFM</p>
              <p className="text-[10px] text-[#9c958a]">The Voice of Redemption</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-[#9c958a] p-1"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#9c958a] mb-3 ml-2">Menu</p>
        <nav className="space-y-0.5">
          {sidebarNav.map(item => {
            const active = activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path))
            const Icon = item.icon
            return (
              <Link key={item.label} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-[#c9a227]/10 text-[#c9a227]' : 'text-[#9c958a] hover:text-white hover:bg-[rgba(243,238,228,0.04)]'}`}>
                <Icon className="w-4 h-4" /> {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="mt-auto p-5 border-t border-[rgba(243,238,228,0.08)]">
        <nav className="space-y-0.5">
          {bottomNav.map(item => {
            const active = activePath === item.path
            const Icon = item.icon
            return (
              <Link key={item.label} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-[#c9a227]/10 text-[#c9a227]' : 'text-[#9c958a] hover:text-white hover:bg-[rgba(243,238,228,0.04)]'}`}>
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-5 rounded-xl p-4 bg-gradient-to-br from-[#1c1d24] to-[#14141a] border border-[rgba(243,238,228,0.08)]">
          <p className="text-[10px] text-[#9c958a] mb-2">Download ZioniteFM App</p>
          <p className="text-[10px] text-[#9c958a] mb-3">Take the presence of God with you everywhere.</p>
          <button className="w-full rounded-lg bg-[#c9a227] text-[#1b1208] text-[10px] font-medium py-1.5 flex items-center justify-center gap-1">
            <Smartphone className="w-3 h-3" /> Get App
          </button>
        </div>
      </div>
    </aside>
    </>
  )
}

function AudioBars({ active }: { active: boolean }) {
  const bars = [20,45,70,35,85,50,65,40,75,30,60,45,80,55,35,70,40,85,50,60,30,55,75,45,65,80,40,60,70,50]
  return (
    <div className="flex items-center gap-[2px] h-10 justify-center">
      {bars.map((h,i) => {
        const isActive = active && i%3===0
        return (
          <span key={i} className="w-[2.5px] rounded-full bg-[#c9a227]/60"
            style={{height: isActive?`${h}%`:'30%', animation: isActive?'pulse 1.2s ease-in-out infinite':undefined, animationDelay: isActive?`${i*0.05}s`:undefined}} />
        )
      })}
    </div>
  )
}

function LivePlayerHero({ broadcast, isPlaying, setIsPlaying, isMuted, setIsMuted }: any) {
  const isLive = broadcast?.status==='live'
  return (
    <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-gradient-to-br from-[#1c1d24] to-[#14141a] overflow-hidden mb-5">
      <div className="relative">
        <div className="aspect-[21/9] md:aspect-[3/1] bg-gradient-to-r from-[#2a2518] via-[#1a1810] to-[#14141a] flex items-center justify-center overflow-hidden">
          <img src="https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1200&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#14141a]/80 via-transparent to-[#14141a]/60" />
          <div className="relative flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 px-5 md:px-8 pb-5 md:pb-6 pt-8 md:pt-0 w-full">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-[#3a3218] to-[#1a1810] flex items-center justify-center border border-[#c9a227]/20 shrink-0">
              <Radio className="w-7 h-7 md:w-9 md:h-9 text-[#c9a227]/60" />
            </div>
            <div className="text-center md:text-left flex-1">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1.5">
                {isLive && (
                  <span className="inline-flex items-center gap-1 bg-[#8a3326] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE ON AIR
                  </span>
                )}
                <span className="text-[10px] text-[#9c958a] uppercase tracking-wider">ZioniteFM Live Radio</span>
              </div>
              <h2 className="font-serif text-lg md:text-xl font-medium text-white">{broadcast?.title || 'No broadcast currently live'}</h2>
              {broadcast?.description && <p className="text-xs text-[#9c958a] mt-0.5">{broadcast.description}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={()=>setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-[#c9a227] hover:bg-[#e0bd5a] flex items-center justify-center transition-colors">
                {isPlaying ? <Pause className="w-5 h-5 text-[#1b1208] fill-current" /> : <Play className="w-5 h-5 text-[#1b1208] fill-current ml-0.5" />}
              </button>
              <button onClick={()=>setIsMuted(!isMuted)} className="w-10 h-10 rounded-full bg-[rgba(243,238,228,0.08)] hover:bg-[rgba(243,238,228,0.12)] flex items-center justify-center transition-colors">
                {isMuted ? <VolumeX className="w-4 h-4 text-[#9c958a]" /> : <Volume2 className="w-4 h-4 text-[#9c958a]" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-8 py-4">
        <AudioBars active={isLive && isPlaying} />
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-[#9c958a] uppercase tracking-wider">Status</p>
              <p className="text-lg font-semibold text-white">{isLive ? <span className="text-[#4ade80] text-xs font-normal">● LIVE</span> : <span className="text-xs font-normal text-[#9c958a]">OFFLINE</span>}</p>
            </div>
            <div className="h-8 w-px bg-[rgba(243,238,228,0.08)]" />
            <div>
              <p className="text-[10px] text-[#9c958a] uppercase tracking-wider">Stream Quality</p>
              <p className="text-xs text-white font-medium">High <TrendingUp className="w-3 h-3 text-[#4ade80] inline ml-1" /></p>
            </div>
          </div>
          <Link to={broadcast?`/live/${broadcast.id}`:'/live'} className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium px-4 py-2 rounded-full transition-colors">
            <Headphones className="w-3.5 h-3.5" /> Open Player
          </Link>
        </div>
      </div>
    </div>
  )
}

function QuickCard({ icon: Icon, title, subtitle, actionLabel, to, accent }: any) {
  return (
    <Link to={to} className="group block rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover:border-[rgba(243,238,228,0.15)] transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <ChevronRight className="w-4 h-4 text-[#9c958a] group-hover:text-[#c9a227] transition-colors" />
      </div>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      <p className="text-xs text-[#9c958a] leading-relaxed mb-4">{subtitle}</p>
      <span className="inline-flex items-center text-[11px] font-medium text-[#c9a227] bg-[#c9a227]/10 px-3 py-1.5 rounded-lg">{actionLabel}</span>
    </Link>
  )
}

function SermonRow({ s }: { s: Sermon }) {
  return (
    <Link to={`/archive/${s.id}`} className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-[rgba(243,238,228,0.04)] transition-colors">
      <div className="relative w-10 h-10 rounded-lg bg-[#14141a] overflow-hidden shrink-0">
        {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <BookOpen className="w-4 h-4 text-[#9c958a] m-2.5" />}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-3 h-3 text-white fill-white" />
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate group-hover:text-[#c9a227] transition-colors">{s.title}</p>
        <p className="text-[10px] text-[#9c958a]">{s.speaker || 'Pastor'} · {new Date(s.date).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[#9c958a]">{s.duration ? Math.round(s.duration/60)+' min' : '45 min'}</span>
        <Bookmark className="w-3.5 h-3.5 text-[#9c958a]" />
      </div>
    </Link>
  )
}

/* ─── MemberDashboard ─── */
export default function MemberDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [broadcast, setBroadcast] = useState<Broadcast|null>(null)
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [prayers, setPrayers] = useState<Prayer[]>([])
  const [testimonies, setTestimonies] = useState<Testimony[]>([])
  const [guestSpeaker, setGuestSpeaker] = useState<GuestSpeaker|null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(()=>{
    if (!user) { navigate('/login'); return }
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return ()=>clearInterval(iv)
  }, [user, navigate])

  async function fetchData() {
    try {
      const [br, sr, pr, tr, gs] = await Promise.all([
        axios.get('/api/broadcasts/active').catch(()=>({data:{broadcast:null}})),
        axios.get('/api/sermons?limit=5').catch(()=>({data:{sermons:[]}})),
        axios.get('/api/prayer?limit=3').catch(()=>({data:{prayers:[]}})),
        axios.get('/api/testimonies?limit=1').catch(()=>({data:{testimonies:[]}})),
        axios.get('/api/guest-speakers').catch(()=>({data:{speakers:[]}})),
      ])
      setBroadcast(br.data.broadcast)
      setSermons(sr.data.sermons||[])
      setPrayers(pr.data.prayers||[])
      setTestimonies(tr.data.testimonies||[])
      setGuestSpeaker((gs.data.speakers||[])[0]||null)
      if (br.data.broadcast?.id) {
        const chat = await axios.get(`/api/chat/${br.data.broadcast.id}`).catch(()=>({data:{messages:[]}}))
        setChatMessages(chat.data.messages?.slice(-10)||[])
      }
    } catch {}
  }

  async function handlePrayFor(id: string) {
    try { await axios.post(`/api/prayer/${id}/pray`) } catch {}
    setPrayers(prev=>prev.map(p=>p.id===id?{...p, prayers_count:(p.prayers_count||0)+1}:p))
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  if (!user) return null

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen pb-16 lg:pb-0" style={{background:'var(--ink)', color:'var(--parchment)'}}>
      <div className="max-w-[1440px] mx-auto flex">
        <Sidebar activePath={location.pathname} mobileOpen={mobileSidebarOpen} onClose={()=>setMobileSidebarOpen(false)} />
        <main className="flex-1 min-w-0 px-3 sm:px-4 md:px-6 py-4 md:py-6">
          {/* Mobile header bar */}
          <div className="lg:hidden flex items-center justify-between mb-4">
            <button onClick={()=>setMobileSidebarOpen(true)} className="flex items-center gap-2 text-[#9c958a]">
              <Menu className="w-5 h-5" />
              <span className="text-xs">Menu</span>
            </button>
            <div className="flex items-center gap-2">
              <button className="relative w-8 h-8 rounded-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] flex items-center justify-center">
                <Bell className="w-4 h-4 text-[#9c958a]" />
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#8a3326]" />
              </button>
              <div className="w-8 h-8 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] text-xs font-bold">
                {user.name?.[0]?.toUpperCase()||'L'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-9 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs text-[#9c958a]">{greeting()},</p>
                  <h1 className="text-xl font-serif font-medium text-white">Welcome back, {user.name?.split(' ')[0]||'Listener'}! 👋</h1>
                  <p className="text-xs text-[#9c958a] mt-0.5">We&apos;re glad to have you with us today. Stay connected, be blessed.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden md:flex items-center bg-[#1c1d24] rounded-full px-3 py-1.5 border border-[rgba(243,238,228,0.08)]">
                    <Search className="w-3.5 h-3.5 text-[#9c958a] mr-2" />
                    <input type="text" placeholder="Search sermons, topics, speakers..." className="bg-transparent text-xs text-white placeholder-[#9c958a] outline-none w-44" />
                  </div>
                  <button className="relative w-9 h-9 rounded-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] flex items-center justify-center">
                    <Bell className="w-4 h-4 text-[#9c958a]" />
                    <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#8a3326]" />
                  </button>
                  <div className="flex items-center gap-2 pl-2 border-l border-[rgba(243,238,228,0.08)]">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-white font-medium">{user.name}</p>
                      <p className="text-[10px] text-[#9c958a] capitalize">{user.role}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] text-xs font-bold">
                      {user.name?.[0]?.toUpperCase()||'L'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Player */}
              <LivePlayerHero broadcast={broadcast} isPlaying={isPlaying} setIsPlaying={setIsPlaying} isMuted={isMuted} setIsMuted={setIsMuted} />

              {/* Quick Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <QuickCard icon={BookOpen} title="Sermon Library" subtitle="Grow in the Word. Explore life-changing messages." actionLabel="Explore" to="/archive" accent="bg-[#c9a227]/10 text-[#c9a227]" />
                <QuickCard icon={Headphones} title="Podcast Archive" subtitle="Listen anytime, anywhere. Inspiring messages on the go." actionLabel="Browse" to="/podcasts" accent="bg-[#4ade80]/10 text-[#4ade80]" />
                <QuickCard icon={BookOpenCheck} title="Sermon Transcripts" subtitle="Read, study, download. Auto-generated transcripts for deeper understanding." actionLabel="View Transcripts" to="/archive" accent="bg-[#f472b6]/10 text-[#f472b6]" />
              </div>
              {/* Prayer / Testimony / Chat */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Prayer Wall */}
                <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-[#c9a227]" /><h3 className="text-sm font-medium text-white">Live Prayer Wall</h3></div>
                    <Link to="/prayer" className="text-[11px] text-[#c9a227]">View all</Link>
                  </div>
                  <div className="space-y-3 mb-4">
                    {prayers.map(p=> (
                      <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#14141a]">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a227]/20 to-[#8a3326]/20 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-[#c9a227]" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white">{p.is_anonymous?'Anonymous':(p.name||'Anonymous')}</p>
                          <p className="text-[11px] text-[#9c958a] mt-0.5 line-clamp-2">{p.request}</p>
                        </div>
                        <button onClick={()=>handlePrayFor(p.id)} className="shrink-0 text-[10px] text-[#c9a227] border border-[#c9a227]/20 px-2 py-1 rounded-lg hover:bg-[#c9a227]/10 transition-colors">Pray</button>
                      </div>
                    ))}
                    {prayers.length===0 && <p className="text-xs text-[#9c958a] text-center py-4">No prayers yet. Be the first!</p>}
                  </div>
                </div>

                {/* Testimony Corner */}
                <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#c9a227]" /><h3 className="text-sm font-medium text-white">Testimony Corner</h3></div>
                    <Link to="/testimonies" className="text-[11px] text-[#c9a227]">View all</Link>
                  </div>
                  {testimonies.length>0 ? (
                    <div className="p-4 rounded-xl bg-[#14141a] mb-4">
                      <p className="text-xs text-[#9c958a] leading-relaxed line-clamp-4">&ldquo;{testimonies[0].content}&rdquo;</p>
                      <p className="text-[11px] text-[#c9a227] mt-2">— {testimonies[0].name}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-[#14141a] mb-4 text-center">
                      <p className="text-xs text-[#9c958a]">No testimonies yet. Be the first to share!</p>
                    </div>
                  )}
                  <button className="w-full py-2.5 rounded-lg bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium transition-colors">Share Your Testimony</button>
                </div>

                {/* Community Chat */}
                <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><Users className="w-4 h-4 text-[#c9a227]" /><h3 className="text-sm font-medium text-white">Community Chat</h3></div>
                    <Link to={broadcast?`/live/${broadcast.id}`:'/live'} className="text-[11px] text-[#c9a227]">Join chat</Link>
                  </div>
                  <div className="flex-1 space-y-3 mb-4 min-h-[120px]">
                    {chatMessages.map(msg => {
                      const initials = (msg.user_name || 'Guest').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                      const colors = ['#c9a227','#4ade80','#f472b6','#60a5fa','#a855f7']
                      const color = colors[(msg.user_name || 'G').charCodeAt(0) % colors.length]
                      return (
                        <div key={msg.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{background:`${color}20`}}>
                            <span className="text-[10px] font-bold" style={{color}}>{initials}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-white">{msg.user_name || 'Guest'}</span>
                              <span className="text-[10px] text-[#9c958a]">{new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                            <p className="text-[11px] text-[#9c958a] mt-0.5">{msg.message}</p>
                          </div>
                        </div>
                      )
                    })}
                    {chatMessages.length===0 && <p className="text-xs text-[#9c958a] text-center py-4">No messages yet. Join the live stream to chat!</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="Type your message..." className="flex-1 bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#9c958a] outline-none focus:border-[#c9a227]/30" />
                    <button className="w-8 h-8 rounded-lg bg-[#c9a227] hover:bg-[#e0bd5a] flex items-center justify-center transition-colors"><Send className="w-3.5 h-3.5 text-[#1b1208]" /></button>
                  </div>
                </div>
              </div>
              {/* Listening History + Saved Sermons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white">Listening History</h3>
                    <Link to="/history" className="text-[11px] text-[#c9a227]">View all</Link>
                  </div>
                  <div className="space-y-1">
                    {sermons.slice(0,3).map(s=> <SermonRow key={s.id} s={s} />)}
                    {sermons.length===0 && <p className="text-xs text-[#9c958a] text-center py-4">No listening history yet.</p>}
                  </div>
                </div>
                <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white">Saved Sermons</h3>
                    <Link to="/saved" className="text-[11px] text-[#c9a227]">View all</Link>
                  </div>
                  <div className="space-y-1">
                    {sermons.slice(0,3).map(s=> <SermonRow key={s.id} s={s} />)}
                    {sermons.length===0 && <p className="text-xs text-[#9c958a] text-center py-4">No saved sermons yet.</p>}
                  </div>
                </div>
              </div>
            </div>
            <div className="xl:col-span-3 space-y-5">
              {/* Notifications */}
              <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2"><Bell className="w-4 h-4 text-[#c9a227]" /><h3 className="text-sm font-medium text-white">Notifications</h3></div>
                  <span className="text-[11px] text-[#c9a227]">View all</span>
                </div>
                <div className="space-y-3">
                  <p className="text-xs text-[#9c958a] text-center py-4">No new notifications.</p>
                </div>
              </div>

              {/* Upcoming Guest Speaker */}
              <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white">Upcoming Guest Speaker</h3>
                  <span className="text-[11px] text-[#c9a227]">View all</span>
                </div>
                <div className="rounded-xl overflow-hidden bg-[#14141a] mb-4">
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#2a2518] to-[#14141a] flex items-center justify-center">
                    {guestSpeaker?.photo_url ? (
                      <img src={guestSpeaker.photo_url} alt={guestSpeaker.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#3a3218] to-[#1a1810] flex items-center justify-center border border-[#c9a227]/20">
                        <Mic2 className="w-8 h-8 text-[#c9a227]/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-medium text-white">{guestSpeaker?.name || 'No upcoming guest speaker'}</p>
                    <p className="text-[11px] text-[#9c958a] mt-0.5">{guestSpeaker?.topic || 'Check back soon for updates.'}</p>
                    {guestSpeaker?.date && <p className="text-[10px] text-[#9c958a] mt-1">{new Date(guestSpeaker.date).toLocaleDateString()} · 6:00 PM</p>}
                    <button className="mt-3 w-full py-2 rounded-lg bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium transition-colors">Set Reminder</button>
                  </div>
                </div>
              </div>

              {/* Support the Mission */}
              <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <div className="aspect-[16/9] rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-[#2a2518] to-[#14141a] flex items-center justify-center">
                  <Heart className="w-8 h-8 text-[#c9a227]/40" />
                </div>
                <h3 className="text-sm font-medium text-white mb-1">Support the Mission</h3>
                <p className="text-[11px] text-[#9c958a] mb-4">Your giving makes an eternal impact.</p>
                <button className="w-full py-2.5 rounded-lg bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium transition-colors">Give Now</button>
              </div>

              {/* Never Miss a Moment */}
              <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a227]/20 to-[#8a3326]/20 flex items-center justify-center"><Bell className="w-5 h-5 text-[#c9a227]" /></div>
                  <div><h3 className="text-sm font-medium text-white">Never Miss a Moment</h3><p className="text-[11px] text-[#9c958a]">Enable push notifications</p></div>
                </div>
                <button className="w-full py-2.5 rounded-lg bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium transition-colors">Enable Notifications</button>
              </div>
            </div>
          </div>
          {/* Footer */}
          <div className="mt-8 py-4 border-t border-[rgba(243,238,228,0.08)] flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <Cross className="w-4 h-4 text-[#c9a227]" />
              <span className="text-xs text-[#9c958a]">ZIONITEFM – <span className="text-[10px] uppercase tracking-wider">The Voice of Redemption</span></span>
            </div>
            <p className="text-[10px] text-[#9c958a] italic">&ldquo;Go into all the world and preach the gospel to all creation.&rdquo; – Mark 16:15</p>
          </div>
        </main>
      </div>
      {/* Mobile bottom nav */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[rgba(243,238,228,0.08)] bg-[#0f0f14]/95 backdrop-blur-md flex items-center justify-around py-2">
        {[
          {icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard'},
          {icon: Radio, label: 'Live', path: '/live'},
          {icon: BookOpen, label: 'Sermons', path: '/archive'},
          {icon: Heart, label: 'Prayer', path: '/prayer'},
          {icon: Settings, label: 'More', path: '/settings'},
        ].map(item => {
          const active = location.pathname === item.path
          const Icon = item.icon
          return (
            <Link key={item.label} to={item.path} className="flex flex-col items-center gap-0.5 px-2 py-1">
              <Icon className={`w-5 h-5 ${active ? 'text-[#c9a227]' : 'text-[#9c958a]'}`} />
              <span className={`text-[10px] ${active ? 'text-[#c9a227]' : 'text-[#9c958a]'}`}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
