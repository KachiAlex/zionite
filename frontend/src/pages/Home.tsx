import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowRight, HomeIcon, Archive, Heart, MessageSquare
} from 'lucide-react'

interface Broadcast {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  status: string
  started_at?: string
  broadcaster_id: string
}

interface ScheduleItem {
  id: string
  title: string
  day_of_week: number
  time: string
  type: string
  next_occurrence: string
  days_until: number
}

interface ChatMessage {
  id: string
  user_name: string
  message: string
  created_at: string
}

interface Sermon {
  id: string
  title: string
  scripture_reference?: string
  speaker?: string
  series?: string
  duration?: number
  date: string
}

interface Stats {
  listening: number
  peak: number
  avg: number
}

// Waveform component for live audio visualization
function Waveform({ isLive }: { isLive: boolean }) {
  return (
    <div className="flex items-center gap-[3px] h-11 justify-center">
      {[30, 60, 90, 45, 70, 35, 80, 50, 65, 40, 85, 55, 30, 75, 45].map((height, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: `${height}%`,
            background: 'var(--gold-soft)',
            animation: isLive && i % 3 === 0 ? 'bob 1.2s ease-in-out infinite' : undefined,
            animationDelay: `${i * 0.1}s`
          }}
        />
      ))}
    </div>
  )
}

// Live dot with pulse animation
function LiveDot() {
  return (
    <span 
      className="w-[7px] h-[7px] rounded-full inline-block"
      style={{
        background: 'var(--oxblood-soft)',
        animation: 'pulse 1.6s ease-in-out infinite'
      }}
    />
  )
}

// Mark icon (logo)
function MarkIcon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" width={String(size)} height={String(size)} aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill="none" stroke="#48433a" strokeWidth="1"/>
      <path 
        d="M4 11 L11 14 L9 18 L17 13 L15 17 L24 16" 
        fill="none" 
        stroke="#c9a227" 
        strokeWidth="1.6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Phone mockup component
function PhoneMockup({ 
  children, 
  caption, 
  index 
}: { 
  children: React.ReactNode
  caption: string
  index: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-72 transition-transform duration-250 hover:-translate-y-1.5">
      <div 
        className="w-full rounded-[34px] p-2.5"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          boxShadow: '0 40px 70px -30px rgba(0,0,0,.7)'
        }}
      >
        <div 
          className="w-12 h-1 rounded-full mx-auto mb-2"
          style={{ background: 'var(--line)' }}
        />
        <div 
          className="rounded-[26px] overflow-hidden min-h-[560px] flex flex-col"
          style={{ background: 'var(--ink)' }}
        >
          <div className="p-4 flex flex-col gap-3.5 flex-1">
            {children}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
        <span className="font-mono" style={{ color: 'var(--gold-soft)' }}>{index}</span>
        {caption}
      </div>
    </div>
  )
}

// Card component
function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div 
      className={`rounded-[14px] p-3.5 ${className}`}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)'
      }}
    >
      {children}
    </div>
  )
}

// Eyebrow text
function Eyebrow({ children, color = 'gold', className = '' }: { children: React.ReactNode, color?: 'gold' | 'dim', className?: string }) {
  return (
    <div 
      className={`font-mono text-[10.5px] tracking-widest uppercase flex items-center gap-1.5 mb-1.5 ${className}`}
      style={{ color: color === 'gold' ? 'var(--gold)' : 'var(--dim)', justifyContent: className.includes('justify-center') ? 'center' : undefined }}
    >
      {children}
    </div>
  )
}

export default function Home() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [stats, setStats] = useState<Stats>({ listening: 0, peak: 0, avg: 0 })
  const { user } = useAuth()

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      // Fetch all data in parallel
      const [broadcastRes, scheduleRes, sermonsRes] = await Promise.all([
        axios.get('/api/broadcasts/active').catch(() => ({ data: { broadcast: null } })),
        axios.get('/api/schedule').catch(() => ({ data: { schedule: [] } })),
        axios.get('/api/sermons?limit=3').catch(() => ({ data: { sermons: [] } }))
      ])
      
      setBroadcast(broadcastRes.data.broadcast)
      setSchedule(scheduleRes.data.schedule || [])
      setSermons(sermonsRes.data.sermons || [])
      
      // If there's a live broadcast, fetch chat and stats
      if (broadcastRes.data.broadcast?.id) {
        const chatRes = await axios.get(`/api/chat/${broadcastRes.data.broadcast.id}`).catch(() => ({ data: { messages: [] } }))
        setChatMessages(chatRes.data.messages || [])
        setStats({
          listening: chatRes.data.messages?.length || 0,
          peak: 214,
          avg: 186
        })
      }
    } catch {
      // Silent fail - keep existing data
    }
  }

  const isLive = broadcast?.status === 'live'

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes bob {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.5); }
        }
      `}</style>

      {/* Hero Section */}
      <header className="text-center pt-16 pb-8 px-6">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <MarkIcon size={26} />
          <span 
            className="text-xs tracking-[0.16em] uppercase"
            style={{ color: 'var(--dim)' }}
          >
            Zionitefm
          </span>
        </div>
        
        <div 
          className="text-[11px] tracking-[0.14em] uppercase mb-3.5"
          style={{ color: 'var(--gold)' }}
        >
          Live every Sunday · saved for later
        </div>
        
        <h1 
          className="font-serif text-3xl md:text-5xl leading-tight max-w-3xl mx-auto mb-4"
          style={{ fontWeight: 500 }}
        >
          You don't have to miss church again.
        </h1>
        
        <p 
          className="max-w-xl mx-auto text-base leading-relaxed mb-4"
          style={{ color: 'var(--dim)' }}
        >
          Listen live to every gathering, follow along as the verse is read, and come back anytime to a sermon that stayed with you. One app, made only for our church family.
        </p>
        
        <Link to={isLive ? "/" : "/archive"} className="btn-gold mt-1.5">
          {isLive ? 'Start listening live' : 'Browse the archive'}
        </Link>
      </header>

      {/* Seam Divider */}
      <div className="relative h-px my-16 mx-6" style={{ background: 'var(--line)' }}>
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-6 px-4"
          style={{ background: 'var(--ink)' }}
        >
          {[1,2,3].map(i => (
            <span 
              key={i}
              className="w-1.5 h-1.5"
              style={{ 
                background: 'var(--gold)', 
                transform: 'rotate(45deg)' 
              }}
            />
          ))}
        </div>
      </div>

      {/* Phone Mockups Section */}
      <section className="px-6 pb-16">
        <div className="flex items-baseline justify-between max-w-6xl mx-auto mb-8 flex-wrap gap-2">
          <h2 className="font-serif text-2xl" style={{ fontWeight: 500 }}>Never miss a Sunday</h2>
          <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: 'var(--dim)' }}>
            Live now, yours to keep after
          </span>
        </div>

        <div className="flex gap-8 justify-center flex-wrap items-start max-w-6xl mx-auto">
          
          {/* HOME Phone */}
          <PhoneMockup caption="Home" index="01">
            <Card>
              <Eyebrow>NEXT GATHERING</Eyebrow>
              <div className="font-serif text-xl my-0.5" style={{ fontWeight: 500 }}>
                {schedule[0]?.title || 'Sunday Gathering'}
              </div>
              <div className="text-xs mb-3" style={{ color: 'var(--dim)' }}>
                {schedule[0]?.time || '10:00 AM'} · {schedule[0]?.days_until === 0 ? 'Today' : `in ${schedule[0]?.days_until || 0} days`}
              </div>
              <Link to="/status" className="btn-gold w-full text-sm py-2 inline-block text-center">View Schedule</Link>
            </Card>
            
            <div>
              <Eyebrow color="dim">THIS WEEK</Eyebrow>
              {schedule.slice(0, 3).map((item) => (
                <div key={item.id} className="py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex justify-between text-sm">
                    <span>{item.title}</span>
                    <span className="font-mono text-xs" style={{ color: item.days_until === 0 ? 'var(--gold-soft)' : 'var(--dim)' }}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][item.day_of_week]} · {item.time}
                    </span>
                  </div>
                </div>
              ))}
              {schedule.length === 0 && (
                <div className="py-2 text-sm" style={{ color: 'var(--dim)' }}>No upcoming events</div>
              )}
            </div>

            {/* Tab Bar */}
            <div 
              className="flex justify-around pt-3 pb-2 -mx-4 -mb-4 mt-auto"
              style={{ 
                borderTop: '1px solid var(--line)',
                background: 'var(--ink)'
              }}
            >
              <div className="flex flex-col items-center gap-1 text-[10px]" style={{ color: 'var(--gold-soft)' }}>
                <HomeIcon size={18} />
                <span>Home</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-[10px]" style={{ color: 'var(--dim)' }}>
                <Archive size={18} />
                <span>Archive</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-[10px]" style={{ color: 'var(--dim)' }}>
                <Heart size={18} />
                <span>Give</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-[10px]" style={{ color: 'var(--dim)' }}>
                <MessageSquare size={18} />
                <span>Prayer</span>
              </div>
            </div>
          </PhoneMockup>

          {/* LIVE Phone */}
          <PhoneMockup caption="Live" index="02">
            <div className="flex items-center gap-2.5">
              <ArrowRight size={18} style={{ color: 'var(--dim)', transform: 'rotate(180deg)' }} />
              <div>
                <Eyebrow><LiveDot /> LIVE NOW</Eyebrow>
                <div className="font-serif text-base" style={{ fontWeight: 500 }}>
                  {broadcast?.title || 'Sunday Gathering'}
                </div>
              </div>
            </div>

            <Waveform isLive={isLive} />

            <div className="flex justify-center">
              <Link
                to={broadcast?.id ? `/live/${broadcast.id}` : '/live'}
                className="w-14 h-14 rounded-full flex items-center justify-center border-0 no-underline"
                style={{ background: 'var(--gold)', color: '#1b1208' }}
              >
                <span className="text-xs font-medium">Watch</span>
              </Link>
            </div>

            <Card className="text-center">
              <Eyebrow className="justify-center">NOW READING</Eyebrow>
              <div className="font-serif text-lg" style={{ fontWeight: 500 }}>
                {broadcast?.scripture_reference || 'Romans 8:28'}
              </div>
            </Card>

            <div className="flex gap-2">
              <Link to={`/live?chat=1`} className="px-3.5 py-1.5 rounded-full text-xs border no-underline" style={{ borderColor: 'var(--gold)', color: 'var(--gold-soft)', background: 'rgba(201,162,39,.08)' }}>
                Chat
              </Link>
              <Link to="/prayer" className="px-3.5 py-1.5 rounded-full text-xs border no-underline" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
                Prayer
              </Link>
            </div>

            <Card className="flex-1">
              {chatMessages.slice(0, 3).map((msg) => (
                <div key={msg.id} className="py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <span className="font-mono text-[11px] block" style={{ color: 'var(--gold-soft)' }}>{msg.user_name}</span>
                  <span className="text-sm">{msg.message}</span>
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="py-4 text-center text-sm" style={{ color: 'var(--dim)' }}>No messages yet. Be the first!</div>
              )}
            </Card>

            <Link to={broadcast?.id ? `/live/${broadcast.id}` : '#'} className="btn-line w-full text-sm inline-block text-center no-underline">Join the conversation</Link>
          </PhoneMockup>

          {/* ARCHIVE Phone */}
          <PhoneMockup caption="Archive" index="03">
            <div className="font-serif text-xl" style={{ fontWeight: 500 }}>Archive</div>
            
            <input 
              type="text"
              placeholder="Search sermons, series, or a verse"
              className="w-full rounded-lg px-3 py-2.5 text-sm border"
              style={{ 
                background: 'var(--ink-2)', 
                borderColor: 'var(--line)',
                color: 'var(--parchment)'
              }}
            />
            
            <div className="flex gap-2 flex-wrap">
              <Link to="/archive" className="px-3 py-1.5 rounded-full text-xs border no-underline" style={{ borderColor: 'var(--gold)', color: 'var(--gold-soft)' }}>
                All
              </Link>
              <Link to="/archive?filter=series" className="px-3 py-1.5 rounded-full text-xs border no-underline" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
                By series
              </Link>
              <Link to="/archive?filter=date" className="px-3 py-1.5 rounded-full text-xs border no-underline" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
                By date
              </Link>
            </div>

            <div className="flex flex-col gap-2.5">
              {sermons.map((sermon) => (
                <Link key={sermon.id} to={`/archive/${sermon.id}`} className="no-underline">
                  <Card className="py-3 px-3.5 hover:border-[var(--gold)] transition-colors">
                    {sermon.series && <Eyebrow>{sermon.series}</Eyebrow>}
                    <div className="font-serif text-sm my-0.5" style={{ fontWeight: 500, color: 'var(--parchment)' }}>{sermon.title}</div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--dim)' }}>
                      <span>{sermon.speaker || 'Pastor'} · {sermon.duration ? `${Math.round(sermon.duration/60)} min` : '45 min'}</span>
                      {sermon.scripture_reference && (
                        <span className="font-mono" style={{ color: 'var(--gold-soft)' }}>{sermon.scripture_reference}</span>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
              {sermons.length === 0 && (
                <div className="py-4 text-center text-sm" style={{ color: 'var(--dim)' }}>
                  No sermons yet. Check back soon!
                </div>
              )}
            </div>
          </PhoneMockup>
        </div>
      </section>

      {/* Staff Console Section */}
      {user?.role === 'admin' || user?.role === 'broadcaster' ? (
        <>
          <div className="relative h-px my-16 mx-6" style={{ background: 'var(--line)' }}>
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-6 px-4"
              style={{ background: 'var(--ink)' }}
            >
              {[1,2,3].map(i => (
                <span 
                  key={i}
                  className="w-1.5 h-1.5"
                  style={{ 
                    background: 'var(--gold)', 
                    transform: 'rotate(45deg)' 
                  }}
                />
              ))}
            </div>
          </div>

          <section className="px-6 pb-20">
            <div className="flex items-baseline justify-between max-w-5xl mx-auto mb-8 flex-wrap gap-3">
              <h2 className="font-serif text-2xl" style={{ fontWeight: 500 }}>Run entirely by our own team</h2>
              <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: 'var(--dim)' }}>
                No technical experience needed
              </span>
            </div>

            <div 
              className="max-w-5xl mx-auto rounded-3xl p-7"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                boxShadow: '0 40px 80px -40px rgba(0,0,0,.7)'
              }}
            >
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <MarkIcon size={24} />
                  <div>
                    <div className="font-serif text-[15px]" style={{ fontWeight: 500 }}>Zionitefm</div>
                    <div className="font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>Staff console</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs" style={{ color: 'var(--dim)' }}>{user?.email || 'Media team'}</span>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs"
                    style={{
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--gold-soft)'
                    }}
                  >
                    {user?.email?.[0]?.toUpperCase() || 'M'}
                  </div>
                </div>
              </div>

              <Link 
                to="/broadcast"
                className="flex items-center justify-between rounded-[18px] px-6 py-5 mb-5 transition-colors border"
                style={{
                  background: 'var(--ink-2)',
                  borderColor: isLive ? 'var(--oxblood-soft)' : 'var(--line)'
                }}
              >
                <div>
                  <Eyebrow>
                    {isLive && <LiveDot />}
                    {isLive ? 'Live now' : (broadcast ? 'Ready to broadcast' : 'Next: Sunday gathering, 10:00 AM')}
                  </Eyebrow>
                  {isLive && (
                    <div className="font-serif text-[22px]" style={{ fontWeight: 500 }}>00:00:00</div>
                  )}
                </div>
                <span className="btn-gold">Go live</span>
              </Link>

              <div 
                className="grid grid-cols-3 gap-px rounded-[14px] overflow-hidden mb-5"
                style={{ background: 'var(--line)' }}
              >
                <div className="p-4" style={{ background: 'var(--ink-2)' }}>
                  <div className="font-mono text-2xl">{isLive ? '—' : '—'}</div>
                  <div className="text-[10.5px] uppercase tracking-wider mt-1" style={{ color: 'var(--dim)' }}>Listening now</div>
                </div>
                <div className="p-4" style={{ background: 'var(--ink-2)' }}>
                  <div className="font-mono text-2xl">{stats.peak}</div>
                  <div className="text-[10.5px] uppercase tracking-wider mt-1" style={{ color: 'var(--dim)' }}>Peak today</div>
                </div>
                <div className="p-4" style={{ background: 'var(--ink-2)' }}>
                  <div className="font-mono text-2xl">{stats.avg}</div>
                  <div className="text-[10.5px] uppercase tracking-wider mt-1" style={{ color: 'var(--dim)' }}>Avg. this month</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-5">
                <div 
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
                >
                  <h3 className="font-serif text-[15.5px] mb-0.5" style={{ fontWeight: 500 }}>Chat</h3>
                  <div className="text-xs mb-3" style={{ color: 'var(--dim)' }}>Visible to listeners · moderated</div>
                  {chatMessages.slice(0, 5).map((msg) => (
                    <div key={msg.id} className="py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <span className="font-mono text-[11.5px]" style={{ color: 'var(--gold-soft)' }}>{msg.user_name}</span>
                      <div className="text-sm">{msg.message}</div>
                    </div>
                  ))}
                  {chatMessages.length === 0 && (
                    <div className="py-4 text-center text-sm" style={{ color: 'var(--dim)' }}>No chat messages</div>
                  )}
                </div>
                
                <div 
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
                >
                  <h3 className="font-serif text-[15.5px] mb-0.5" style={{ fontWeight: 500 }}>Prayer requests</h3>
                  <div className="text-xs mb-3" style={{ color: 'var(--dim)' }}>Pastoral only · private</div>
                  <div className="py-2 border-b" style={{ borderColor: 'var(--line)' }}>
                    <span className="font-mono text-[10.5px]" style={{ color: 'var(--gold-soft)' }}>Sarah</span>
                    <div className="text-sm">Please pray for my mother&apos;s surgery next week.</div>
                  </div>
                  <div className="py-2">
                    <span className="font-mono text-[10.5px]" style={{ color: 'var(--gold-soft)' }}>Michael</span>
                    <div className="text-sm">Pray for wisdom on a job decision.</div>
                  </div>
                </div>
              </div>

              <div>
                <Eyebrow color="dim">UPCOMING</Eyebrow>
                <div className="flex gap-3.5 overflow-x-auto pb-1">
                  {schedule.slice(0, 5).map((item) => (
                    <div 
                      key={item.id}
                      className="flex-shrink-0 min-w-[170px] rounded-xl p-3.5"
                      style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
                    >
                      <div className="font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
                        {['SUN','MON','TUE','WED','THU','FRI','SAT'][item.day_of_week]} · {item.time}
                      </div>
                      <div className="font-serif text-sm mt-1" style={{ fontWeight: 500 }}>{item.title}</div>
                    </div>
                  ))}
                  {schedule.length === 0 && (
                    <div className="text-sm" style={{ color: 'var(--dim)' }}>No upcoming events scheduled</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* Footer */}
      <footer 
        className="text-center py-6 px-6 border-t"
        style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}
      >
        <p className="font-mono text-xs tracking-wider">
          Zionitefm — live every Sunday, and waiting for you whenever you&apos;re ready.
        </p>
      </footer>
    </div>
  )
}
