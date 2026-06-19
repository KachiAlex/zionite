import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"
import { useAuth } from "../contexts/AuthContext"
import {
  Play, Pause, Volume2, Maximize2, MessageSquare, Search, Heart,
  Users, BookOpen, Headphones, ChevronRight,
  Download, Smartphone, Facebook, Instagram, Youtube, Twitter,
  Send, Mic2, Cross, MapPin, Mail, ArrowRight, Radio
} from "lucide-react"

interface Broadcast { id: string; title: string; description?: string; scripture_reference?: string; status: string; started_at?: string; broadcaster_id: string }
interface ScheduleItem { id: string; title: string; day_of_week: number; time: string; type: string; days_until: number }
interface ChatMessage { id: string; user_name?: string; guest_name?: string; message: string; created_at: string }
interface Sermon { id: string; title: string; scripture_reference?: string; speaker?: string; series?: string; duration?: number; date: string }
interface PrayerReq { id: string; name: string; initials: string; request: string; time: string; prayers: number }

const PRAYERS: PrayerReq[] = [
  { id:"1", name:"Sarah J.", initials:"SJ", request:"Please pray for my family's healing and financial breakthrough. Thank you.", time:"2 mins ago", prayers:12 },
  { id:"2", name:"David M.", initials:"DM", request:"Praying for deliverance from anxiety and depression. I trust God for complete peace.", time:"5 mins ago", prayers:8 },
  { id:"3", name:"Blessing K.", initials:"BK", request:"Thank God for His faithfulness in my life! He has been so good.", time:"8 mins ago", prayers:15 },
]
const PODCASTS = [
  { id:"1", title:"Kingdom Principles", speaker:"Pastor Samuel Adeyemi", duration:"42:15" },
  { id:"2", title:"The Power of Worship", speaker:"Pastor Michael O.", duration:"38:20" },
  { id:"3", title:"Faith for Everyday Living", speaker:"Pastor Grace IE", duration:"45:10" },
]
const SCHEDULE = [
  { time:"08:00 AM", title:"Morning Devotion", live:false },
  { time:"09:00 AM", title:"Worship Experience", live:true },
  { time:"12:00 PM", title:"Midday Prayer", live:false },
  { time:"03:00 PM", title:"Kingdom Teachings", live:false },
  { time:"06:00 PM", title:"Evening Encounter", live:true },
  { time:"09:00 PM", title:"Night Worship", live:false },
  { time:"11:00 PM", title:"Gospel Music Session", live:false },
]
const FEATURED = [
  { title:"Walking in Divine Purpose", speaker:"Pastor Samuel Adeyemi", duration:"48:23" },
  { title:"The Power of Consistent Prayer", speaker:"Pastor Grace IE", duration:"36:11" },
  { title:"Jesus: The Way, The Truth & The Life", speaker:"Pastor Michael O.", duration:"52:17" },
  { title:"Overcoming Life's Challenges", speaker:"Pastor Sarah O.", duration:"43:02" },
]

function LiveDot() { return <span className="inline-block w-[7px] h-[7px] rounded-full bg-[#ef4444] animate-pulse mr-1.5" /> }

function SectionHeader({ title, action, to }:{ title:string; action:string; to:string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-serif text-lg md:text-xl font-medium text-white">{title}</h3>
      <Link to={to} className="text-xs font-medium text-[#9c958a] hover:text-[#c9a227] transition-colors">{action}</Link>
    </div>
  )
}

function SermonCard({ s }:{ s:Sermon }) {
  return (
    <Link to={`/archive/${s.id}`} className="group block">
      <div className="relative rounded-xl overflow-hidden aspect-[4/3] mb-2.5 bg-[#1c1d24]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Play className="w-3 h-3 text-white fill-white" />
          <span className="text-[10px] text-white">{s.duration ? Math.round(s.duration/60)+" min" : "45 min"}</span>
        </div>
      </div>
      <h4 className="text-sm font-medium text-white group-hover:text-[#c9a227] transition-colors leading-snug">{s.title}</h4>
      <p className="text-xs text-[#9c958a] mt-0.5">{s.speaker || "Pastor"}</p>
    </Link>
  )
}

function PrayerCard({ p }:{ p:PrayerReq }) {
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-[rgba(243,238,228,0.08)] hover:border-[rgba(201,162,39,0.3)] transition-colors">
      <img src={`https://ui-avatars.com/api/?name=${p.initials}&background=c9a227&color=1b1208&size=40`} alt={p.name} className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">{p.name}</span>
          <span className="text-[10px] text-[#9c958a]">{p.time}</span>
        </div>
        <p className="text-xs text-[#9c958a] mt-1 leading-relaxed line-clamp-2">{p.request}</p>
        <div className="flex items-center gap-3 mt-2">
          <button className="flex items-center gap-1 text-[11px] text-[#9c958a] hover:text-[#c9a227] transition-colors">
            <Heart className="w-3.5 h-3.5" /> Pray {p.prayers}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [broadcast, setBroadcast] = useState<Broadcast|null>(null)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(70)
  const [searchQ, setSearchQ] = useState("")
  const { user } = useAuth()

  useEffect(()=>{
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return ()=>clearInterval(iv)
  },[])

  async function fetchData(){
    try {
      const [br, sc, sr] = await Promise.all([
        axios.get("/api/broadcasts/active").catch(()=>({data:{broadcast:null}})),
        axios.get("/api/schedule").catch(()=>({data:{schedule:[]}})),
        axios.get("/api/sermons?limit=4").catch(()=>({data:{sermons:[]}})),
      ])
      setBroadcast(br.data.broadcast)
      setSchedule(sc.data.schedule||[])
      setSermons(sr.data.sermons||[])
      if(br.data.broadcast?.id){
        const ch = await axios.get(`/api/chat/${br.data.broadcast.id}`).catch(()=>({data:{messages:[]}}))
        setChat(ch.data.messages||[])
      }
    } catch {}
  }

  const isLive = broadcast?.status==="live"
  const listenerCount = 2543

  return (
    <div className="min-h-screen" style={{background:"var(--ink)",color:"var(--parchment)"}}>
      {/* ====== NAVBAR ====== */}
      <nav className="sticky top-0 z-50 border-b border-[rgba(243,238,228,0.08)] bg-[#14141a]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full border border-[#c9a227]/40 flex items-center justify-center">
              <Mic2 className="w-4 h-4 text-[#c9a227]" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-white tracking-wide">ZIONITEFM</div>
              <div className="text-[9px] text-[#9c958a] tracking-widest uppercase">The Voice of Redemption</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {["Home","Live Radio","Sermons","Podcasts","Prayer Wall","Events","About Us"].map((item,i)=>{
              const path = ["/", isLive?"/live":"/live", "/archive", "/podcasts", "/prayer", "/events", "/about"][i]
              const active = i===0
              return (
                <Link key={item} to={path} className={`text-xs font-medium transition-colors ${active?"text-[#c9a227]":"text-[#9c958a] hover:text-white"}`}>
                  {item}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center bg-[#1c1d24] rounded-full px-3 py-1.5 border border-[rgba(243,238,228,0.08)]">
              <Search className="w-3.5 h-3.5 text-[#9c958a] mr-2" />
              <input type="text" placeholder="Search sermons, topics, speakers..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                className="bg-transparent text-xs text-white placeholder-[#9c958a] outline-none w-44" />
            </div>
            {user ? (
              <Link to="/admin" className="w-8 h-8 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] text-xs font-bold">
                {user.name?.[0]?.toUpperCase()||"A"}
              </Link>
            ) : (
              <Link to="/login" className="flex items-center gap-1 text-[#c9a227] hover:text-[#e0bd5a] transition-colors">
                <Users className="w-4 h-4" />
              </Link>
            )}
            <button className="hidden md:flex items-center gap-1.5 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium px-4 py-1.5 rounded-full transition-colors">
              <Heart className="w-3.5 h-3.5" /> Donate
            </button>
          </div>
        </div>
      </nav>

      {/* ====== HERO + LIVE PLAYER ====== */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Welcome */}
          <div>
            <p className="font-cursive text-2xl md:text-3xl text-[#c9a227] mb-1">Welcome to</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-white leading-tight mb-4">
              ZioniteFM –<br />The Voice of Redemption
            </h1>
            <p className="text-sm text-[#9c958a] max-w-md leading-relaxed mb-6">
              The official digital radio ministry of The Redemption Project. Broadcasting the Gospel of Jesus Christ to the nations through powerful sermons, worship, prayer, and life-transforming conversations.
            </p>
            <div className="flex items-center gap-4">
              <Link to={isLive?`/live/${broadcast.id}`:"/live"} className="btn-gold text-sm">
                <Headphones className="w-4 h-4" /> Listen Live
              </Link>
              <Link to="/archive" className="btn-line text-sm">Explore Sermons</Link>
            </div>

            <div className="flex items-center gap-3 mt-8">
              <div className="flex -space-x-2">
                {["SJ","DM","BK","AO","GO"].map((init,i)=>{
                  const bg = ["c9a227","8a3326","21222c","1c1d24","48433a"][i]
                  return <img key={i} src={`https://ui-avatars.com/api/?name=${init}&background=${bg}&color=f3eee4&size=32`} className="w-8 h-8 rounded-full border-2 border-[#14141a]" alt="" />
                })}
              </div>
              <div>
                <p className="text-xs text-white">Join the Community</p>
                <p className="text-[10px] text-[#9c958a]">{listenerCount.toLocaleString()}+ listeners online</p>
              </div>
            </div>
          </div>

          {/* Right: Live Player */}
          <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] overflow-hidden">
            {isLive && (
              <div className="relative">
                <div className="aspect-square bg-gradient-to-br from-[#2a2518] to-[#14141a] flex items-center justify-center">
                  <div className="w-48 h-48 rounded-xl bg-gradient-to-br from-[#3a3218] to-[#1a1810] flex items-center justify-center border border-[#c9a227]/20">
                    <Cross className="w-16 h-16 text-[#c9a227]/40" />
                  </div>
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
                  <LiveDot /> <span className="text-[10px] font-medium text-white uppercase tracking-wider">Live</span>
                </div>
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-medium text-[#c9a227] uppercase tracking-wider block mb-1">Now Streaming Live</span>
                  <h3 className="font-serif text-lg font-medium text-white">{broadcast?.title||"Faith That Moves Mountains"}</h3>
                  <p className="text-xs text-[#9c958a] mt-0.5">Pastor Samuel Adeyemi · The Redemption Project</p>
                </div>
                <span className="text-[10px] text-[#9c958a]">32:45</span>
              </div>

              <div className="flex items-center gap-[2px] h-8 justify-center my-3">
                {[20,45,70,35,85,50,65,40,75,30,60,45,80,55,35,70,40,85,50,60,30,55,75,45,65].map((h,i)=>{
                  const active = isLive && i%3===0
                  return (
                    <span key={i} className="w-[3px] rounded-full bg-[#c9a227]/60" style={{
                      height: active?`${h}%`:"40%",
                      animation: active?"pulse 1.2s ease-in-out infinite":undefined,
                      animationDelay: active?`${i*0.05}s`:undefined
                    }} />
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={()=>setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-[#c9a227] hover:bg-[#e0bd5a] flex items-center justify-center transition-colors">
                    {isPlaying ? <Pause className="w-4 h-4 text-[#1b1208] fill-current" /> : <Play className="w-4 h-4 text-[#1b1208] fill-current ml-0.5" />}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-[#9c958a]" />
                    <div className="w-20 h-1 bg-[rgba(243,238,228,0.1)] rounded-full overflow-hidden">
                      <div className="h-full bg-[#c9a227] rounded-full" style={{width:volume+"%"}} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link to={isLive?`/live/${broadcast?.id||""}`:"/live"} className="flex items-center gap-1.5 text-xs text-[#c9a227] hover:text-[#e0bd5a] transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> Join Live Chat
                  </Link>
                  <button className="text-[#9c958a] hover:text-white transition-colors">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== MAIN DASHBOARD GRID ====== */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* LEFT COLUMN (8/12) */}
          <div className="lg:col-span-8 space-y-5">

            {/* Featured Sermons */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Featured Sermons" action="View All" to="/archive" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {sermons.length>0 ? sermons.map(s=><SermonCard key={s.id} s={s} />) :
                  FEATURED.map((f,i)=>{
                    const colors = ["from-amber-900/30","from-emerald-900/30","from-blue-900/30","from-rose-900/30"]
                    return (
                      <div key={i}>
                        <div className={`relative rounded-xl overflow-hidden aspect-[4/3] mb-2.5 bg-gradient-to-br ${colors[i]} to-[#14141a]`}>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                            <Play className="w-3 h-3 text-white fill-white" />
                            <span className="text-[10px] text-white">{f.duration}</span>
                          </div>
                        </div>
                        <h4 className="text-sm font-medium text-white leading-snug">{f.title}</h4>
                        <p className="text-xs text-[#9c958a] mt-0.5">{f.speaker}</p>
                      </div>
                    )
                  })
                }
              </div>
            </section>

            {/* Bottom row: 3 cards */}
            <div className="grid md:grid-cols-3 gap-5">
              {/* Sermon Transcripts */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <SectionHeader title="Sermon Transcripts" action="View All" to="/archive" />
                <p className="text-xs text-[#9c958a] mb-3">Read, study and download sermon transcripts.</p>
                <div className="space-y-2">
                  {["Search by topic","Download PDF","Study offline"].map((item,i)=>{
                    const icons = [Search, Download, BookOpen]
                    const Icon = icons[i]
                    return (
                      <div key={item} className="flex items-center gap-2 text-xs text-[#9c958a]">
                        <Icon className="w-3.5 h-3.5 text-[#c9a227]" /> {item}
                      </div>
                    )
                  })}
                </div>
                <Link to="/archive" className="btn-gold w-full text-xs mt-4">Browse Transcripts</Link>
              </section>

              {/* Guest Speaker Spotlight */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <SectionHeader title="Guest Speaker Spotlight" action="View All" to="/events" />
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg bg-[#21222c] flex items-center justify-center flex-shrink-0">
                    <Users className="w-8 h-8 text-[#c9a227]/40" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Dr. John Mark</p>
                    <span className="text-[10px] bg-[rgba(201,162,39,0.15)] text-[#c9a227] px-2 py-0.5 rounded-full">Guest Minister</span>
                    <p className="text-xs text-[#9c958a] mt-1">Special Conference</p>
                    <p className="text-[10px] text-[#9c958a]">May 24 - 26, 2025</p>
                  </div>
                </div>
                <Link to="/events" className="btn-gold w-full text-xs mt-3">View Event Details</Link>
              </section>

              {/* Giving & Donations */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
                <SectionHeader title="Giving & Donations" action="" to="#" />
                <p className="text-xs text-[#9c958a] mb-3">Your giving makes ministry and impact possible.</p>
                <div className="space-y-2 mb-4">
                  {["Gospel Broadcasting","Outreach Programs","Missions","Ministry Support"].map(item=>{
                    return (
                      <div key={item} className="flex items-center gap-2 text-xs text-[#9c958a]">
                        <ChevronRight className="w-3 h-3 text-[#c9a227]" /> {item}
                      </div>
                    )
                  })}
                </div>
                <button className="btn-gold w-full text-xs"><Heart className="w-3.5 h-3.5" /> Give Now</button>
              </section>
            </div>
          </div>

          {/* RIGHT COLUMN (4/12) */}
          <div className="lg:col-span-4 space-y-5">

            {/* Live Prayer Wall */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Live Prayer Wall" action="View All" to="/prayer" />
              <div className="space-y-3">
                {PRAYERS.map(p=><PrayerCard key={p.id} p={p} />)}
              </div>
              <Link to="/prayer" className="btn-gold w-full text-xs mt-4">Submit Prayer Request</Link>
            </section>

            {/* Today's Schedule */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Today's Schedule" action="View Full Schedule" to="/status" />
              <div className="space-y-0">
                {SCHEDULE.map((item,i)=>{
                  const isNow = item.live
                  return (
                    <div key={i} className={`flex items-center gap-3 py-2.5 ${i<SCHEDULE.length-1?"border-b border-[rgba(243,238,228,0.06)]":""}`}>
                      <span className={`text-[11px] font-mono w-16 flex-shrink-0 ${isNow?"text-[#c9a227]":"text-[#9c958a]"}`}>{item.time}</span>
                      <span className={`text-xs flex-1 ${isNow?"text-white font-medium":"text-[#9c958a]"}`}>{item.title}</span>
                      {isNow && <span className="text-[10px] text-[#ef4444] font-medium">LIVE</span>}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Community Chat */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Community Chat" action="View Full Chat" to={isLive?`/live/${broadcast?.id||""}`:"/live"} />
              <div className="space-y-3 mb-4">
                {(chat.length>0 ? chat.slice(0,4) : []).map((msg,i)=>{
                  const names = ["Michael O.","Grace IE","Victor A.","Blessing K."]
                  const msgs = ["Amen! This message is powerful","Thank you Jesus!","Glory to God!","So blessed by this broadcast."]
                  const displayName = msg.user_name||msg.guest_name||names[i]||"User"
                  const displayMsg = msg.message||msgs[i]||""
                  return (
                    <div key={msg.id} className="flex gap-2.5">
                      <img src={`https://ui-avatars.com/api/?name=${displayName}&background=21222c&color=f3eee4&size=28`} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-white">{displayName}</span>
                          <span className="text-[9px] text-[#9c958a]">{i+2} min ago</span>
                        </div>
                        <p className="text-[11px] text-[#9c958a] leading-relaxed">{displayMsg}</p>
                      </div>
                    </div>
                  )
                })}
                {chat.length===0 && (
                  <>
                    {["Michael O.","Grace IE","Victor A.","Blessing K."].map((name,i)=>{
                      const msgs=["Amen! This message is powerful","Thank you Jesus!","Glory to God!","So blessed by this broadcast."]
                      return (
                        <div key={i} className="flex gap-2.5">
                          <img src={`https://ui-avatars.com/api/?name=${name}&background=21222c&color=f3eee4&size=28`} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-white">{name}</span>
                              <span className="text-[9px] text-[#9c958a]">{i+2} min ago</span>
                            </div>
                            <p className="text-[11px] text-[#9c958a] leading-relaxed">{msgs[i]}</p>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 bg-[#14141a] rounded-full px-3 py-2 border border-[rgba(243,238,228,0.06)]">
                <input type="text" placeholder="Type a message..." className="flex-1 bg-transparent text-xs text-white placeholder-[#9c958a] outline-none" />
                <button className="text-[#c9a227] hover:text-[#e0bd5a] transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ====== TESTIMONY + PODCAST + APP ROW ====== */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Testimony Corner */}
          <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
            <SectionHeader title="Testimony Corner" action="View All" to="/testimonies" />
            <div className="relative">
              <p className="text-sm text-[#9c958a] leading-relaxed italic">
                "ZioniteFM has been a blessing to me. I started listening during a difficult season, and the messages brought hope, healing, and direction."
              </p>
              <div className="flex items-center gap-3 mt-4">
                <img src="https://ui-avatars.com/api/?name=Gloria+A&background=c9a227&color=1b1208&size=36" className="w-9 h-9 rounded-full" alt="" />
                <div>
                  <p className="text-sm font-medium text-white">Gloria A.</p>
                  <p className="text-[10px] text-[#9c958a]">Lagos, Nigeria</p>
                </div>
              </div>
            </div>
          </section>

          {/* Podcast Archive */}
          <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
            <SectionHeader title="Podcast Archive" action="View All" to="/podcasts" />
            <div className="space-y-3">
              {PODCASTS.map((pod,i)=>{
                const colors = ["from-amber-900/20","from-emerald-900/20","from-blue-900/20"]
                return (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[rgba(243,238,228,0.03)] transition-colors cursor-pointer">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${colors[i]} to-[#14141a] flex items-center justify-center flex-shrink-0`}>
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{pod.title}</p>
                      <p className="text-[11px] text-[#9c958a]">{pod.speaker}</p>
                    </div>
                    <span className="text-[10px] text-[#9c958a] font-mono">{pod.duration}</span>
                  </div>
                )
              })}
            </div>
            <button className="btn-gold w-full text-xs mt-3">Browse All Episodes</button>
          </section>

          {/* Get the App */}
          <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
            <SectionHeader title="Get the ZioniteFM App" action="" to="#" />
            <p className="text-xs text-[#9c958a] mb-3">Take ZioniteFM with you anywhere you go.</p>
            <div className="space-y-2 mb-4">
              {["Listen Live","Sermons & Podcasts","Prayer Wall","Push Notifications"].map(item=>{
                const icon = item==="Listen Live"?Headphones:item==="Sermons & Podcasts"?BookOpen:item==="Prayer Wall"?MessageSquare:Send
                return (
                  <div key={item} className="flex items-center gap-2 text-xs text-[#9c958a]">
                    <ChevronRight className="w-3 h-3 text-[#c9a227]" /> {item}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 bg-[#21222c] hover:bg-[#2a2b36] text-white text-[10px] font-medium px-3 py-2 rounded-lg border border-[rgba(243,238,228,0.08)] transition-colors">
                <Smartphone className="w-3.5 h-3.5" /> App Store
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 bg-[#21222c] hover:bg-[#2a2b36] text-white text-[10px] font-medium px-3 py-2 rounded-lg border border-[rgba(243,238,228,0.08)] transition-colors">
                <Smartphone className="w-3.5 h-3.5" /> Google Play
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ====== FOOTER ====== */}
      <footer className="border-t border-[rgba(243,238,228,0.08)] bg-[#14141a]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full border border-[#c9a227]/40 flex items-center justify-center">
                  <Mic2 className="w-3.5 h-3.5 text-[#c9a227]" />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-medium text-white tracking-wide">ZIONITEFM</div>
                  <div className="text-[9px] text-[#9c958a] tracking-widest uppercase">The Voice of Redemption</div>
                </div>
              </div>
              <p className="text-xs text-[#9c958a] leading-relaxed">
                A Digital Ministry of<br />The Redemption Project
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-xs font-medium text-white uppercase tracking-wider mb-3">Quick Links</h4>
              <div className="space-y-2">
                {["Home","Live Radio","Sermons","Podcasts","Prayer Wall","Events","About Us"].map(item=>{
                  const paths = ["/","/live","/archive","/podcasts","/prayer","/events","/about"]
                  const i = ["Home","Live Radio","Sermons","Podcasts","Prayer Wall","Events","About Us"].indexOf(item)
                  return (
                    <Link key={item} to={paths[i]} className="block text-xs text-[#9c958a] hover:text-[#c9a227] transition-colors">{item}</Link>
                  )
                })}
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-xs font-medium text-white uppercase tracking-wider mb-3">Contact</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-[#9c958a]"><MapPin className="w-3.5 h-3.5 text-[#c9a227]" /> Lagos, Nigeria</div>
                <div className="flex items-center gap-2 text-xs text-[#9c958a]"><Mail className="w-3.5 h-3.5 text-[#c9a227]" /> hello@zionitefm.com</div>
                <div className="flex items-center gap-2 text-xs text-[#9c958a]"><Radio className="w-3.5 h-3.5 text-[#c9a227]" /> 24/7 Live Streaming</div>
              </div>
            </div>

            {/* Subscribe */}
            <div>
              <h4 className="text-xs font-medium text-white uppercase tracking-wider mb-3">Subscribe to Updates</h4>
              <div className="flex gap-2">
                <input type="email" placeholder="Enter your email" className="flex-1 bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#9c958a] outline-none" />
                <button className="bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium px-4 py-2 rounded-lg transition-colors">Subscribe</button>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Facebook className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Instagram className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Youtube className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Twitter className="w-4 h-4" /></a>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgba(243,238,228,0.06)] pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] text-[#9c958a]">© 2025 ZioniteFM. All Rights Reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/privacy" className="text-[10px] text-[#9c958a] hover:text-[#c9a227] transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="text-[10px] text-[#9c958a] hover:text-[#c9a227] transition-colors">Terms of Use</Link>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scaleY(1); }
          50% { opacity: 0.6; transform: scaleY(0.7); }
        }
      `}</style>
    </div>
  )
}
