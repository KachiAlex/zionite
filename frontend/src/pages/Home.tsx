import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"
import {
  Play, Search, Heart,
  Users, BookOpen, Headphones, ChevronRight,
  Download, Facebook, Instagram, Youtube, Twitter,
  Mic2, MapPin, Mail, Radio, Calendar
} from "lucide-react"

interface Broadcast { id: string; title: string; description?: string; scripture_reference?: string; status: string; started_at?: string; broadcaster_id: string }
interface Sermon { id: string; title: string; scripture_reference?: string; speaker?: string; series?: string; duration?: number; date: string; audio_url?: string; video_url?: string; thumbnail_url?: string }
interface GuestSpeaker { id: string; name: string; bio: string; photo_url: string; topic: string; date: string; is_active: boolean }
interface EventItem { id: string; title: string; description: string; date: string; time: string; location: string; image_url: string }

function SectionHeader({ title, action, to }:{ title:string; action:string; to:string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-serif text-lg md:text-xl font-bold text-white">{title}</h3>
      <Link to={to} className="text-xs font-bold text-[#9c958a] hover:text-[#c9a227] transition-colors">{action}</Link>
    </div>
  )
}

function SermonCard({ s }:{ s:Sermon }) {
  return (
    <Link to={`/archive/${s.id}`} className="group block">
      <div className="relative rounded-xl overflow-hidden aspect-[4/3] mb-2.5 bg-[#1c1d24]">
        {s.thumbnail_url ? (
          <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Play className="w-3 h-3 text-white fill-white" />
          <span className="text-[10px] text-white">{s.duration ? Math.round(s.duration/60)+" min" : "45 min"}</span>
        </div>
        {s.video_url && (
          <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">VIDEO</div>
        )}
      </div>
      <h4 className="text-sm font-medium text-white group-hover:text-[#c9a227] transition-colors leading-snug">{s.title}</h4>
      <p className="text-xs text-[#9c958a] mt-0.5">{s.speaker || "Pastor"}</p>
    </Link>
  )
}

export default function Home() {
  const [broadcast, setBroadcast] = useState<Broadcast|null>(null)
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [guestSpeakers, setGuestSpeakers] = useState<GuestSpeaker[]>([])
  const [events, setEvents] = useState<EventItem[]>([])

  useEffect(()=>{
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return ()=>clearInterval(iv)
  },[])

  async function fetchData(){
    try {
      const [br, sr, sp, ev] = await Promise.all([
        axios.get("/api/broadcasts/active").catch(()=>({data:{broadcast:null}})),
        axios.get("/api/sermons?limit=4").catch(()=>({data:{sermons:[]}})),
        axios.get("/api/guest-speakers").catch(()=>({data:{speakers:[]}})),
        axios.get("/api/events").catch(()=>({data:{events:[]}})),
      ])
      setBroadcast(br.data.broadcast)
      setSermons(sr.data.sermons||[])
      setGuestSpeakers(sp.data.speakers||[])
      setEvents(ev.data.events||[])
    } catch {}
  }

  const isLive = broadcast?.status==="live"

  return (
    <div className="min-h-screen" style={{background:"var(--ink)",color:"var(--parchment)"}}>
      {/* ====== HERO ====== */}
      <div className="relative">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=2000&q=80" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c12]/85 via-[#0c0c12]/70 to-[#0c0c12]" />
        </div>
        <div className="relative max-w-[1440px] mx-auto px-4 md:px-6 py-16 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <p className="font-cursive text-2xl md:text-3xl text-[#c9a227] mb-2 font-bold">Welcome to</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
              ZioniteFM –<br />The Voice of Redemption
            </h1>
            <p className="text-base text-[#9c958a] max-w-xl mx-auto leading-relaxed mb-8 font-semibold">
              The official digital radio ministry of The Redemption Project. Broadcasting the Gospel of Jesus Christ to the nations through powerful sermons, worship, prayer, and life-transforming conversations.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link to={isLive?`/live/${broadcast.id}`:"/live"} className="btn-gold text-sm">
                <Headphones className="w-4 h-4" /> Listen Live
              </Link>
              <Link to="/archive" className="flex items-center gap-2 text-sm font-semibold text-[#9c958a] hover:text-white transition-colors hover:scale-105 duration-300">
                <BookOpen className="w-4 h-4" /> Browse Sermons
              </Link>
            </div>
            <div className="flex items-center justify-center gap-3 mt-8">
              <div className="flex -space-x-2">
                {["SJ","DM","BK","AO","GO"].map((init,i)=>{
                  const bg = ["c9a227","8a3326","21222c","1c1d24","48433a"][i]
                  return <img key={i} src={`https://ui-avatars.com/api/?name=${init}&background=${bg}&color=f3eee4&size=32`} className="w-8 h-8 rounded-full border-2 border-[#14141a]" alt="" />
                })}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white">Join the Community</p>
                <p className="text-[10px] text-[#9c958a]">Thousands of listeners online</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== MAIN DASHBOARD GRID ====== */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* LEFT COLUMN (8/12) */}
          <div className="lg:col-span-8 space-y-5">

            {/* Featured Sermons */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Featured Sermons" action="View All" to="/archive" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {sermons.length>0 ? sermons.map(s=><SermonCard key={s.id} s={s} />) :
                  <div className="col-span-full text-center py-8">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                    <p className="text-sm text-[#9c958a] font-semibold">No sermons available yet.</p>
                  </div>
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
                {guestSpeakers.length > 0 ? (
                  <div className="flex gap-3">
                    {guestSpeakers[0].photo_url ? (
                      <img src={guestSpeakers[0].photo_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-[#21222c] flex items-center justify-center flex-shrink-0">
                        <Users className="w-8 h-8 text-[#c9a227]/40" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{guestSpeakers[0].name}</p>
                      <span className="text-[10px] bg-[rgba(201,162,39,0.15)] text-[#c9a227] px-2 py-0.5 rounded-full">Guest Minister</span>
                      <p className="text-xs text-[#9c958a] mt-1">{guestSpeakers[0].topic || 'Special Conference'}</p>
                      {guestSpeakers[0].date && <p className="text-[10px] text-[#9c958a]">{guestSpeakers[0].date}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Users className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                    <p className="text-sm text-[#9c958a] font-semibold">No guest speakers yet.</p>
                  </div>
                )}
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

            {/* Today's Schedule */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Today's Schedule" action="View Full Schedule" to="/status" />
              <div className="text-center py-6">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                <p className="text-sm text-[#9c958a] font-semibold">No scheduled broadcasts today.</p>
              </div>
            </section>

            {/* Upcoming Events */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5">
              <SectionHeader title="Upcoming Events" action="View All" to="/events" />
              {events.length > 0 ? (
                <div className="space-y-3">
                  {events.slice(0, 3).map(evt => (
                    <div key={evt.id} className="flex items-start gap-3">
                      {evt.image_url ? (
                        <img src={evt.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#21222c] flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-[#c9a227]/60" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-white">{evt.title}</p>
                        <p className="text-[10px] text-[#9c958a]">{evt.date}{evt.time ? ` · ${evt.time}` : ''}{evt.location ? ` · ${evt.location}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                  <p className="text-xs text-[#9c958a]">No upcoming events</p>
                </div>
              )}
              <Link to="/events" className="btn-gold w-full text-xs mt-3">View All Events</Link>
            </section>

          </div>
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
