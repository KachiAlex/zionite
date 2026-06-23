import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useBroadcasts, useSermons, useUsers, usePrayers, useMusic, useDashboardAnalytics } from '../lib/api'
import {
  Users, Radio, Headphones, LayoutDashboard, MessageSquare, Settings, Music, Mic2, Heart, Calendar,
  Search, Bell, ChevronDown, BookOpen, DollarSign, Pause, StopCircle, BarChart3, Shield, Sparkles,
  Menu, X, Loader2
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const BroadcastManager = lazy(() => import('../components/admin/BroadcastManager'))
const SermonManager = lazy(() => import('../components/admin/SermonManager'))
const ChatSupervisor = lazy(() => import('../components/admin/ChatSupervisor'))
const AdminSettings = lazy(() => import('../components/admin/AdminSettings'))
const MusicManager = lazy(() => import('../components/admin/MusicManager'))
const GuestSpeakerManager = lazy(() => import('../components/admin/GuestSpeakerManager'))
const PrayerManager = lazy(() => import('../components/admin/PrayerManager'))
const TestimonyManager = lazy(() => import('../components/admin/TestimonyManager'))
const EventManager = lazy(() => import('../components/admin/EventManager'))

interface ChatMessage { id: string; broadcast_id?: string; user_name: string; message: string; created_at: string }

type Tab = 'dashboard' | 'broadcasts' | 'users' | 'sermons' | 'chat' | 'settings' | 'music' | 'speakers' | 'prayer' | 'testimonies' | 'events'

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function LiveWaveform({ active }: { active: boolean }) {
  const [bars, setBars] = useState<number[]>(Array.from({ length: 40 }, () => 15))
  useEffect(() => {
    if (!active) { setBars(Array.from({ length: 40 }, () => 15)); return }
    const id = setInterval(() => {
      setBars(Array.from({ length: 40 }, () => Math.max(10, Math.min(100, Math.random() * 90 + 10))))
    }, 200)
    return () => clearInterval(id)
  }, [active])
  return (
    <div className="flex items-end gap-[2px] h-8 my-2">
      {bars.map((h, i) => (
        <div key={i} className={`w-[3px] rounded-full transition-all duration-200 ${active ? 'bg-[#c9a227]' : 'bg-[#c9a227]/30'}`} style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: broadcasts = [] } = useBroadcasts()
  const { data: sermons = [] } = useSermons()
  const { data: users = [] } = useUsers()
  const { data: musicTracks = [] } = useMusic()
  const { data: prayers = [] } = usePrayers()
  const { data: analytics } = useDashboardAnalytics()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [bcActionLoading, setBcActionLoading] = useState(false)
  const [liveElapsed, setLiveElapsed] = useState(0)

  /* ── Live broadcast duration timer ── */
  useEffect(() => {
    const live = broadcasts.find(b => b.status === 'live')
    if (!live?.started_at) { setLiveElapsed(0); return }
    const start = new Date(live.started_at).getTime()
    setLiveElapsed(Math.floor((Date.now() - start) / 1000))
    const id = setInterval(() => setLiveElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [broadcasts])

  const dashboard = analytics?.stats ?? null
  const platformData = analytics?.platformBreakdown ?? []
  const pendingTestimonies = analytics?.pendingTestimonies ?? []
  const recentDonations = analytics?.recentDonations ?? []
  const campaigns = analytics?.activeCampaigns ?? []
  const transcripts = analytics?.transcripts ?? []
  const listenerChart = analytics?.listenerHistory ?? []
  const loading = !analytics

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
  }, [user, navigate])

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    queryClient.invalidateQueries({ queryKey: ['sermons'] })
    queryClient.invalidateQueries({ queryKey: ['users'] })
    queryClient.invalidateQueries({ queryKey: ['music'] })
    queryClient.invalidateQueries({ queryKey: ['prayers'] })
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
  }

  async function fetchChat() {
    try {
      const res = await axios.get('/api/broadcasts')
      const bcs = res.data.broadcasts as any[]
      const allMessages: ChatMessage[] = []
      for (const b of bcs.slice(0, 5)) {
        try { const msgRes = await axios.get(`/api/chat/broadcast/${b.id}`); allMessages.push(...msgRes.data.messages) } catch {}
      }
      try { const general = await axios.get('/api/chat/general'); allMessages.push(...general.data.messages) } catch {}
      setChatMessages(allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (err) { console.error('Failed to fetch chat:', err) }
  }

  useEffect(() => {
    if (activeTab === 'chat') { fetchChat(); const iv = setInterval(fetchChat, 5000); return () => clearInterval(iv) }
  }, [activeTab])

  async function updateUserRole(userId: string, newRole: string) {
    const token = localStorage.getItem('token')
    try {
      await axios.patch(`/api/auth/users/${userId}/role`, { role: newRole }, { headers: { Authorization: `Bearer ${token}` } })
      queryClient.setQueryData(['users'], (old: any) => old?.map((u: any) => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to update role') }
  }

  /* ── Broadcast control helpers ── */
  async function endLiveBroadcast() {
    const live = broadcasts.find(b => b.status === 'live')
    if (!live) return
    setBcActionLoading(true)
    try {
      await axios.post(`/api/stream/${live.id}/stop`)
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to end broadcast')
    } finally {
      setBcActionLoading(false)
    }
  }

  async function pauseLiveBroadcast() {
    const live = broadcasts.find(b => b.status === 'live')
    if (!live) return
    setBcActionLoading(true)
    try {
      await axios.post(`/api/stream/${live.id}/pause`)
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to pause broadcast')
    } finally {
      setBcActionLoading(false)
    }
  }

  if (!user || user.role !== 'admin') return null

  function SB({label,tab,icon:I,badge}:any){const a=activeTab===tab;return(<button onClick={()=>setActiveTab(tab)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] transition-colors ${a?'bg-[#c9a227] text-[#1b1208] font-semibold':'text-[#9c958a] hover:text-white hover:bg-[rgba(243,238,228,0.05)]'}`}><I className="w-3.5 h-3.5"/><span className="flex-1 text-left">{label}</span>{badge?<span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${a?'bg-[#1b1208]/20':'bg-[#ef4444] text-white'}`}>{badge}</span>:null}</button>)}
  function SL({t}:{t:string}){return<p className="px-3 text-[9px] font-bold uppercase tracking-wider text-[#9c958a]/40 mb-1 mt-3">{t}</p>}

  const sidebarContent = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#c9a227] flex items-center justify-center flex-shrink-0"><Radio className="w-4 h-4 text-[#1b1208]"/></div>
          <div><div className="text-sm font-bold text-white tracking-wide">ZIONITEFM</div><div className="text-[8px] text-[#9c958a] tracking-wider uppercase">The Voice of Redemption</div></div>
        </div>
        <button onClick={()=>setMobileSidebarOpen(false)} className="lg:hidden text-[#9c958a] p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className="mb-5 p-2.5 rounded-lg bg-[rgba(201,162,39,0.06)] border border-[rgba(201,162,39,0.12)]"><p className="text-[8px] text-[#9c958a] uppercase tracking-wider mb-0.5">The Redemption Project</p><p className="text-[10px] text-[#c9a227]">Digital Radio Ministry</p></div>
      <SB label="Dashboard" tab="dashboard" icon={LayoutDashboard}/>
      <SL t="Ministry Management"/>
      <SB label="Sermons" tab="sermons" icon={BookOpen}/>
      <SB label="Speakers" tab="speakers" icon={Mic2}/>
      <SB label="Events" tab="events" icon={Calendar}/>
      <SB label="Prayer Requests" tab="prayer" icon={Heart} badge={prayers.length}/>
      <SB label="Testimonies" tab="testimonies" icon={Sparkles}/>
      <SL t="Broadcast Management"/>
      <SB label="Live Broadcast" tab="broadcasts" icon={Radio}/>
      <SB label="Auto DJ" tab="music" icon={Music}/>
      <SB label="Stream Analytics" tab="dashboard" icon={BarChart3}/>
      <SL t="Community"/>
      <SB label="Chat Moderation" tab="chat" icon={MessageSquare} badge={chatMessages.length}/>
      <SB label="User Management" tab="users" icon={Users}/>
      <SB label="Reported Content" tab="chat" icon={Shield}/>
      <SL t="Settings"/>
      <SB label="System Settings" tab="settings" icon={Settings}/>
    </div>
  )

  return(
    <div className="min-h-screen flex" style={{background:'#0c0c12',color:'#f3eee4'}}>
      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={()=>setMobileSidebarOpen(false)} />
      )}

      {/* Mobile sidebar (fixed overlay) */}
      {mobileSidebarOpen && (
        <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-56 flex-col border-r border-[rgba(243,238,228,0.06)] bg-[#111118] overflow-y-auto">
          {sidebarContent}
        </aside>
      )}

      {/* Desktop sidebar (normal flex item) */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-[rgba(243,238,228,0.06)] bg-[#111118] overflow-y-auto">
        {sidebarContent}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[rgba(243,238,228,0.06)] bg-[#111118]/80 backdrop-blur-md flex items-center justify-between px-3 sm:px-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={()=>setMobileSidebarOpen(true)} className="lg:hidden text-[#9c958a] p-1"><Menu className="w-5 h-5" /></button>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-sm text-white font-medium">Welcome back,</span>
              <span className="text-sm font-bold text-white">{user.name||'Admin'}</span>
              <span className="hidden sm:inline text-[9px] px-2 py-0.5 rounded-full bg-[#c9a227]/10 text-[#c9a227] border border-[#c9a227]/20">System Administrator</span>
            </div>
            <div className="hidden xl:block text-xs text-[#9c958a] italic border-l border-[rgba(243,238,228,0.1)] pl-4">"Go into all the world and preach the gospel to all creation." — Mark 16:15</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center bg-[#1c1d24] rounded-full px-3 py-1.5 border border-[rgba(243,238,228,0.08)]"><Search className="w-3.5 h-3.5 text-[#9c958a] mr-2"/><input type="text" placeholder="Search..." className="bg-transparent text-xs text-white placeholder-[#9c958a] outline-none w-20"/></div>
            <button className="relative p-2 text-[#9c958a] hover:text-white transition-colors"><Bell className="w-4 h-4"/><span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#ef4444] rounded-full"/></button>
            <div className="flex items-center gap-2 pl-2 border-l border-[rgba(243,238,228,0.1)]">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#c9a227] to-[#e0bd5a] flex items-center justify-center text-[#1b1208] text-[10px] font-bold">{user.name?.[0]?.toUpperCase()||'A'}</div>
              <div className="hidden sm:block"><p className="text-[11px] font-medium text-white">{user.name||'Admin'}</p><p className="text-[9px] text-[#9c958a]">Super Admin</p></div>
              <ChevronDown className="w-3 h-3 text-[#9c958a]"/>
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[#9c958a] border-l border-[rgba(243,238,228,0.1)] pl-3"><Calendar className="w-3 h-3"/><span>May 20, 2025</span></div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          {activeTab==='dashboard'?(
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  {icon:Users,label:'Listeners Online',value:dashboard?.listenersOnline?.toLocaleString()||'0',chg:'Live',sub:'Active now',bg:'rgba(139,124,248,0.12)',col:'#8b7cf8'},
                  {icon:Headphones,label:'Total Listeners',value:dashboard?.totalListenersToday?.toLocaleString()||'0',chg:'24h',sub:'Total sessions',bg:'rgba(59,130,246,0.12)',col:'#3b82f6'},
                  {icon:BookOpen,label:'Sermons',value:dashboard?.sermonCount?.toLocaleString()||String(sermons.length||0),chg:'',sub:'Total Uploads',bg:'rgba(74,222,128,0.12)',col:'#4ade80'},
                  {icon:Heart,label:'Prayer Requests',value:dashboard?.prayerCount?.toLocaleString()||String(prayers.length||0),chg:'',sub:`Pending`,bg:'rgba(239,68,68,0.12)',col:'#ef4444'},
                  {icon:DollarSign,label:'Total Donations',value:dashboard?.totalDonations?`$${Number(dashboard.totalDonations).toLocaleString()}`:'$0',chg:'',sub:'All time',bg:'rgba(201,162,39,0.12)',col:'#c9a227'},
                ].map((c,i)=>{
                  const staggerClass = i < 6 ? `stagger-${i+1}` : ''
                  return (
                  <div key={i} className={`p-3.5 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] hover-lift animate-slide-up ${staggerClass}`}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 transition-transform duration-300 hover:scale-110" style={{background:c.bg}}><c.icon className="w-4 h-4" style={{color:c.col}}/></div>
                    <p className="text-[10px] text-[#9c958a]">{c.label}</p>
                    <p className="text-lg font-bold text-white mt-0.5">{c.value}</p>
                    <div className="flex items-center gap-1 mt-0.5">{c.chg?<span className="text-[9px] text-[#4ade80]">{c.chg}</span>:null}<span className="text-[9px] text-[#9c958a]">{c.sub}</span></div>
                  </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {(()=>{const live=broadcasts.find(b=>b.status==='live');return(
                <div className="lg:col-span-5 p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-white tracking-wide">LIVE BROADCAST CONTROL</h3>
                    <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${live?'text-[#ef4444] bg-[#ef4444]/10':'text-[#9c958a] bg-[rgba(243,238,228,0.06)]'}`}>{live?<><span className="w-1.5 h-1.5 bg-[#ef4444] rounded-full animate-pulse"/>LIVE</>:'OFFLINE'}</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-28 h-28 rounded-lg bg-gradient-to-br from-[#2a1f3d] to-[#1a1025] flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {live?.thumbnail_url ? (
                        <img src={live.thumbnail_url} alt={live.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center leading-tight px-2"><div className="text-sm font-bold text-[#c9a227]">ZIONITE</div><div className="text-sm font-bold text-[#c9a227]">FM</div><div className="text-[10px] text-[#9c958a] mt-1">Live</div></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1"><span className={`text-[9px] font-bold uppercase ${live?'text-[#ef4444]':'text-[#9c958a]'}`}>{live?'On Air Now':'No Active Broadcast'}</span><h4 className="text-xs font-bold text-white mt-0.5 truncate">{live?.title||'Start a broadcast'}</h4><p className="text-[11px] text-[#9c958a]">{live?.speaker ? `${live.speaker} • ` : ''}{live?'Live Session':'No stream data'}</p></div>
                      <LiveWaveform active={!!live} />
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Listeners</p><p className="text-xs font-bold text-white">{dashboard?.listenersOnline ?? 0}</p></div>
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Quality</p><p className="text-xs font-bold text-[#4ade80]">{live ? 'Good' : '—'}</p></div>
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Duration</p><p className="text-xs font-bold text-white">{live ? formatDuration(liveElapsed) : '00:00:00'}</p></div>
                      </div>
                      <div className="flex gap-1.5 mt-3">
                        {live ? (
                          <>
                            <button onClick={endLiveBroadcast} disabled={bcActionLoading}
                              className="flex-1 flex items-center justify-center gap-1 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-[10px] font-medium py-1.5 rounded-md border border-[#ef4444]/20 disabled:opacity-50">
                              {bcActionLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <StopCircle className="w-3 h-3"/>} Stop
                            </button>
                            <button onClick={pauseLiveBroadcast} disabled={bcActionLoading}
                              className="flex-1 flex items-center justify-center gap-1 bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.1)] text-white text-[10px] font-medium py-1.5 rounded-md border border-[rgba(243,238,228,0.08)] disabled:opacity-50">
                              {bcActionLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Pause className="w-3 h-3"/>} Pause
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setActiveTab('broadcasts')}
                            className="flex-1 flex items-center justify-center gap-1 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] text-[10px] font-medium py-1.5 rounded-md border border-[#4ade80]/20">
                            <Radio className="w-3 h-3"/> Go Live
                          </button>
                        )}
                        <button onClick={() => setActiveTab('broadcasts')}
                          className="flex-1 flex items-center justify-center gap-1 bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.1)] text-white text-[10px] font-medium py-1.5 rounded-md border border-[rgba(243,238,228,0.08)]">
                          <Settings className="w-3 h-3"/> Studio
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                )})()}
                <div className="lg:col-span-4 p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-white tracking-wide">LISTENER STATISTICS</h3>
                    <select className="text-[9px] bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-md px-2 py-1 text-[#9c958a] outline-none"><option>Today</option></select>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="flex items-center gap-1 text-[9px]"><span className="w-1.5 h-1.5 rounded-full bg-[#c9a227]"/>Listeners</span>
                    <span className="flex items-center gap-1 text-[9px]"><span className="w-1.5 h-1.5 rounded-full bg-[#8b7cf8]"/>Unique</span>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={listenerChart.length?listenerChart:[{time:'12AM',l:0,u:0},{time:'4AM',l:0,u:0},{time:'8AM',l:0,u:0},{time:'12PM',l:0,u:0},{time:'4PM',l:0,u:0},{time:'8PM',l:0,u:0}]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,238,228,0.06)"/>
                      <XAxis dataKey="time" stroke="#9c958a" fontSize={9} tickLine={false} axisLine={false}/>
                      <YAxis stroke="#9c958a" fontSize={9} tickLine={false} axisLine={false}/>
                      <Tooltip contentStyle={{background:'#1c1d24',border:'1px solid rgba(243,238,228,0.1)',borderRadius:'6px',fontSize:'10px'}}/>
                      <Line type="monotone" dataKey="l" name="Listeners" stroke="#c9a227" strokeWidth={2} dot={{r:2,fill:'#c9a227'}}/>
                      <Line type="monotone" dataKey="u" name="Unique" stroke="#8b7cf8" strokeWidth={2} dot={{r:2,fill:'#8b7cf8'}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="lg:col-span-3 p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <h3 className="text-xs font-semibold text-white tracking-wide mb-3">STREAM ANALYTICS</h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={platformData.length?platformData:[{name:'No Data',value:1}]} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none" paddingAngle={2}>
                        {(platformData.length?platformData:[{name:'No Data',value:1}]).map((_:any,i:number)=><Cell key={i} fill={['#8b7cf8','#c9a227','#4ade80','#f87171','#9ca3af'][i%5]}/>)}
                      </Pie>
                      <Tooltip contentStyle={{background:'#1c1d24',border:'1px solid rgba(243,238,228,0.1)',borderRadius:'6px',fontSize:'10px'}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-1 mb-2"><p className="text-base font-bold text-white">{dashboard?.totalListenersToday?.toLocaleString()||'0'}</p><p className="text-[9px] text-[#9c958a]">Total Streams</p></div>
                  <div className="space-y-1">
                    {platformData.length?platformData.map((s:any,i:number)=>{
                      const total=platformData.reduce((a:number,b:any)=>a+(Number(b.value)||0),0)||1
                      const pct=total?Math.round((Number(s.value)||0)/total*100)+'%':'0%'
                      return(
                        <div key={i} className="flex items-center justify-between text-[9px]"><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{background:['#8b7cf8','#c9a227','#4ade80','#f87171','#9ca3af'][i%5]}}/><span className="text-[#9c958a]">{s.name}</span></div><span className="text-white font-medium">{pct}</span></div>
                      )
                    }):<div className="text-[9px] text-[#9c958a] text-center">No platform data</div>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">RECENT SERMONS</h3><button onClick={()=>setActiveTab('sermons')} className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-[10px] min-w-[320px]">
                    <thead><tr className="text-[#9c958a] border-b border-[rgba(243,238,228,0.06)]"><th className="text-left pb-2 font-normal">Title</th><th className="text-left pb-2 font-normal">Speaker</th><th className="text-left pb-2 font-normal">Date</th><th className="text-left pb-2 font-normal">Status</th></tr></thead>
                    <tbody>
                      {(sermons.length?sermons:[]).slice(0,5).map((s:any)=>(
                        <tr key={s.id} className="border-b border-[rgba(243,238,228,0.04)]"><td className="py-2 text-white font-medium truncate max-w-[100px]">{s.title}</td><td className="py-2 text-[#9c958a]">{s.speaker}</td><td className="py-2 text-[#9c958a]">{s.date?s.date.split('T')[0]:'-'}</td><td className="py-2"><span className="px-1.5 py-0.5 rounded-full bg-[#4ade80]/10 text-[#4ade80] text-[8px]">Published</span></td></tr>
                      ))}
                      {sermons.length===0&&<tr><td colSpan={4} className="py-6 text-center text-[#9c958a]">No sermons uploaded yet</td></tr>}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">PENDING PRAYER REQUESTS</h3><button onClick={()=>setActiveTab('prayer')} className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-2.5">
                    {(prayers.length?prayers:[]).slice(0,5).map((p:any)=>{
                      const initials=(p.name||'A').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                      const timeAgo=p.created_at?(()=>{const m=Math.floor((Date.now()-new Date(p.created_at).getTime())/60000);return m<60?`${m}m ago`:`${Math.floor(m/60)}h ago`;})():''
                      return(
                        <div key={p.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[rgba(243,238,228,0.02)]">
                          <div className="w-7 h-7 rounded-full bg-[rgba(139,124,248,0.15)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#8b7cf8]">{initials}</div>
                          <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-white">{p.is_anonymous?'Anonymous':(p.name||'Unknown')}</span><span className="text-[9px] text-[#9c958a]">{timeAgo}</span></div><p className="text-[10px] text-[#9c958a] mt-0.5 truncate">{p.request}</p></div>
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-[#3b82f6]/10 text-[#3b82f6]">New</span>
                        </div>
                      )
                    })}
                    {prayers.length===0&&<div className="py-6 text-center text-[#9c958a] text-[10px]">No prayer requests yet</div>}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">TESTIMONY APPROVALS</h3><button onClick={()=>setActiveTab('testimonies')} className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-2.5">
                    {(pendingTestimonies.length?pendingTestimonies:[]).slice(0,5).map((t:any)=>{
                      const initials=(t.name||'A').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                      return(
                        <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[rgba(243,238,228,0.02)]">
                          <div className="w-7 h-7 rounded-full bg-[rgba(201,162,39,0.15)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#c9a227]">{initials}</div>
                          <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-white">{t.name}</span><span className="text-[9px] text-[#9c958a]">{t.created_at?t.created_at.split('T')[0]:''}</span></div><p className="text-[10px] text-[#9c958a] mt-0.5 truncate">{t.content}</p></div>
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#f97316]/10 text-[#f97316] font-medium flex-shrink-0">Pending</span>
                        </div>
                      )
                    })}
                    {pendingTestimonies.length===0&&<div className="py-6 text-center text-[#9c958a] text-[10px]">No testimonies pending</div>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="flex-1 py-1.5 rounded-md bg-[#4ade80]/10 text-[#4ade80] text-[10px] font-medium border border-[#4ade80]/20 hover:bg-[#4ade80]/20 transition-colors">Approve Selected</button>
                    <button className="flex-1 py-1.5 rounded-md bg-[#ef4444]/10 text-[#ef4444] text-[10px] font-medium border border-[#ef4444]/20 hover:bg-[#ef4444]/20 transition-colors">Reject Selected</button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">RECENT DONATIONS</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-[10px] min-w-[320px]">
                    <thead><tr className="text-[#9c958a] border-b border-[rgba(243,238,228,0.06)]"><th className="text-left pb-2 font-normal">Donor</th><th className="text-left pb-2 font-normal">Message</th><th className="text-left pb-2 font-normal">Amount</th><th className="text-left pb-2 font-normal">Status</th></tr></thead>
                    <tbody>
                      {(recentDonations.length?recentDonations:[]).slice(0,5).map((d:any)=>{
                        const initials=(d.name||'A').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                        return(
                          <tr key={d.id} className="border-b border-[rgba(243,238,228,0.04)]">
                            <td className="py-2"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-[#c9a227]/20 flex items-center justify-center text-[8px] font-bold text-[#c9a227]">{initials}</div><span className="text-white">{d.name||'Anonymous'}</span></div></td>
                            <td className="py-2 text-[#9c958a] truncate max-w-[80px]">{d.message||'Donation'}</td>
                            <td className="py-2 text-white font-medium">${Number(d.amount||0).toFixed(2)}</td>
                            <td className="py-2"><span className={`px-1.5 py-0.5 rounded-full text-[8px] ${d.status==='completed'?'bg-[#4ade80]/10 text-[#4ade80]':'bg-[#f97316]/10 text-[#f97316]'}`}>{d.status||'Pending'}</span></td>
                          </tr>
                        )
                      })}
                      {recentDonations.length===0&&<tr><td colSpan={4} className="py-6 text-center text-[#9c958a]">No donations yet</td></tr>}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">TOP CAMPAIGNS</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-3">
                    {(campaigns.length?campaigns:[]).slice(0,3).map((c:any)=>{
                      const pct=c.goal_amount?Math.min(100,Math.round((c.current_amount/c.goal_amount)*100)):0
                      return(
                        <div key={c.id}>
                          <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-medium text-white truncate max-w-[140px]">{c.title}</span><span className="text-[10px] text-[#c9a227] font-medium">${(c.current_amount||0).toLocaleString()} / ${(c.goal_amount||0).toLocaleString()}</span></div>
                          <div className="w-full h-1.5 bg-[rgba(243,238,228,0.06)] rounded-full overflow-hidden"><div className="h-full bg-[#c9a227] rounded-full" style={{width:`${pct}%`}}/></div>
                        </div>
                      )
                    })}
                    {campaigns.length===0&&<div className="py-6 text-center text-[#9c958a] text-[10px]">No active campaigns</div>}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">AI TRANSCRIPT GENERATION</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-2">
                    {(transcripts.length?transcripts:[]).slice(0,3).map((t:any)=>{
                      const status=t.status||'Processing'
                      return(
                        <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(243,238,228,0.02)]">
                          <div className="w-8 h-8 rounded-lg bg-[rgba(139,124,248,0.15)] flex items-center justify-center"><Sparkles className="w-4 h-4 text-[#8b7cf8]"/></div>
                          <div className="flex-1"><p className="text-[11px] font-medium text-white truncate">{t.sermon_title}</p><p className="text-[9px] text-[#9c958a]">{t.created_at?t.created_at.split('T')[0]:''}</p></div>
                          <span className={`text-[9px] px-2 py-1 rounded-full font-medium ${status==='completed'?'bg-[#4ade80]/10 text-[#4ade80]':'bg-[#8b7cf8]/10 text-[#8b7cf8]'}`}>{status==='completed'?'Completed':'Processing'}</span>
                        </div>
                      )
                    })}
                    {transcripts.length===0&&<div className="py-6 text-center text-[#9c958a] text-[10px]">No transcripts yet</div>}
                  </div>
                </div>
              </div>
            </div>
          ):activeTab==='broadcasts'?(
            <Suspense fallback={<div className="p-8 text-center text-sm text-[#9c958a]">Loading...</div>}>
              <BroadcastManager broadcasts={broadcasts as any} onRefresh={refresh}/>
            </Suspense>
          ):activeTab==='users'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">User Management</h2></div>
              {loading?(
                <div className="p-8 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#c9a227] mx-auto"/><p className="mt-3 text-xs text-[#9c958a]">Loading users...</p></div>
              ):users.length===0?(
                <div className="p-8 text-center"><Users className="w-8 h-8 mx-auto mb-3 text-[rgba(243,238,228,0.1)]"/><p className="text-xs text-[#9c958a]">No users yet</p></div>
              ):null}
              <div className="space-y-1">
                {users.map(u=>u?(
                  <div key={u.id} className="px-4 py-3 rounded-lg flex items-center justify-between hover:bg-[rgba(243,238,228,0.03)] transition-colors">
                    <div><p className="text-xs font-medium text-white">{u.name||u.email}</p><p className="text-[10px] text-[#9c958a] mt-0.5">{u.email}</p></div>
                    <select value={u.role} onChange={e=>updateUserRole(u.id,e.target.value)} className="text-xs rounded-md px-2.5 py-1 bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-[#f3eee4] outline-none">
                      <option value="listener">Listener</option><option value="broadcaster">Broadcaster</option><option value="admin">Admin</option>
                    </select>
                  </div>
                ):null)}
              </div>
            </div>
          ):activeTab==='sermons'?(
            <Suspense fallback={<div className="p-8 text-center text-sm text-[#9c958a]">Loading...</div>}>
              <SermonManager sermons={sermons as any} onRefresh={refresh}/>
            </Suspense>
          ):activeTab==='chat'?(
            <ChatSupervisor messages={chatMessages} onRefresh={fetchChat}/>
          ):activeTab==='settings'?(
            <AdminSettings/>
          ):activeTab==='music'?(
            <Suspense fallback={<div className="p-8 text-center text-sm text-[#9c958a]">Loading...</div>}>
              <MusicManager music={musicTracks as any} onRefresh={refresh}/>
            </Suspense>
          ):activeTab==='speakers'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Guest Speaker Spotlight</h2></div>
              <GuestSpeakerManager/>
            </div>
          ):activeTab==='prayer'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Prayer Wall Management</h2></div>
              <PrayerManager/>
            </div>
          ):activeTab==='testimonies'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Testimony Management</h2></div>
              <Suspense fallback={<div className="p-8 text-center text-sm text-[#9c958a]">Loading...</div>}>
                <TestimonyManager/>
              </Suspense>
            </div>
          ):activeTab==='events'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Event Management</h2></div>
              <EventManager/>
            </div>
          ):null}
        </div>
      </main>
    </div>
  )
}
