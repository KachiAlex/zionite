import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import { useFavorites } from '../contexts/FavoritesContext'
import {
  Music, Play, Pause, Loader2, Disc3, Search, Share2, Download,
  Shuffle, Heart, ListMusic, Headphones, ArrowLeft, Clock, TrendingUp
} from 'lucide-react'
import { downloadWithTags } from '../lib/downloadWithTags'

interface Track {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  audio_url: string
  cover_url: string
  duration: number
  lyrics: string
  play_count?: number
}

export default function MusicPage() {
  usePageTitle('Music Library')
  const [searchParams, setSearchParams] = useSearchParams()
  const trackId = searchParams.get('track')
  const { currentTrack, isPlaying, playTrack: globalPlayTrack, togglePlay, playQueue, shuffle, toggleShuffle } = useAudioPlayer()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [showLyrics, setShowLyrics] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const [detailTrack, setDetailTrack] = useState<any>(null)
  const [relatedTracks, setRelatedTracks] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const favoriteIds = new Set(tracks.filter(t => isFavorite(t.id, 'music')).map(t => t.id))

  const filtered = tracks.filter(t => {
    const q = query.toLowerCase()
    const matches = t.title.toLowerCase().includes(q) ||
           t.artist.toLowerCase().includes(q) ||
           t.album.toLowerCase().includes(q)
    if (filter === 'favorites') return matches && favoriteIds.has(t.id)
    return matches
  })

  useEffect(() => {
    fetchTracks()
  }, [])

  useEffect(() => {
    if (trackId) {
      fetchTrackDetail(trackId)
    } else {
      setDetailTrack(null)
      setRelatedTracks([])
    }
  }, [trackId])

  async function fetchTrackDetail(id: string) {
    setDetailLoading(true)
    try {
      const { data } = await axios.get(`${API_BASE}/api/music/${id}`)
      setDetailTrack(data.track)
      setRelatedTracks(data.related || [])
    } catch {
      setDetailTrack(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function fetchTracks() {
    try {
      const { data } = await axios.get(`${API_BASE}/api/music`)
      setTracks(data.music || [])
    } catch (err) {
      console.error('Failed to fetch music:', err)
    } finally {
      setLoading(false)
    }
  }

  function toPlayerTrack(t: Track) {
    return {
      id: t.id,
      title: t.title,
      speaker: t.artist || 'Unknown artist',
      audioUrl: t.audio_url,
      thumbnail: t.cover_url,
      trackType: 'music' as const
    }
  }

  function handlePlay(track: Track) {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    globalPlayTrack(toPlayerTrack(track))
  }

  function handlePlayAll() {
    if (filtered.length === 0) return
    playQueue(filtered.map(toPlayerTrack), 0)
  }

  function handleShuffleAll() {
    if (filtered.length === 0) return
    playQueue(filtered.map(toPlayerTrack), 0)
    if (!shuffle) toggleShuffle()
  }

  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownload = useCallback(async (track: Track) => {
    if (downloadingId) return
    setDownloadingId(track.id)
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
      setDownloadingId(null)
    }
  }, [downloadingId])

  async function handleShare(track: Track) {
    const shareUrl = `${window.location.origin}/music?track=${track.id}`
    const shareData = {
      title: track.title,
      text: `Listen to "${track.title}" by ${track.artist || 'Unknown artist'} on ZioniteFM`,
      url: shareUrl
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareUrl)
        alert('Link copied to clipboard!')
      }
    } catch {
      // user cancelled or share failed silently
    }
  }

  function formatDuration(seconds: number) {
    if (!seconds) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8 lg:py-12">
        {/* Track Detail View (shareable link) */}
        {trackId && (
          <div className="mb-8">
            <button
              onClick={() => setSearchParams({})}
              className="flex items-center gap-2 text-sm mb-6 transition-colors hover:opacity-70"
              style={{ color: 'var(--dim)' }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to Music Library
            </button>

            {detailLoading ? (
              <div className="text-center py-20">
                <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--gold)' }} />
              </div>
            ) : detailTrack ? (
              <div className="rounded-2xl p-6 lg:p-8" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="w-48 h-48 rounded-2xl overflow-hidden shrink-0 mx-auto sm:mx-0" style={{ background: 'var(--ink)' }}>
                    {detailTrack.cover_url ? (
                      <img src={detailTrack.cover_url} alt={detailTrack.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-16 h-16" style={{ color: 'var(--line)' }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center text-center sm:text-left">
                    <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                      {detailTrack.title}
                    </h1>
                    <p className="text-lg mb-1" style={{ color: 'var(--dim)' }}>
                      {detailTrack.artist || 'Unknown artist'}
                    </p>
                    {detailTrack.album && (
                      <p className="text-sm mb-3" style={{ color: 'var(--dim)' }}>{detailTrack.album}</p>
                    )}
                    <div className="flex items-center justify-center sm:justify-start gap-4 text-xs mb-4" style={{ color: 'var(--dim)' }}>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(detailTrack.duration)}</span>
                      <span className="flex items-center gap-1"><Headphones className="w-3 h-3" /> {(detailTrack.play_count || 0).toLocaleString()} plays</span>
                      {detailTrack.genre && <span className="flex items-center gap-1"><Music className="w-3 h-3" /> {detailTrack.genre}</span>}
                    </div>
                    <div className="flex items-center justify-center sm:justify-start gap-3">
                      <button
                        onClick={() => handlePlay(detailTrack)}
                        className="btn-gold flex items-center gap-2"
                      >
                        {currentTrack?.id === detailTrack.id && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                        {currentTrack?.id === detailTrack.id && isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button
                        onClick={() => handleShare(detailTrack)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors"
                        style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
                      >
                        <Share2 className="w-4 h-4" /> Share
                      </button>
                      <button
                        onClick={() => handleDownload(detailTrack)}
                        disabled={downloadingId === detailTrack.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60"
                        style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
                      >
                        {downloadingId === detailTrack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
                      </button>
                    </div>
                  </div>
                </div>

                {detailTrack.lyrics && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowLyrics(showLyrics === detailTrack.id ? null : detailTrack.id)}
                      className="text-sm underline"
                      style={{ color: 'var(--gold)' }}
                    >
                      {showLyrics === detailTrack.id ? 'Hide lyrics' : 'Show lyrics'}
                    </button>
                    {showLyrics === detailTrack.id && (
                      <pre className="text-sm mt-3 whitespace-pre-wrap" style={{ color: 'var(--dim)' }}>
                        {detailTrack.lyrics}
                      </pre>
                    )}
                  </div>
                )}

                {relatedTracks.length > 0 && (
                  <div className="mt-8">
                    <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Related Tracks
                    </h3>
                    <div className="space-y-2">
                      {relatedTracks.map((rt: any) => (
                        <div
                          key={rt.id}
                          onClick={() => setSearchParams({ track: rt.id })}
                          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:opacity-80"
                          style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--ink-2)' }}>
                            {rt.cover_url ? (
                              <img src={rt.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music className="w-4 h-4" style={{ color: 'var(--line)' }} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{rt.title}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--dim)' }}>{rt.artist || 'Unknown'}</p>
                          </div>
                          <span className="text-xs" style={{ color: 'var(--dim)' }}>{formatDuration(rt.duration)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20">
                <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
                <p style={{ color: 'var(--dim)' }}>Track not found</p>
              </div>
            )}
          </div>
        )}

        {/* Header (hidden in detail view) */}
        {!trackId && (
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Disc3 className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
            Music Library
          </h1>
          <p className="mt-2" style={{ color: 'var(--dim)' }}>
            Stream worship music and gospel tracks
          </p>
        </div>
        )}

        {/* Search + filters (hidden in detail view) */}
        {!trackId && (
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-6 max-w-2xl mx-auto">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dim)' }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by song, artist, or album..."
              className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-colors"
              style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFilter('all')} className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: filter === 'all' ? 'var(--gold)' : 'var(--ink-2)', color: filter === 'all' ? '#1b1208' : 'var(--parchment)', border: '1px solid var(--line)' }}>
              <ListMusic className="w-3.5 h-3.5 inline mr-1" />All
            </button>
            <button onClick={() => setFilter('favorites')} className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: filter === 'favorites' ? 'var(--gold)' : 'var(--ink-2)', color: filter === 'favorites' ? '#1b1208' : 'var(--parchment)', border: '1px solid var(--line)' }}>
              <Heart className="w-3.5 h-3.5 inline mr-1" />Favorites
            </button>
          </div>
        </div>
        )}

        {/* Play controls (hidden in detail view) */}
        {!trackId && !loading && filtered.length > 0 && (
          <div className="flex items-center justify-center gap-3 mb-8">
            <button onClick={handlePlayAll} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
              style={{ background: 'var(--gold)', color: '#1b1208' }}>
              <Play className="w-3.5 h-3.5 fill-current" /> Play All
            </button>
            <button onClick={handleShuffleAll} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
              style={{ background: 'var(--ink-2)', color: 'var(--parchment)', border: '1px solid var(--line)' }}>
              <Shuffle className="w-3.5 h-3.5" /> Shuffle All
            </button>
          </div>
        )}

        {/* Tracks grid (hidden in detail view) */}
        {!trackId && (loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--gold)' }} />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-20">
            <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <p style={{ color: 'var(--dim)' }}>No tracks available yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
            <p style={{ color: 'var(--dim)' }}>No results for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(track => (
              <div
                key={track.id}
                onClick={() => handlePlay(track)}
                className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
                style={{
                  background: currentTrack?.id === track.id ? 'rgba(201,162,39,0.08)' : 'var(--ink-2)',
                  border: `1px solid ${currentTrack?.id === track.id ? 'var(--gold)' : 'var(--line)'}`
                }}
              >
                <div className="aspect-square rounded-xl mb-3 overflow-hidden relative" style={{ background: 'var(--ink)' }}>
                  {track.cover_url ? (
                    <img src={track.cover_url} alt={`${track.title} by ${track.artist || 'Unknown artist'} album cover`} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-12 h-12" style={{ color: 'var(--line)' }} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                    {currentTrack?.id === track.id && isPlaying ? (
                      <Pause className="w-10 h-10" style={{ color: 'var(--parchment)' }} />
                    ) : (
                      <Play className="w-10 h-10" style={{ color: 'var(--parchment)' }} />
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(track.id, 'music') }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(0,0,0,0.5)', color: isFavorite(track.id, 'music') ? '#ef4444' : '#fff' }}
                    title="Favorite"
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFavorite(track.id, 'music') ? 'fill-current' : ''}`} />
                  </button>
                </div>
                <h3 className="font-medium truncate">{track.title}</h3>
                <p className="text-sm truncate mt-0.5" style={{ color: 'var(--dim)' }}>
                  {track.artist || 'Unknown artist'}{track.album && ` | ${track.album}`}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: 'var(--dim)' }}>
                  <Headphones className="w-3 h-3" />
                  {(track.play_count || 0).toLocaleString()} plays
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={e => { e.stopPropagation(); handleShare(track) }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
                    title="Share"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDownload(track) }}
                    disabled={downloadingId === track.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                    style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--dim)' }}
                    title="Download"
                  >
                    {downloadingId === track.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Tagging...</>
                      : <><Download className="w-3.5 h-3.5" /> Download</>}
                  </button>
                </div>
                {track.lyrics && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowLyrics(showLyrics === track.id ? null : track.id) }}
                    className="text-xs mt-2 underline"
                    style={{ color: 'var(--gold)' }}
                  >
                    {showLyrics === track.id ? 'Hide lyrics' : 'Show lyrics'}
                  </button>
                )}
                {showLyrics === track.id && track.lyrics && (
                  <pre className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--dim)' }}>
                    {track.lyrics}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

    </div>
  )
}
