import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import {
  Radio, Play, Square, Plus, Loader2, ArrowLeft,
  Mic, BookOpen, ExternalLink, AlertCircle, Monitor, ChevronDown, ChevronUp,
  HardDrive, Folder, Download, Pause, X, MessageSquare, Calendar, Clock, User
} from 'lucide-react'
import { getRecordingConfig, setRecordingConfig } from '../../lib/recording'
import RadioStudio from '../broadcast/RadioStudio'

interface Broadcast {
  id: string
  title: string
  status: 'scheduled' | 'live' | 'ended'
  started_at?: string
  created_at: string
  description?: string
  scripture_reference?: string
  church_online_url?: string
  rtmp_url?: string
  stream_key?: string
  thumbnail_url?: string
  speaker?: string
  recording_url?: string
  recorded_at?: string
  ended_at?: string
}

interface ChatMsg {
  id: string
  user_name?: string
  guest_name?: string
  message: string
  created_at: string
  is_private?: boolean
}

type StudioView = 'list' | 'setup' | 'studio'

export default function BroadcastManager({ broadcasts, onRefresh }: { broadcasts: Broadcast[]; onRefresh: () => void }) {
  const token = localStorage.getItem('token')
  const [view, setView] = useState<StudioView>('list')
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function openBroadcastDetail(b: Broadcast) {
    setSelectedBroadcast(b)
    setChatHistory([])
    setChatLoading(true)
    try {
      const { data } = await axios.get(`${API_BASE}/api/chat/${b.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setChatHistory(data.messages || [])
    } catch {}
    finally { setChatLoading(false) }
  }

  function closeBroadcastDetail() {
    setSelectedBroadcast(null)
    setChatHistory([])
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setAudioPlaying(false)
  }

  async function downloadRecording(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/broadcasts/${id}/recording/download`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `broadcast_${id}.webm`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Download failed: ' + (e.message || 'Unknown error'))
    }
  }

  /* ── Setup form state ── */
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scripture, setScripture] = useState('')
  const [churchOnlineUrl, setChurchOnlineUrl] = useState('')
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState('')
  const [selectedDevice, setSelectedDevice] = useState('')
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [setupError, setSetupError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [recordEnabled, setRecordEnabled] = useState(false)
  const [recordDirName, setRecordDirName] = useState('')

  /* ── Studio state ── */
  const [broadcastId, setBroadcastId] = useState('')
  const [status, setStatus] = useState<'idle' | 'live' | 'paused'>('idle')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  /* ── Broadcast detail panel ── */
  function BroadcastDetailPanel({ b: initialB }: { b: Broadcast }) {
    const [b, setB] = useState<Broadcast>(initialB)
    const [detailLoading, setDetailLoading] = useState(false)

    useEffect(() => {
      setDetailLoading(true)
      axios.get(`${API_BASE}/api/broadcasts/${initialB.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(({ data }) => {
        if (data.broadcast) setB(data.broadcast)
      }).catch(() => {}).finally(() => setDetailLoading(false))
    }, [initialB.id])

    const duration = b.started_at && b.ended_at
      ? Math.round((new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60000)
      : null

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#14141a] border border-[rgba(243,238,228,0.08)] overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3.5 border-b border-[rgba(243,238,228,0.06)] flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {b.thumbnail_url
                ? <img src={b.thumbnail_url} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                : <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0"><Radio className="w-5 h-5 text-[#c9a227]/40" /></div>
              }
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{b.title}</p>
                {b.speaker && <p className="text-[10px] text-[#c9a227] mt-0.5 flex items-center gap-1"><User className="w-3 h-3" />{b.speaker}</p>}
              </div>
            </div>
            <button onClick={closeBroadcastDetail} className="p-1.5 rounded-md hover:bg-[rgba(243,238,228,0.06)] text-[#9c958a] transition-colors flex-shrink-0 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Meta info */}
            <div className="px-4 py-3 flex items-center gap-4 border-b border-[rgba(243,238,228,0.04)]">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                b.status === 'live' ? 'bg-[#4ade80]/10 text-[#4ade80]' :
                b.status === 'ended' ? 'bg-[rgba(243,238,228,0.06)] text-[#9c958a]' :
                'bg-[#eab308]/10 text-[#eab308]'
              }`}>{b.status}</span>
              {b.started_at && (
                <span className="text-[10px] text-[#9c958a] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />{new Date(b.started_at).toLocaleDateString()}
                </span>
              )}
              {duration !== null && (
                <span className="text-[10px] text-[#9c958a] flex items-center gap-1">
                  <Clock className="w-3 h-3" />{duration}m
                </span>
              )}
            </div>

            {b.description && (
              <div className="px-4 py-3 border-b border-[rgba(243,238,228,0.04)]">
                <p className="text-[11px] text-[#9c958a] leading-relaxed">{b.description}</p>
              </div>
            )}

            {/* Recording player */}
            {b.recording_url ? (
              <div className="px-4 py-4 border-b border-[rgba(243,238,228,0.04)]">
                <p className="text-[10px] font-semibold text-[#9c958a] uppercase tracking-wider mb-3">Recording</p>
                <audio
                  controls
                  src={b.recording_url}
                  className="w-full h-10"
                  style={{ accentColor: '#c9a227' }}
                  onPlay={() => setAudioPlaying(true)}
                  onPause={() => setAudioPlaying(false)}
                />
                {b.recorded_at && (
                  <p className="text-[10px] text-[#9c958a] mt-2">
                    Saved {new Date(b.recorded_at).toLocaleDateString()} · expires {new Date(new Date(b.recorded_at).getTime() + 90*24*60*60*1000).toLocaleDateString()}
                  </p>
                )}
                <button
                  onClick={() => downloadRecording(b.id)}
                  className="mt-3 flex items-center gap-1.5 w-fit text-[11px] font-medium text-[#c9a227] hover:text-[#e0bd5a] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download recording
                </button>
              </div>
            ) : b.status === 'ended' ? (
              <div className="px-4 py-4 border-b border-[rgba(243,238,228,0.04)]">
                <p className="text-[10px] font-semibold text-[#9c958a] uppercase tracking-wider mb-2">Recording</p>
                <p className="text-[11px] text-[#9c958a]/60">No recording available for this broadcast.</p>
              </div>
            ) : null}

            {/* Chat history */}
            <div className="px-4 py-4">
              <p className="text-[10px] font-semibold text-[#9c958a] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Chat Replay
                {chatHistory.length > 0 && <span className="text-[#c9a227]">{chatHistory.length}</span>}
              </p>
              {chatLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-[#9c958a]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading chat...
                </div>
              ) : chatHistory.length === 0 ? (
                <p className="text-[11px] text-[#9c958a]/60">No chat messages for this broadcast.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {chatHistory.map(msg => (
                    <div key={msg.id} className="flex gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#1c1d24] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-3 h-3 text-[#9c958a]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-medium text-[#c9a227]">
                          {msg.user_name || msg.guest_name || 'Guest'}
                        </span>
                        {msg.is_private && <span className="ml-1 text-[9px] text-[#9c958a]">(private)</span>}
                        <p className="text-[11px] text-[rgba(243,238,228,0.8)] break-words">{msg.message}</p>
                        <p className="text-[9px] text-[#9c958a]/50 mt-0.5">{new Date(msg.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          {b.status === 'live' && (
            <div className="px-4 py-3 border-t border-[rgba(243,238,228,0.06)] flex gap-2 flex-shrink-0">
              <button onClick={() => { closeBroadcastDetail(); openStudio(b) }}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] text-[11px] font-medium py-2 rounded-lg transition-colors">
                <Monitor className="w-3.5 h-3.5" /> Open Studio
              </button>
              <button onClick={() => { closeBroadcastDetail(); stopBroadcast() }} disabled={actionLoading}
                className="flex items-center justify-center gap-1.5 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-[11px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                <Square className="w-3.5 h-3.5" /> End
              </button>
            </div>
          )}
          {b.status === 'scheduled' && (
            <div className="px-4 py-3 border-t border-[rgba(243,238,228,0.06)] flex-shrink-0">
              <button onClick={() => { closeBroadcastDetail(); startBroadcast(b.id) }} disabled={actionLoading}
                className="w-full flex items-center justify-center gap-1.5 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 text-[#4ade80] text-[11px] font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
                <Play className="w-3.5 h-3.5" /> Go Live
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Enumerate audio devices for setup form ── */
  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
      } catch {}
    }
    // Need permission first to get labels
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); loadDevices() })
      .catch(() => loadDevices())
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  }, [])

  /* ── Refs for detail panel audio ── */

  /* ── Load recording config on mount ── */
  useEffect(() => {
    getRecordingConfig().then(config => {
      if (config) {
        setRecordEnabled(config.enabled)
        if (config.directoryHandle) {
          setRecordDirName(config.directoryHandle.name)
        }
      }
    })
  }, [])

  /* ── Auto-detect existing live broadcast on mount ── */
  useEffect(() => {
    const live = broadcasts.find(b => b.status === 'live')
    if (live) {
      setBroadcastId(live.id)
      setTitle(live.title || '')
      setDescription(live.description || '')
      setScripture(live.scripture_reference || '')
      setChurchOnlineUrl(live.church_online_url || '')
      setRtmpUrl(live.rtmp_url || '')
      setStreamKey(live.stream_key || '')
      setStatus('live')
      setStartTime(live.started_at ? new Date(live.started_at) : new Date())
      setView('studio')
    }
  }, [broadcasts])

  /* ── Create & go live (setup flow) ── */
  async function createAndGoLive(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setSetupError('Please enter a broadcast title'); return }
    setSetupError('')
    setCreating(true)
    try {
      let thumbnail_url = ''
      if (thumbnailFile) {
        thumbnail_url = await uploadThumbnail()
      }
      const { data } = await axios.post(`${API_BASE}/api/broadcasts`, {
        title, description, scripture_reference: scripture,
        church_online_url: churchOnlineUrl || undefined,
        rtmp_url: rtmpUrl || undefined,
        stream_key: streamKey || undefined,
        thumbnail_url: thumbnail_url || undefined,
        speaker: speaker || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } })
      await axios.patch(`${API_BASE}/api/broadcasts/${data.id}/start`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setBroadcastId(data.id)
      setThumbnailUrl(thumbnail_url || '')
      setStatus('live')
      setStartTime(new Date())
      setView('studio')
      onRefresh()
    } catch (err: any) {
      setSetupError(err.response?.data?.error || 'Failed to start broadcast')
    } finally { setCreating(false) }
  }

  /* ── Start an existing scheduled broadcast ── */
  async function startBroadcast(id: string) {
    setActionLoading(true)
    try {
      await axios.patch(`${API_BASE}/api/broadcasts/${id}/start`, {}, { headers: { Authorization: `Bearer ${token}` } })
      const b = broadcasts.find(x => x.id === id)
      if (b) {
        setBroadcastId(b.id)
        setTitle(b.title || '')
        setDescription(b.description || '')
        setScripture(b.scripture_reference || '')
        setChurchOnlineUrl(b.church_online_url || '')
        setRtmpUrl(b.rtmp_url || '')
        setStreamKey(b.stream_key || '')
        setStatus('live')
        setStartTime(new Date())
        setView('studio')
      }
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start broadcast')
    } finally { setActionLoading(false) }
  }

  async function pauseBroadcast() {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`${API_BASE}/api/broadcasts/${broadcastId}/pause`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setStatus('paused')
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to pause')
    } finally { setActionLoading(false) }
  }

  async function resumeBroadcast() {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`${API_BASE}/api/broadcasts/${broadcastId}/resume`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setStatus('live')
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to resume')
    } finally { setActionLoading(false) }
  }

  async function stopBroadcast(uploadDone?: Promise<void>) {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`${API_BASE}/api/broadcasts/${broadcastId}/end`, {}, { headers: { Authorization: `Bearer ${token}` } })
    } catch { /* ignore */ }
    // Wait for cloud recording upload to finish before navigating away
    if (uploadDone) {
      try { await uploadDone } catch {}
    }
    setStatus('idle')
    setBroadcastId('')
    setStartTime(null)
    setView('list')
    setActionLoading(false)
    onRefresh()
  }

  function openSetup() {
    setTitle('')
    setDescription('')
    setScripture('')
    setChurchOnlineUrl('')
    setRtmpUrl('')
    setStreamKey('')
    setSpeaker('')
    setThumbnailFile(null)
    setThumbnailPreview('')
    setThumbnailUrl('')
    setSetupError('')
    setView('setup')
  }

  async function pickRecordDirectory() {
    if (!('showDirectoryPicker' in window)) {
      setSetupError('Your browser does not support directory selection. Please use Chrome or Edge.')
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker()
      setRecordDirName(handle.name)
      await setRecordingConfig({ enabled: recordEnabled, directoryHandle: handle, lastUsed: new Date().toISOString() })
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setSetupError('Could not access directory: ' + (err.message || err))
      }
    }
  }

  async function toggleRecordEnabled(val: boolean) {
    setRecordEnabled(val)
    const config = await getRecordingConfig() || {}
    await setRecordingConfig({ ...config, enabled: val })
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setThumbnailFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setThumbnailPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadThumbnail(): Promise<string> {
    if (!thumbnailFile) return ''
    const formData = new FormData()
    formData.append('image', thumbnailFile)
    const { data } = await axios.post(`${API_BASE}/api/uploads/image`, formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
    })
    return data.image_url || ''
  }

  function openStudio(b: Broadcast) {
    setBroadcastId(b.id)
    setTitle(b.title || '')
    setDescription(b.description || '')
    setScripture(b.scripture_reference || '')
    setChurchOnlineUrl(b.church_online_url || '')
    setRtmpUrl(b.rtmp_url || '')
    setStreamKey(b.stream_key || '')
    setThumbnailUrl(b.thumbnail_url || '')
    setStatus(b.status === 'live' ? 'live' : 'paused')
    setStartTime(b.started_at ? new Date(b.started_at) : new Date())
    setView('studio')
  }

  /* ─── LIST VIEW ─── */
  if (view === 'list') {
    return (
      <div className="space-y-5">
        {selectedBroadcast && <BroadcastDetailPanel b={selectedBroadcast} />}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">Broadcast Studio</h2>
            <p className="text-[10px] text-[#9c958a] mt-0.5">Create, manage and go live from one place</p>
          </div>
          <button onClick={openSetup}
            className="flex items-center gap-1.5 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Broadcast
          </button>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Live Now', value: broadcasts.filter(b => b.status === 'live').length, color: '#4ade80' },
            { label: 'Scheduled', value: broadcasts.filter(b => b.status === 'scheduled').length, color: '#eab308' },
            { label: 'Total', value: broadcasts.length, color: '#c9a227' },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] text-center">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-[#9c958a]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Broadcast list */}
        <div className="rounded-xl overflow-hidden bg-[#14141a] border border-[rgba(243,238,228,0.06)]">
          <div className="px-4 py-3 border-b border-[rgba(243,238,228,0.06)] bg-[rgba(243,238,228,0.02)]">
            <h3 className="text-xs font-semibold text-white flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-[#c9a227]" /> All Broadcasts
            </h3>
          </div>
          {broadcasts.length === 0 ? (
            <div className="p-8 text-center text-[#9c958a] text-xs">
              <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>No broadcasts yet. Create your first broadcast to go live.</p>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(243,238,228,0.04)]">
              {broadcasts.map(b => (
                <div key={b.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-[rgba(243,238,228,0.04)] transition-colors cursor-pointer"
                  onClick={() => openBroadcastDetail(b)}>
                  <div className="min-w-0 flex items-center gap-3">
                    {b.thumbnail_url ? (
                      <img src={b.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0">
                        <Radio className="w-4 h-4 text-[#c9a227]/40" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-white truncate">{b.title}</p>
                      <p className="text-[10px] text-[#9c958a] mt-0.5">
                        {b.speaker ? `${b.speaker} · ` : ''}{b.status === 'live' ? 'Live now' : b.started_at ? new Date(b.started_at).toLocaleString() : 'Scheduled'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      b.status === 'live' ? 'bg-[#4ade80]/10 text-[#4ade80]' :
                      b.status === 'ended' ? 'bg-[rgba(243,238,228,0.06)] text-[#9c958a]' :
                      'bg-[#eab308]/10 text-[#eab308]'
                    }`}>
                      {b.status}
                    </span>
                    {b.status === 'live' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse flex-shrink-0" />
                    )}
                    {b.status === 'ended' && b.recording_url && (
                      <span title="Recording available" className="p-1 rounded-md bg-[#c9a227]/10 text-[#c9a227]">
                        <Download className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ─── SETUP VIEW ─── */
  if (view === 'setup') {
    return (
      <div className="space-y-5">
        <button onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-[11px] text-[#9c958a] hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to broadcasts
        </button>

        <div className="rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(243,238,228,0.06)]">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#c9a227]" /> New Broadcast
            </h3>
            <p className="text-[10px] text-[#9c958a] mt-1">Enter a title, upload a thumbnail, and go live.</p>
          </div>

          <form onSubmit={createAndGoLive} className="p-5 space-y-5">
            {setupError && (
              <div className="p-3 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#fca5a5] text-[11px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {setupError}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5">Broadcast Title *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Sunday Morning Service"
                className="w-full rounded-lg px-3 py-2.5 text-xs bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5">Broadcast Thumbnail</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-[#9c958a] text-xs cursor-pointer hover:border-[#c9a227]/40 transition-colors">
                    <Plus className="w-3 h-3" /> Upload Image
                    <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                  </label>
                  {thumbnailPreview && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-[rgba(243,238,228,0.08)]">
                      <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Scripture Reference
                </label>
                <input type="text" value={scripture} onChange={e => setScripture(e.target.value)}
                  placeholder="e.g., Romans 8:1-17"
                  className="w-full rounded-lg px-3 py-2.5 text-xs bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Mic className="w-3 h-3" /> Speaker
                </label>
                <input type="text" value={speaker} onChange={e => setSpeaker(e.target.value)}
                  placeholder="e.g., Pastor Daniel Akins"
                  className="w-full rounded-lg px-3 py-2.5 text-xs bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={1}
                  placeholder="Optional description..."
                  className="w-full rounded-lg px-3 py-2.5 text-xs bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors resize-none"
                />
              </div>
            </div>

            {audioDevices.length > 0 && (
              <div>
                <label className="block text-[10px] font-medium text-[#9c958a] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Mic className="w-3 h-3" /> Microphone Device
                </label>
                <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-xs bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors">
                  <option value="">Default microphone</option>
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[11px] text-[#9c958a] hover:text-white transition-colors">
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="rounded-xl bg-[#1c1d24] border border-[rgba(243,238,228,0.06)] p-4 space-y-3">
                <h4 className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-[#c9a227]" /> Stream Configuration
                </h4>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[#9c958a] mb-1">Church Online URL</label>
                    <input type="text" value={churchOnlineUrl} onChange={e => setChurchOnlineUrl(e.target.value)}
                      placeholder="https://online.church/your-church"
                      className="w-full rounded-lg px-3 py-2 text-xs bg-[#14141a] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#9c958a] mb-1">RTMP Ingest URL</label>
                    <input type="text" value={rtmpUrl} onChange={e => setRtmpUrl(e.target.value)}
                      placeholder="rtmp://live.churchonline.com/live"
                      className="w-full rounded-lg px-3 py-2 text-xs bg-[#14141a] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-[#9c958a] mb-1">Stream Key</label>
                  <input type="password" value={streamKey} onChange={e => setStreamKey(e.target.value)}
                    placeholder="Your stream key"
                    className="w-full rounded-lg px-3 py-2 text-xs bg-[#14141a] border border-[rgba(243,238,228,0.08)] text-white outline-none focus:border-[#c9a227]/40 transition-colors"
                  />
                </div>
                <div className="border-t border-[rgba(243,238,228,0.06)] pt-3 mt-1 md:col-span-2">
                  <h4 className="text-[11px] font-semibold text-white flex items-center gap-1.5 mb-2">
                    <HardDrive className="w-3.5 h-3.5 text-[#c9a227]" /> Local Recording
                  </h4>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={recordEnabled} onChange={e => toggleRecordEnabled(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[rgba(243,238,228,0.2)] bg-[#14141a] text-[#c9a227] focus:ring-[#c9a227]" />
                    <span className="text-[11px] text-[#9c958a]">Auto-record broadcasts to local folder</span>
                  </label>
                  {recordEnabled && (
                    <div className="flex items-center gap-2">
                      {recordDirName ? (
                        <span className="text-[11px] text-[#9c958a]">Folder: <span className="text-white">{recordDirName}</span></span>
                      ) : (
                        <span className="text-[11px] text-[#fca5a5]">No folder selected</span>
                      )}
                      <button type="button" onClick={pickRecordDirectory}
                        className="text-[11px] text-[#c9a227] hover:text-[#e0bd5a] transition-colors flex items-center gap-1">
                        <Folder className="w-3 h-3" /> {recordDirName ? 'Change' : 'Choose Folder'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setView('list')}
                className="text-[11px] text-[#9c958a] hover:text-white transition-colors px-3 py-2">
                Cancel
              </button>
              <button type="submit" disabled={creating || !title.trim()}
                className="flex items-center gap-1.5 bg-[#ef4444] hover:bg-[#ef4444]/90 text-white text-[11px] font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                {creating ? 'Starting...' : 'Go Live'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  /* ─── STUDIO VIEW ─── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { setView('list'); onRefresh() }}
          className="flex items-center gap-1.5 text-[11px] text-[#9c958a] hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to broadcasts
        </button>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
          status === 'live' ? 'bg-[#ef4444]/10 text-[#ef4444]' : 'bg-[#eab308]/10 text-[#eab308]'
        }`}>
          {status === 'live' ? <><span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse" /> LIVE</> : 'PAUSED'}
        </span>
      </div>

      <RadioStudio
        broadcastId={broadcastId}
        title={title}
        description={description}
        scripture={scripture}
        churchOnlineUrl={churchOnlineUrl}
        status={status as 'live' | 'paused'}
        startTime={startTime}
        selectedDevice={selectedDevice}
        thumbnailUrl={thumbnailUrl}
        onPause={pauseBroadcast}
        onResume={resumeBroadcast}
        onEnd={(uploadDone) => stopBroadcast(uploadDone)}
        actionLoading={actionLoading}
        recordEnabled={recordEnabled}
      />
    </div>
  )
}
