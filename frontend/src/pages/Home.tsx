import { memo, useState, useCallback } from "react"
import axios from "axios"
import { downloadWithTags } from "../lib/downloadWithTags"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { usePageTitle } from "../hooks/usePageTitle"
import { useAudioPlayer } from "../contexts/AudioPlayerContext"
import { useActiveBroadcast, useFeaturedSermons, useMusic, useGuestSpeakers, useEvents, useRadioCurrent, API_BASE } from "../lib/api"
import type { Sermon, MusicTrack } from "../lib/api"
import StructuredData from "../components/StructuredData"
import {
  Play, Pause, Search, Heart,
  Users, BookOpen, Headphones, ChevronRight,
  Download, Facebook, Instagram, Youtube, Twitter,
  Mic2, MapPin, Mail, Radio, Calendar, Disc3, Music, Share2
} from "lucide-react"

function SectionHeader({ title, action, to }:{ title:string; action:string; to:string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-serif text-lg md:text-xl font-bold text-white">{title}</h3>
      <Link to={to} className="text-xs font-bold text-[#9c958a] hover:text-[#c9a227] transition-colors">{action}</Link>
    </div>
  )
}

const SermonCard = memo(function SermonCard({ s }:{ s:Sermon }) {
  const { playTrack } = useAudioPlayer()
  return (
    <div className="group block hover-lift w-full">
      <Link to={`/archive/${s.id}`}>
        <div className="relative rounded-xl overflow-hidden aspect-[4/3] mb-2.5 bg-[#1c1d24]">
          {s.thumbnail_url ? (
            <img src={s.thumbnail_url} alt={`${s.title} sermon thumbnail`} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {s.video_url && (
            <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">VIDEO</div>
          )}
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/archive/${s.id}`} className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white group-hover:text-[#c9a227] transition-colors leading-snug truncate">{s.title}</h4>
          <p className="text-xs text-[#9c958a] mt-0.5">{s.speaker || "Pastor"}</p>
        </Link>
        {s.audio_url && (
          <button
            onClick={(e) => { e.stopPropagation(); playTrack({ id: s.id, title: s.title, speaker: s.speaker || 'Pastor', audioUrl: s.audio_url!, thumbnail: s.thumbnail_url }) }}
            className="w-8 h-8 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] flex-shrink-0 transition-transform hover:scale-110"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </button>
        )}
      </div>
    </div>
  )
})

const MusicCard = memo(function MusicCard({ track }: { track: MusicTrack }) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioPlayer()
  const isCurrent = currentTrack?.id === track.id

  function handlePlay() {
    if (isCurrent) { togglePlay(); return }
    playTrack({ id: track.id, title: track.title, speaker: track.artist || 'Unknown artist', audioUrl: track.audio_url, thumbnail: track.cover_url })
  }

  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (downloading) return
    setDownloading(true)
    try {
      await downloadWithTags({
        audioUrl: track.audio_url,
        title: track.title,
        artist: track.artist || 'ZioniteFM',
        album: track.album || 'ZioniteFM Music',
        genre: track.genre || 'Gospel',
        coverUrl: track.cover_url,
        filename: `${track.title}.mp3`
      })
    } finally {
      setDownloading(false)
    }
  }, [track, downloading])

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    const shareUrl = `${window.location.origin}/music?track=${track.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: track.title, text: `Listen to "${track.title}" by ${track.artist || 'Unknown artist'} on ZioniteFM`, url: shareUrl })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        alert('Link copied to clipboard!')
      }
    } catch { /* user cancelled */ }
  }

  return (
    <div className="group block hover-lift w-[150px] flex-shrink-0">
      <div className="relative rounded-xl overflow-hidden aspect-square mb-2.5 bg-[#1c1d24]">
        {track.cover_url ? (
          <img src={track.cover_url} alt={`${track.title} album cover`} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Disc3 className="w-12 h-12 text-[#9c958a]/40" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button onClick={handlePlay} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] flex-shrink-0 transition-transform hover:scale-110">
          {isCurrent && isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>
      </div>
      <h4 className="text-sm font-medium text-white group-hover:text-[#c9a227] transition-colors leading-snug truncate">{track.title}</h4>
      <p className="text-xs text-[#9c958a] mt-0.5">{track.artist || 'Unknown artist'}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <button onClick={handleShare} className="text-[#9c958a] hover:text-[#c9a227] transition-colors" title="Share">
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} disabled={downloading} className="text-[#9c958a] hover:text-[#c9a227] transition-colors disabled:opacity-50" title="Download">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
})

export default function Home() {
  usePageTitle('The Voice of Redemption')
  const { data: broadcast } = useActiveBroadcast()
  const { data: sermons = [] } = useFeaturedSermons()
  const { data: musicTracks = [] } = useMusic()
  const { data: guestSpeakers = [] } = useGuestSpeakers()
  const { data: events = [] } = useEvents()
  const { data: radioCurrent } = useRadioCurrent()
  const { user } = useAuth()
  const isLive = broadcast?.status==="live"
  const isRadioOn = radioCurrent?.current && !isLive
  const [subEmail, setSubEmail] = useState('')
  const [subState, setSubState] = useState<'idle'|'loading'|'done'|'error'>('idle') // eslint-disable-line

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!subEmail) return
    setSubState('loading')
    try {
      await axios.post(`${API_BASE}/api/newsletter/subscribe`, { email: subEmail })
      setSubEmail('')
      setSubState('done')
    } catch {
      setSubState('error')
    }
  }

  return (
    <div className="min-h-screen" style={{background:"var(--ink)",color:"var(--parchment)"}}>
      <StructuredData />
      {/* ====== HERO ====== */}
      <div className="relative">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=2000&q=80" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c12]/85 via-[#0c0c12]/70 to-[#0c0c12]" />
        </div>
        <div className="relative max-w-[1440px] mx-auto px-4 md:px-6 py-12 sm:py-16 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <p className="font-cursive text-2xl md:text-3xl text-[#c9a227] mb-2 font-bold">Welcome to</p>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
              ZioniteFM –<br />The Voice of Redemption
            </h1>
            <p className="text-base text-[#9c958a] max-w-xl mx-auto leading-relaxed mb-8 font-semibold">
              The official digital radio ministry of The Redemption Project. Broadcasting the Gospel of Jesus Christ to the nations through powerful sermons, worship, prayer, and life-transforming conversations.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link to={user ? (user.role==='admin' || user.role==='broadcaster' ? '/admin' : '/dashboard') : (isLive?`/live/${broadcast.id}`:"/live")} className="btn-gold text-sm">
                <Headphones className="w-4 h-4" /> Listen Live
              </Link>
              <Link to="/archive" className="flex items-center gap-2 text-sm font-semibold text-[#9c958a] hover:text-white transition-colors hover:scale-105 duration-300">
                <BookOpen className="w-4 h-4" /> Browse Sermons
              </Link>
            </div>
            <Link to="/register" className="flex items-center justify-center gap-3 mt-8 group">
              <div className="flex -space-x-2">
                {["SJ","DM","BK","AO","GO"].map((init,i)=>{
                  const bg = ["c9a227","8a3326","21222c","1c1d24","48433a"][i]
                  return <img key={i} src={`https://ui-avatars.com/api/?name=${init}&background=${bg}&color=f3eee4&size=32`} loading="lazy" className="w-8 h-8 rounded-full border-2 border-[#14141a] group-hover:scale-105 transition-transform duration-300" alt="" />
                })}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white group-hover:text-[#c9a227] transition-colors">Join the Community</p>
                <p className="text-[10px] text-[#9c958a]">Thousands of listeners online</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* ====== LIVE BROADCAST BANNER ====== */}
      {isLive && broadcast && (
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-3">
          <Link to={`/live/${broadcast.id}`}
            className="flex items-center gap-4 rounded-2xl p-4 md:p-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #8a1a1a 0%, #1b1208 60%, #14141a 100%)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {/* Pulsing live dot */}
            <div className="relative flex-shrink-0">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-[#ef4444]" />
              </span>
            </div>
            {/* Thumbnail */}
            {broadcast.thumbnail_url ? (
              <img src={broadcast.thumbnail_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-2 ring-[#ef4444]/30" />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#ef4444]/10">
                <Radio className="w-6 h-6 text-[#ef4444]" />
              </div>
            )}
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-[#ef4444] text-white">Live Now</span>
                {broadcast.speaker && <span className="text-[10px] text-[#9c958a]">{broadcast.speaker}</span>}
              </div>
              <p className="text-sm font-semibold text-white truncate">{broadcast.title}</p>
              {broadcast.description && (
                <p className="text-[11px] text-[#9c958a] truncate mt-0.5">{broadcast.description}</p>
              )}
            </div>
            {/* CTA */}
            <div className="flex-shrink-0 flex items-center gap-2 bg-[#ef4444] hover:bg-[#ef4444]/90 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
              <Headphones className="w-3.5 h-3.5" /> Join
            </div>
          </Link>
        </div>
      )}

      {/* ====== SERMON RADIO BANNER ====== */}
      {isRadioOn && radioCurrent && (
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-3">
          <Link to="/live"
            className="flex items-center gap-4 rounded-2xl p-4 md:p-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #2a1f3d 0%, #1b1208 60%, #14141a 100%)', border: '1px solid rgba(201,162,39,0.3)' }}>
            {/* Pulsing radio dot */}
            <div className="relative flex-shrink-0">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c9a227] opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-[#c9a227]" />
              </span>
            </div>
            {/* Thumbnail */}
            {radioCurrent.current.thumbnailUrl ? (
              <img src={radioCurrent.current.thumbnailUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-2 ring-[#c9a227]/30" />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#c9a227]/10">
                <Radio className="w-6 h-6 text-[#c9a227]" />
              </div>
            )}
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-[#c9a227] text-[#1b1208]">Sermon Radio</span>
                {radioCurrent.current.speaker && <span className="text-[10px] text-[#9c958a]">{radioCurrent.current.speaker}</span>}
              </div>
              <p className="text-sm font-semibold text-white truncate">{radioCurrent.current.title}</p>
              {radioCurrent.current.scriptureReference && (
                <p className="text-[11px] text-[#9c958a] truncate mt-0.5">{radioCurrent.current.scriptureReference}</p>
              )}
            </div>
            {/* CTA */}
            <div className="flex-shrink-0 flex items-center gap-2 bg-[#c9a227] hover:bg-[#c9a227]/90 text-[#1b1208] text-xs font-bold px-4 py-2 rounded-xl transition-colors">
              <Headphones className="w-3.5 h-3.5" /> Listen
            </div>
          </Link>
        </div>
      )}

      {/* ====== MAIN DASHBOARD GRID ====== */}
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 pb-5 animate-slide-up">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

          {/* LEFT COLUMN (8/12) */}
          <div className="xl:col-span-8 space-y-5">

            {/* Sermons + Music side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Featured Sermons */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
                <SectionHeader title="Featured Sermons" action="View All" to="/archive" />
                {sermons.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {sermons.slice(0, 2).map(s => <SermonCard key={s.id} s={s} />)}
                      {sermons.slice(2, 4).map(s => (
                        <div key={s.id} className="hidden md:block"><SermonCard s={s} /></div>
                      ))}
                    </div>
                    <Link to="/archive"
                      className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-colors hover:text-[#c9a227]"
                      style={{ border: '1px solid var(--line)', color: 'var(--dim)' }}>
                      <BookOpen className="w-3.5 h-3.5" /> View All Sermons
                    </Link>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                    <p className="text-sm text-[#9c958a] font-semibold">No sermons yet.</p>
                  </div>
                )}
              </section>

              {/* Featured Music */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
                <SectionHeader title="Featured Music" action="View All" to="/music" />
                {musicTracks.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {musicTracks.slice(0, 2).map(t => <MusicCard key={t.id} track={t} />)}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Music className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                    <p className="text-sm text-[#9c958a] font-semibold">No music yet.</p>
                  </div>
                )}
              </section>
            </div>

            {/* Bottom row: 3 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Sermon Transcripts */}
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
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
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
                <SectionHeader title="Guest Speaker Spotlight" action="View All" to="/events" />
                {guestSpeakers.length > 0 ? (
                  <div className="flex gap-3">
                    {guestSpeakers[0].photo_url ? (
                      <img src={guestSpeakers[0].photo_url} alt={`${guestSpeakers[0].name} guest speaker`} loading="lazy" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
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
              <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
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
                <Link to="/donate" className="btn-gold w-full text-xs"><Heart className="w-3.5 h-3.5" /> Give Now</Link>
              </section>
            </div>
          </div>

          {/* RIGHT COLUMN (4/12) */}
          <div className="xl:col-span-4 space-y-5">

            {/* Today's Schedule */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
              <SectionHeader title="Today's Schedule" action="View Full Schedule" to="/status" />
              <div className="text-center py-6">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-[#9c958a]/40" />
                <p className="text-sm text-[#9c958a] font-semibold">No scheduled broadcasts today.</p>
              </div>
            </section>

            {/* Upcoming Events */}
            <section className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 hover-lift">
              <SectionHeader title="Upcoming Events" action="View All" to="/events" />
              {events.length > 0 ? (
                <div className="space-y-3">
                  {events.slice(0, 3).map(evt => (
                    <Link key={evt.id} to={`/events/${evt.id}`} className="flex items-start gap-3 group no-underline">
                      {evt.image_url ? (
                        <img src={evt.image_url} alt={`${evt.title} event`} loading="lazy" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#21222c] flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-[#c9a227]/60" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-[#c9a227] transition-colors">{evt.title}</p>
                        <p className="text-[10px] text-[#9c958a]">{evt.date}{evt.time ? ` · ${evt.time}` : ''}{evt.location ? ` · ${evt.location}` : ''}</p>
                      </div>
                    </Link>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
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
                {["Home","Live Radio","Sermons","Prayer Wall","Events","About Us"].map(item=>{
                  const paths = ["/","/live","/archive","/prayer","/events","/about"]
                  const i = ["Home","Live Radio","Sermons","Prayer Wall","Events","About Us"].indexOf(item)
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
                <div className="flex items-center gap-2 text-xs text-[#9c958a]"><Mail className="w-3.5 h-3.5 text-[#c9a227]" /> theredemptionprojectministries@gmail.com</div>
                <div className="flex items-center gap-2 text-xs text-[#9c958a]"><Radio className="w-3.5 h-3.5 text-[#c9a227]" /> 24/7 Live Streaming</div>
              </div>
            </div>

            {/* Subscribe */}
            <div>
              <h4 className="text-xs font-medium text-white uppercase tracking-wider mb-3">Subscribe to Updates</h4>
              {subState === 'done' ? (
                <p className="text-xs text-green-400 py-2">✓ Subscribed! Thank you.</p>
              ) : (
                <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
                  <input type="email" required placeholder="Enter your email" value={subEmail}
                    onChange={e => setSubEmail(e.target.value)}
                    className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2.5 text-xs text-white placeholder-[#9c958a] outline-none" />
                  <button type="submit" disabled={subState === 'loading'}
                    className="w-full bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60">
                    {subState === 'loading' ? 'Subscribing…' : 'Subscribe'}
                  </button>
                </form>
              )}
              {subState === 'error' && <p className="text-[10px] text-red-400 mt-1">Failed to subscribe. Try again.</p>}
              <div className="flex items-center gap-3 mt-4">
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Facebook className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Instagram className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Youtube className="w-4 h-4" /></a>
                <a href="#" className="text-[#9c958a] hover:text-[#c9a227] transition-colors"><Twitter className="w-4 h-4" /></a>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgba(243,238,228,0.06)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
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
