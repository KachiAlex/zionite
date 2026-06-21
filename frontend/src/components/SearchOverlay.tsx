import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { Search, X, BookOpen, Mic2, Calendar, Loader2 } from 'lucide-react'

interface SearchResult {
  sermons: any[]
  podcasts: any[]
  events: any[]
}

export default function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult>({ sermons: [], podcasts: [], events: [] })
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) { inputRef.current?.focus() }
  }, [open])

  useEffect(() => {
    if (!q.trim()) { setResults({ sermons: [], podcasts: [], events: [] }); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      try {
        const { data } = await axios.get(`/api/search?q=${encodeURIComponent(q)}`, { signal: abortRef.current.signal })
        setResults(data)
      } catch { /* ignore aborts */ }
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  if (!open) return null

  const hasResults = results.sermons.length + results.podcasts.length + results.events.length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xl bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(243,238,228,0.08)]">
          <Search className="w-5 h-5 text-[#9c958a]" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search sermons, podcasts, events..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#9c958a] outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-[#9c958a] animate-spin" />}
          <button onClick={onClose} className="text-[#9c958a] hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {!q.trim() && (
            <div className="text-center py-8 text-xs text-[#9c958a]">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              Type to search sermons, podcasts, and events
            </div>
          )}

          {q.trim() && !hasResults && !loading && (
            <div className="text-center py-8 text-xs text-[#9c958a]">No results found</div>
          )}

          {results.sermons.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#9c958a] uppercase tracking-wider mb-2 px-1">Sermons</p>
              <div className="space-y-1">
                {results.sermons.map((s: any) => (
                  <Link key={s.id} to={`/archive/${s.id}`} onClick={onClose}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[rgba(243,238,228,0.04)] transition-colors">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0"><BookOpen className="w-4 h-4 text-[#9c958a]" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{s.title}</p>
                      <p className="text-[10px] text-[#9c958a]">{s.speaker} {s.scripture_reference ? `· ${s.scripture_reference}` : ''}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.podcasts.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#9c958a] uppercase tracking-wider mb-2 px-1">Podcasts</p>
              <div className="space-y-1">
                {results.podcasts.map((p: any) => (
                  <Link key={p.id} to={`/podcasts`} onClick={onClose}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[rgba(243,238,228,0.04)] transition-colors">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0"><Mic2 className="w-4 h-4 text-[#9c958a]" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{p.title}</p>
                      <p className="text-[10px] text-[#9c958a]">{p.host}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.events.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#9c958a] uppercase tracking-wider mb-2 px-1">Events</p>
              <div className="space-y-1">
                {results.events.map((e: any) => (
                  <Link key={e.id} to={`/events`} onClick={onClose}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[rgba(243,238,228,0.04)] transition-colors">
                    {e.image_url ? (
                      <img src={e.image_url} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0"><Calendar className="w-4 h-4 text-[#9c958a]" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{e.title}</p>
                      <p className="text-[10px] text-[#9c958a]">{e.date}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
