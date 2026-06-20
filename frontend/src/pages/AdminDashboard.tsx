import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import {
  Users, Radio, Headphones, LayoutDashboard, Signal, MessageSquare, Settings, Music, Mic2, Podcast, Heart, Calendar,
  Search, Bell, ChevronDown, BookOpen, DollarSign, Mic, Pause, StopCircle, BarChart3, Shield, Sparkles
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import BroadcastManager from '../components/admin/BroadcastManager'
import SermonManager from '../components/admin/SermonManager'
import ChatSupervisor from '../components/admin/ChatSupervisor'
import AdminSettings from '../components/admin/AdminSettings'
import MusicManager from '../components/admin/MusicManager'
import GuestSpeakerManager from '../components/admin/GuestSpeakerManager'
import PodcastManager from '../components/admin/PodcastManager'
import PrayerManager from '../components/admin/PrayerManager'
import EventManager from '../components/admin/EventManager'

interface Broadcast { id: string; title: string; status: 'scheduled' | 'live' | 'ended'; started_at?: string; created_at: string }
interface UserItem { id: string; email: string; name?: string; role: string; created_at: string }
interface Sermon { id: string; title: string; speaker: string; audio_url: string; video_url: string; thumbnail_url: string; date: string; duration?: number }
interface ChatMessage { id: string; broadcast_id?: string; user_name: string; message: string; created_at: string }
interface MusicTrack { id: string; title: string; artist: string; album: string; genre: string; audio_url: string; cover_url: string; duration: number; lyrics: string; file_format: string; file_size: number; created_at: string }
interface Stats { total: number; live: number; ended: number }
interface PrayerItem { id: string; name: string | null; request: string; is_anonymous: boolean; prayers_count: number; created_at: string }

type Tab = 'dashboard' | 'broadcasts' | 'users' | 'sermons' | 'chat' | 'settings' | 'music' | 'speakers' | 'podcasts' | 'prayer' | 'events'

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [prayers, setPrayers] = useState<PrayerItem[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, live: 0, ended: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    fetchData()
  }, [user, navigate])

  async function fetchData() {
    setLoading(true)
    try {
      const [broadcastsRes, statsRes, usersRes, sermonsRes, musicRes, prayerRes] = await Promise.all([
        axios.get('/api/broadcasts'),
        axios.get('/api/broadcasts/stats/overview'),
        axios.get('/api/auth/users', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get('/api/sermons'),
        axios.get('/api/music'),
        axios.get('/api/prayer').catch(() => ({ data: { prayers: [] } })),
      ])
      setBroadcasts(broadcastsRes.data.broadcasts)
      setStats(statsRes.data)
      setUsers(usersRes.data.users)
      setSermons(sermonsRes.data.sermons)
      setMusicTracks(musicRes.data.music || [])
      setPrayers(prayerRes.data.prayers || [])
    } catch (err) { console.error('Failed to fetch dashboard data:', err) }
    finally { setLoading(false) }
  }

  async function fetchChat() {
    try {
      const res = await axios.get('/api/broadcasts')
      const bcs = res.data.broadcasts as Broadcast[]
      const allMessages: ChatMessage[] = []
      for (const b of bcs.slice(0, 5)) {
        try { const msgRes = await axios.get(`/api/chat/${b.id}`); allMessages.push(...msgRes.data.messages) } catch {}
      }
      try { const general = await axios.get('/api/chat/general'); allMessages.push(...general.data.messages) } catch {}
      setChatMessages(allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (err) { console.error('Failed to fetch chat:', err) }
  }

  useEffect(() => { if (activeTab === 'chat') fetchChat() }, [activeTab])

  async function updateUserRole(userId: string, newRole: string) {
    const token = localStorage.getItem('token')
    try {
      await axios.patch(`/api/auth/users/${userId}/role`, { role: newRole }, { headers: { Authorization: `Bearer ${token}` } })
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to update role') }
  }

  if (!user || user.role !== 'admin') return null

  function SB({label,tab,icon:I,badge}:any){const a=activeTab===tab;return(<button onClick={()=>setActiveTab(tab)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] transition-colors ${a?'bg-[#c9a227] text-[#1b1208] font-semibold':'text-[#9c958a] hover:text-white hover:bg-[rgba(243,238,228,0.05)]'}`}><I className="w-3.5 h-3.5"/><span className="flex-1 text-left">{label}</span>{badge?<span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${a?'bg-[#1b1208]/20':'bg-[#ef4444] text-white'}`}>{badge}</span>:null}</button>)}
  function SL({t}:{t:string}){return<p className="px-3 text-[9px] font-bold uppercase tracking-wider text-[#9c958a]/40 mb-1 mt-3">{t}</p>}
  return(
    <div className="min-h-screen flex" style={{background:'#0c0c12',color:'#f3eee4'}}>
      <aside className="w-56 flex-shrink-0 border-r border-[rgba(243,238,228,0.06)] bg-[#111118] overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-[#c9a227] flex items-center justify-center flex-shrink-0"><Radio className="w-4 h-4 text-[#1b1208]"/></div>
            <div><div className="text-sm font-bold text-white tracking-wide">ZIONITEFM</div><div className="text-[8px] text-[#9c958a] tracking-wider uppercase">The Voice of Redemption</div></div>
          </div>
          <div className="mb-5 p-2.5 rounded-lg bg-[rgba(201,162,39,0.06)] border border-[rgba(201,162,39,0.12)]"><p className="text-[8px] text-[#9c958a] uppercase tracking-wider mb-0.5">The Redemption Project</p><p className="text-[10px] text-[#c9a227]">Digital Radio Ministry</p></div>
          <SB label="Dashboard" tab="dashboard" icon={LayoutDashboard}/>
          <SL t="Ministry Management"/>
          <SB label="Sermons" tab="sermons" icon={BookOpen}/>
          <SB label="Podcasts" tab="podcasts" icon={Podcast}/>
          <SB label="Speakers" tab="speakers" icon={Mic2}/>
          <SB label="Events" tab="events" icon={Calendar}/>
          <SB label="Prayer Requests" tab="prayer" icon={Heart} badge={prayers.length}/>
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
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[rgba(243,238,228,0.06)] bg-[#111118]/80 backdrop-blur-md flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white font-medium">Welcome back,</span>
              <span className="text-sm font-bold text-white">{user.name||'Admin'}</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#c9a227]/10 text-[#c9a227] border border-[#c9a227]/20">System Administrator</span>
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
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab==='dashboard'?(
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {icon:Users,label:'Listeners Online',value:'1,248',chg:'+16.6%',sub:'vs yesterday',bg:'rgba(139,124,248,0.12)',col:'#8b7cf8'},
                  {icon:Headphones,label:'Total Listeners',value:'12,540',chg:'+22.4%',sub:'vs yesterday',bg:'rgba(59,130,246,0.12)',col:'#3b82f6'},
                  {icon:BookOpen,label:'Sermons',value:sermons.length?String(sermons.length):'356',chg:'+12.5%',sub:'Total Uploads',bg:'rgba(74,222,128,0.12)',col:'#4ade80'},
                  {icon:Mic,label:'Podcasts',value:'128',chg:'+8.4%',sub:'Total Episodes',bg:'rgba(249,115,22,0.12)',col:'#f97316'},
                  {icon:Heart,label:'Prayer Requests',value:prayers.length?String(prayers.length):'243',chg:'+16.7%',sub:`Pending: ${Math.min(23,prayers.length||23)}`,bg:'rgba(239,68,68,0.12)',col:'#ef4444'},
                  {icon:DollarSign,label:'Total Donations',value:'$18,762',chg:'+35.6%',sub:'vs last 7 days',bg:'rgba(201,162,39,0.12)',col:'#c9a227'},
                ].map((c,i)=>(
                  <div key={i} className="p-3.5 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{background:c.bg}}><c.icon className="w-4 h-4" style={{color:c.col}}/></div>
                    <p className="text-[10px] text-[#9c958a]">{c.label}</p>
                    <p className="text-lg font-bold text-white mt-0.5">{c.value}</p>
                    <div className="flex items-center gap-1 mt-0.5"><span className="text-[9px] text-[#4ade80]">{c.chg}</span><span className="text-[9px] text-[#9c958a]">{c.sub}</span></div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-white tracking-wide">LIVE BROADCAST CONTROL</h3>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 bg-[#ef4444] rounded-full animate-pulse"/>LIVE</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-28 h-28 rounded-lg bg-gradient-to-br from-[#2a1f3d] to-[#1a1025] flex items-center justify-center flex-shrink-0">
                      <div className="text-center leading-tight"><div className="text-sm font-bold text-[#c9a227]">THE POWER</div><div className="text-sm font-bold text-[#c9a227]">OF</div><div className="text-sm font-bold text-[#c9a227]">REDEMPTION</div></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-2"><span className="text-[9px] text-[#ef4444] font-bold uppercase">On Air Now</span><h4 className="text-xs font-bold text-white mt-0.5 truncate">Evening Worship Experience</h4><p className="text-[11px] text-[#9c958a]">Pastor James Emmanuel</p></div>
                      <div className="flex items-end gap-[2px] h-8 my-2">
                        {[40,65,30,80,55,90,45,70,35,85,50,75,60,40,95,55,70,45,80,35,65,50,85,40,75,60,90,45,70,55,80,35,65,50,75,40,85,60,45,70].map((h,i)=>(
                          <div key={i} className="w-[3px] rounded-full bg-[#c9a227]/50" style={{height:`${h}%`}}/>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Listeners</p><p className="text-xs font-bold text-white">1,248</p></div>
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Quality</p><p className="text-xs font-bold text-[#4ade80]">Excellent</p></div>
                        <div className="text-center"><p className="text-[9px] text-[#9c958a]">Duration</p><p className="text-xs font-bold text-white">01:26:35</p></div>
                      </div>
                      <div className="flex gap-1.5 mt-3">
                        <button className="flex-1 flex items-center justify-center gap-1 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-[10px] font-medium py-1.5 rounded-md border border-[#ef4444]/20"><StopCircle className="w-3 h-3"/>Stop</button>
                        <button className="flex-1 flex items-center justify-center gap-1 bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.1)] text-white text-[10px] font-medium py-1.5 rounded-md border border-[rgba(243,238,228,0.08)]"><Pause className="w-3 h-3"/>Pause</button>
                        <button className="flex-1 flex items-center justify-center gap-1 bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.1)] text-white text-[10px] font-medium py-1.5 rounded-md border border-[rgba(243,238,228,0.08)]"><Settings className="w-3 h-3"/>Settings</button>
                      </div>
                    </div>
                  </div>
                </div>
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
                    <LineChart data={[{time:'12AM',l:500,u:300},{time:'4AM',l:700,u:450},{time:'8AM',l:1200,u:900},{time:'12PM',l:1600,u:1100},{time:'4PM',l:1400,u:1000},{time:'8PM',l:1800,u:1300}]}>
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
                      <Pie data={[{n:'Mobile App',v:45,c:'#8b7cf8'},{n:'Web',v:25,c:'#c9a227'},{n:'Mobile Web',v:15,c:'#4ade80'},{n:'Speaker',v:10,c:'#f87171'},{n:'Other',v:5,c:'#9ca3af'}]} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="v" stroke="none" paddingAngle={2}>
                        {['#8b7cf8','#c9a227','#4ade80','#f87171','#9ca3af'].map((c,i)=><Cell key={i} fill={c}/>)}
                      </Pie>
                      <Tooltip contentStyle={{background:'#1c1d24',border:'1px solid rgba(243,238,228,0.1)',borderRadius:'6px',fontSize:'10px'}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center -mt-1 mb-2"><p className="text-base font-bold text-white">12,540</p><p className="text-[9px] text-[#9c958a]">Total Streams</p></div>
                  <div className="space-y-1">
                    {[{n:'Mobile App',v:'45%',c:'#8b7cf8'},{n:'Web Player',v:'25%',c:'#c9a227'},{n:'Mobile Web',v:'15%',c:'#4ade80'},{n:'Smart Speaker',v:'10%',c:'#f87171'},{n:'Other',v:'5%',c:'#9ca3af'}].map((s,i)=>(
                      <div key={i} className="flex items-center justify-between text-[9px]"><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{background:s.c}}/><span className="text-[#9c958a]">{s.n}</span></div><span className="text-white font-medium">{s.v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">RECENT SERMONS</h3><button onClick={()=>setActiveTab('sermons')} className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <table className="w-full text-[10px]">
                    <thead><tr className="text-[#9c958a] border-b border-[rgba(243,238,228,0.06)]"><th className="text-left pb-2 font-normal">Title</th><th className="text-left pb-2 font-normal">Speaker</th><th className="text-left pb-2 font-normal">Date</th><th className="text-left pb-2 font-normal">Status</th></tr></thead>
                    <tbody>
                      {(sermons.length?sermons:[{id:'1',title:'Walking in Divine Purpose',speaker:'Pastor James',date:'May 19'},{id:'2',title:'The Power of Faith',speaker:'Rev. Michael',date:'May 18'},{id:'3',title:'Victory Through Worship',speaker:'Pastor James',date:'May 17'},{id:'4',title:'Faith That Moves Mountains',speaker:'Dr. Sarah K.',date:'May 16'},{id:'5',title:'The Grace of God',speaker:'Pastor James',date:'May 15'}] as any[]).slice(0,5).map(s=>(
                        <tr key={s.id} className="border-b border-[rgba(243,238,228,0.04)]"><td className="py-2 text-white font-medium truncate max-w-[100px]">{s.title}</td><td className="py-2 text-[#9c958a]">{s.speaker}</td><td className="py-2 text-[#9c958a]">{s.date}</td><td className="py-2"><span className="px-1.5 py-0.5 rounded-full bg-[#4ade80]/10 text-[#4ade80] text-[8px]">Published</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">PENDING PRAYER REQUESTS</h3><button onClick={()=>setActiveTab('prayer')} className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-2.5">
                    {[
                      {id:'1',name:'Jennifer Okafor',time:'2m ago',text:'Please pray for my family\'s financial breakthrough.',priority:'High'},
                      {id:'2',name:'Michael Johnson',time:'8m ago',text:'Standing in faith for healing from chronic pain.',priority:'Medium'},
                      {id:'3',name:'Anonymous',time:'15m ago',text:'Pray for clarity in a life changing decision.',priority:'Low'},
                      {id:'4',name:'Sarah Williams',time:'25m ago',text:'For my children\'s academic excellence.',priority:'Medium'},
                      {id:'5',name:'David Emmanuel',time:'32m ago',text:'For open doors in my business and ministry.',priority:'High'},
                    ].map(p=>{
                      const pc:{[k:string]:string}={High:'bg-[#ef4444]/10 text-[#ef4444]',Medium:'bg-[#f97316]/10 text-[#f97316]',Low:'bg-[#3b82f6]/10 text-[#3b82f6]'}
                      return(
                        <div key={p.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[rgba(243,238,228,0.02)]">
                          <div className="w-7 h-7 rounded-full bg-[rgba(139,124,248,0.15)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#8b7cf8]">{p.name[0]}</div>
                          <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-white">{p.name}</span><span className="text-[9px] text-[#9c958a]">{p.time}</span></div><p className="text-[10px] text-[#9c958a] mt-0.5 truncate">{p.text}</p></div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${pc[p.priority]}`}>{p.priority}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">TESTIMONY APPROVALS</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="space-y-2.5">
                    {[
                      {id:'1',name:'Chinma Blessing',date:'May 20, 2025',text:'God healed me of a chronic illness!'},
                      {id:'2',name:'Emeka Abraham',date:'May 19, 2025',text:'After months of waiting, God answered!'},
                      {id:'3',name:'Grace David',date:'May 18, 2025',text:'He turned my situation around.'},
                    ].map(t=>(
                      <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[rgba(243,238,228,0.02)]">
                        <div className="w-7 h-7 rounded-full bg-[rgba(201,162,39,0.15)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#c9a227]">{t.name[0]}</div>
                        <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-white">{t.name}</span><span className="text-[9px] text-[#9c958a]">{t.date}</span></div><p className="text-[10px] text-[#9c958a] mt-0.5 truncate">{t.text}</p></div>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#f97316]/10 text-[#f97316] font-medium flex-shrink-0">Pending</span>
                      </div>
                    ))}
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
                  <table className="w-full text-[10px]">
                    <thead><tr className="text-[#9c958a] border-b border-[rgba(243,238,228,0.06)]"><th className="text-left pb-2 font-normal">Donor</th><th className="text-left pb-2 font-normal">Type</th><th className="text-left pb-2 font-normal">Amount</th><th className="text-left pb-2 font-normal">Status</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-[rgba(243,238,228,0.04)]">
                        <td className="py-2"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-[#c9a227]/20 flex items-center justify-center text-[8px] font-bold text-[#c9a227]">JD</div><span className="text-white">John Doe</span></div></td>
                        <td className="py-2 text-[#9c958a]">Seed Offering</td>
                        <td className="py-2 text-white font-medium">$100.00</td>
                        <td className="py-2"><span className="px-1.5 py-0.5 rounded-full bg-[#4ade80]/10 text-[#4ade80] text-[8px]">Completed</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">TOP CAMPAIGNS</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div>
                    <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-medium text-white">ZioniteFM Expansion Project</span><span className="text-[10px] text-[#c9a227] font-medium">$7,650 / $15,000</span></div>
                    <div className="w-full h-1.5 bg-[rgba(243,238,228,0.06)] rounded-full overflow-hidden"><div className="h-full bg-[#c9a227] rounded-full" style={{width:'51%'}}/></div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-semibold text-white tracking-wide">AI TRANSCRIPT GENERATION</h3><button className="text-[9px] text-[#c9a227] hover:underline">View All</button></div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(243,238,228,0.02)]">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(139,124,248,0.15)] flex items-center justify-center"><Sparkles className="w-4 h-4 text-[#8b7cf8]"/></div>
                    <div className="flex-1"><p className="text-[11px] font-medium text-white">Evening Worship Experience</p><p className="text-[9px] text-[#9c958a]">May 20, 2025</p></div>
                    <span className="text-[9px] px-2 py-1 rounded-full bg-[#8b7cf8]/10 text-[#8b7cf8] font-medium">Processing</span>
                  </div>
                </div>
              </div>
            </div>
          ):activeTab==='broadcasts'?(
            <BroadcastManager broadcasts={broadcasts} onRefresh={fetchData}/>
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
            <SermonManager sermons={sermons} onRefresh={fetchData}/>
          ):activeTab==='chat'?(
            <ChatSupervisor messages={chatMessages} onRefresh={fetchChat}/>
          ):activeTab==='settings'?(
            <AdminSettings/>
          ):activeTab==='music'?(
            <MusicManager music={musicTracks} onRefresh={fetchData}/>
          ):activeTab==='speakers'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Guest Speaker Spotlight</h2></div>
              <GuestSpeakerManager/>
            </div>
          ):activeTab==='podcasts'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Podcast Management</h2></div>
              <PodcastManager/>
            </div>
          ):activeTab==='prayer'?(
            <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
              <div className="px-4 py-3 rounded-lg bg-[rgba(243,238,228,0.03)] mb-4 border border-[rgba(243,238,228,0.06)]"><h2 className="text-sm font-semibold text-white">Prayer Wall Management</h2></div>
              <PrayerManager/>
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
