import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { API_BASE } from '../../lib/api'
import {
  Radio, Pause, Play, Square, Mic, MicOff, Volume2, Volume1, VolumeX,
  Copy, CheckCircle, Activity, Share2, Headphones, Wifi, Zap, HardDrive,
  Disc, Loader2, Music2, Upload, RotateCcw, StopCircle,
  MessageSquare, Send, User, Clock
} from 'lucide-react'
import { getRecordingConfig } from '../../lib/recording'
import AudioWaveVisualizer from './AudioWaveVisualizer'
import VUMeter from './VUMeter'

function NetworkIndicator() {
  const [strength, setStrength] = useState(4)
  const [latency, setLatency] = useState(0)
  useEffect(() => {
    const interval = setInterval(async () => {
      const start = Date.now()
      try {
        await fetch(`${API_BASE}/api/ping`, { method: 'GET', cache: 'no-store' })
        const ms = Date.now() - start
        setLatency(ms)
        setStrength(ms < 100 ? 4 : ms < 200 ? 3 : ms < 400 ? 2 : 1)
      } catch { setStrength(0); setLatency(999) }
    }, 3000)
    return () => clearInterval(interval)
  }, [])
  const bars = [1, 2, 3, 4]
  const color = strength === 0 ? '#ef4444' : strength <= 2 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex items-center gap-2" title={`Latency: ${latency}ms`}>
      <div className="flex items-end gap-0.5 h-4">
        {bars.map(b => (
          <div key={b} className="w-1 rounded-sm transition-all"
            style={{ height: `${b * 4}px`, background: b <= strength ? color : 'var(--line)' }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: strength === 0 ? '#ef4444' : 'var(--dim)' }}>
        {strength === 0 ? 'Offline' : `${latency}ms`}
      </span>
    </div>
  )
}

function BroadcastTimer({ startTime }: { startTime: Date | null }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startTime])
  const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60), s = elapsed % 60
  return <span className="font-mono text-lg">{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color?: string }) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
      <Icon className="w-5 h-5 shrink-0" style={{ color: color || 'var(--gold)' }} />
      <div>
        <p className="text-xs" style={{ color: 'var(--dim)' }}>{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  )
}

interface Props {
  broadcastId: string
  title: string
  description: string
  scripture: string
  churchOnlineUrl: string
  status: 'live' | 'paused'
  startTime: Date | null
  selectedDevice: string
  thumbnailUrl?: string
  onPause: () => void
  onResume: () => void
  onEnd: (uploadDone: Promise<void>) => void
  actionLoading: boolean
  recordEnabled?: boolean
}

/* ── MonitorPlayer (real-time local monitor via Web Audio API) ─────────── */
function MonitorPlayer({ stream, enabled, volume }: { stream: MediaStream | null; enabled: boolean; volume: number }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled || !stream) {
      if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null }
      gainRef.current = null
      setActive(false)
      return
    }

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    gain.gain.value = volume / 100
    gainRef.current = gain
    source.connect(gain)
    gain.connect(ctx.destination)

    // Resume in case browser suspended it (user gesture from clicking "On" allows this)
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}) }
    setActive(true)

    return () => {
      source.disconnect()
      gain.disconnect()
      ctx.close().catch(() => {})
      ctxRef.current = null
      gainRef.current = null
      setActive(false)
    }
  }, [stream, enabled])

  useEffect(() => {
    if (gainRef.current) { gainRef.current.gain.value = volume / 100 }
  }, [volume])

  return (
    <div className="flex items-center gap-2">
      {active ? (
        <span className="text-xs font-mono" style={{ color: 'var(--gold)' }}>
          <span className="w-2 h-2 rounded-full inline-block mr-1 animate-pulse" style={{ background: '#4ade80' }} />
          Monitoring
        </span>
      ) : enabled && !stream ? (
        <span className="text-xs font-mono" style={{ color: '#fca5a5' }}>No mic stream</span>
      ) : (
        <span className="text-xs font-mono" style={{ color: 'var(--dim)' }}>Off</span>
      )}
    </div>
  )
}

export default function RadioStudio({
  broadcastId, title, description, scripture,
  churchOnlineUrl: _churchOnlineUrl, status, startTime, selectedDevice,
  thumbnailUrl,
  onPause, onResume, onEnd, actionLoading,
  recordEnabled
}: Props) {
  const [micMuted, setMicMuted] = useState(false)
  const [micGain, setMicGain] = useState(80)

  /* ── Background music mixer state ── */
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [musicVolume, setMusicVolume] = useState(25)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicLoop, setMusicLoop] = useState(true)
  const [musicName, setMusicName] = useState('')
  const [musicLoading, setMusicLoading] = useState(false)

  /* ── Chat state ── */
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatUsers, setChatUsers] = useState<{ user_id: string; user_name: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const prevMsgLenRef = useRef(0)

  /* ── Mixer Audio graph refs ── */
  const mixerCtxRef = useRef<AudioContext | null>(null)
  const mixerDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micGainNodeRef = useRef<GainNode | null>(null)
  const musicGainNodeRef = useRef<GainNode | null>(null)
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const musicBufferRef = useRef<AudioBuffer | null>(null)
  const [copied, setCopied] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [streamStats, setStreamStats] = useState({ chunkCount: 0, bitrate: 0, latestChunk: -1 })
  const [uploadError, setUploadError] = useState('')
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [monitorVolume, setMonitorVolume] = useState(60)
  const [recordingStatus, setRecordingStatus] = useState('')
  const [recordDirHandle, setRecordDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState(selectedDevice || '')
  const activeDeviceIdRef = useRef(selectedDevice || '')
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [recordingUrl, setRecordingUrl] = useState('')

  const isLive = status === 'live'

  /* ── Enumerate mic devices & watch for hotplug ── */
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const mics = devices.filter(d => d.kind === 'audioinput')
      setAudioDevices(mics)
      // If active device is no longer in list, fall back to default
      if (activeDeviceIdRef.current && !mics.find(d => d.deviceId === activeDeviceIdRef.current)) {
        const fallback = mics[0]?.deviceId || ''
        activeDeviceIdRef.current = fallback
        setActiveDeviceId(fallback)
        if (isLive) {
          stopStreaming()
          setTimeout(() => startStreaming(), 300)
        }
      }
    } catch {}
  }

  useEffect(() => {
    // Request mic permission first so labels are visible, then enumerate
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); enumerateDevices() })
      .catch(() => enumerateDevices())
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
  }, [])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkIndexRef = useRef(0)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkTimesRef = useRef<number[]>([])
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldRecordRef = useRef(false)
  const localRecorderRef = useRef<MediaRecorder | null>(null)
  const fileWritableRef = useRef<FileSystemWritableFileStream | null>(null)
  const cloudRecorderRef = useRef<MediaRecorder | null>(null)
  const cloudBlobsRef = useRef<Blob[]>([])
  const cloudMimeRef = useRef('audio/webm')

  useEffect(() => {
    if (!recordEnabled) return
    getRecordingConfig().then(config => {
      if (config?.directoryHandle) setRecordDirHandle(config.directoryHandle)
    })
  }, [recordEnabled])

  useEffect(() => {
    shouldRecordRef.current = isLive
    if (shouldRecordRef.current) { startStreaming() } else { stopStreaming() }
    return () => stopStreaming()
  }, [isLive, activeDeviceId, broadcastId])

  // Poll chat messages + active users for this broadcast
  useEffect(() => {
    if (!broadcastId) return
    const token = localStorage.getItem('token')
    async function fetchChat() {
      try {
        const { data } = await axios.get(`${API_BASE}/api/chat/${broadcastId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const messages = data.messages || []
        setChatMessages(messages)
        if (messages.length > prevMsgLenRef.current) {
          setNewMsgCount(c => c + (messages.length - prevMsgLenRef.current))
        }
        prevMsgLenRef.current = messages.length
      } catch {}
    }
    async function fetchUsers() {
      try {
        const { data } = await axios.get(`${API_BASE}/api/chat/${broadcastId}/users`)
        setChatUsers(data.users || [])
      } catch {}
    }
    fetchChat(); fetchUsers()
    const msgInterval = setInterval(fetchChat, 2000)
    const userInterval = setInterval(fetchUsers, 5000)
    return () => { clearInterval(msgInterval); clearInterval(userInterval) }
  }, [broadcastId])

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatMessages])

  async function sendChatMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || !broadcastId) return
    const token = localStorage.getItem('token')
    if (!token) return
    setChatSending(true)
    try {
      await axios.post(`${API_BASE}/api/chat/${broadcastId}`, { message: chatInput.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setChatInput('')
      // Refresh immediately
      const { data } = await axios.get(`${API_BASE}/api/chat/${broadcastId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setChatMessages(data.messages || [])
      prevMsgLenRef.current = data.messages?.length || 0
    } catch { setUploadError('Chat send failed') }
    finally { setChatSending(false) }
  }

  /* ── Mixer helpers ── */
  function getOrCreateMixer(): { ctx: AudioContext; dest: MediaStreamAudioDestinationNode; micGain: GainNode; musicGain: GainNode } {
    if (mixerCtxRef.current && mixerDestRef.current && micGainNodeRef.current && musicGainNodeRef.current) {
      return { ctx: mixerCtxRef.current, dest: mixerDestRef.current, micGain: micGainNodeRef.current, musicGain: musicGainNodeRef.current }
    }
    const ctx = new AudioContext()
    mixerCtxRef.current = ctx
    const dest = ctx.createMediaStreamDestination()
    mixerDestRef.current = dest
    const micG = ctx.createGain()
    micG.gain.value = micGain / 100
    micG.connect(dest)
    micGainNodeRef.current = micG
    const musG = ctx.createGain()
    musG.gain.value = musicVolume / 100
    musG.connect(dest)
    musicGainNodeRef.current = musG
    return { ctx, dest, micGain: micG, musicGain: musG }
  }

  function teardownMixer() {
    stopMusicPlayback()
    if (mixerCtxRef.current) { mixerCtxRef.current.close().catch(() => {}); mixerCtxRef.current = null }
    mixerDestRef.current = null
    micGainNodeRef.current = null
    musicGainNodeRef.current = null
  }

  function stopMusicPlayback() {
    if (musicSourceRef.current) {
      try { musicSourceRef.current.stop() } catch {}
      musicSourceRef.current.disconnect()
      musicSourceRef.current = null
    }
    setMusicPlaying(false)
  }

  function startMusicPlayback() {
    const buf = musicBufferRef.current
    const musicGain = musicGainNodeRef.current
    const ctx = mixerCtxRef.current
    if (!buf || !musicGain || !ctx) return
    stopMusicPlayback()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = musicLoop
    src.connect(musicGain)
    src.onended = () => { if (!src.loop) setMusicPlaying(false) }
    src.start(0)
    musicSourceRef.current = src
    setMusicPlaying(true)
  }

  async function loadMusicFile(file: File) {
    setMusicLoading(true)
    setMusicName(file.name)
    try {
      const arrayBuf = await file.arrayBuffer()
      const ctx = mixerCtxRef.current || new AudioContext()
      if (!mixerCtxRef.current) {
        mixerCtxRef.current = ctx
      }
      const decoded = await ctx.decodeAudioData(arrayBuf)
      musicBufferRef.current = decoded
      setMusicLoading(false)
    } catch {
      setMusicLoading(false)
      alert('Could not decode audio file. Try a different format.')
    }
  }

  async function startStreaming() {
    try {
      const deviceId = activeDeviceIdRef.current
      const rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      })

      /* ── Build mixer graph ── */
      const { ctx, dest, micGain: micGNode } = getOrCreateMixer()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      // Connect raw mic into mixer's mic gain node
      const micSource = ctx.createMediaStreamSource(rawMicStream)
      micSource.connect(micGNode)

      // Mixed stream (mic + any music) goes to all recorders
      const stream = dest.stream
      streamRef.current = stream
      setMicStream(rawMicStream)
      recordNextChunk()

      // Start local recording alongside server streaming
      if (recordEnabled && recordDirHandle) {
        try {
          const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'broadcast'
          const filename = `${safeTitle}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`
          const fileHandle = await recordDirHandle.getFileHandle(filename, { create: true })
          fileWritableRef.current = await fileHandle.createWritable()
          const localMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm'
          const localRecorder = new MediaRecorder(stream, { mimeType: localMime, audioBitsPerSecond: 128000 })
          localRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0 && fileWritableRef.current) {
              await fileWritableRef.current.write(e.data)
            }
          }
          localRecorder.start(5000)
          localRecorderRef.current = localRecorder
          setRecordingStatus(`Recording: ${filename}`)
        } catch (err: any) {
          setRecordingStatus(`Recording failed: ${err.message || err}`)
        }
      }

      // Cloud recording — stream all blobs into memory for upload on end
      const cloudMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      cloudMimeRef.current = cloudMime
      cloudBlobsRef.current = []
      const cloudRecorder = new MediaRecorder(stream, { mimeType: cloudMime, audioBitsPerSecond: 128000 })
      cloudRecorder.ondataavailable = (e) => { if (e.data.size > 0) cloudBlobsRef.current.push(e.data) }
      cloudRecorder.start(5000)
      cloudRecorderRef.current = cloudRecorder

      statsIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API_BASE}/api/stream/${broadcastId}/info`)
          const times = chunkTimesRef.current
          let bitrate = 0
          if (times.length >= 2) {
            const span = (times[times.length - 1] - times[0]) / 1000
            bitrate = span > 0 ? Math.round((times.length * 32) / span) : 0
          }
          setStreamStats({ chunkCount: data.totalChunks, bitrate, latestChunk: data.latestChunk })
        } catch {}
      }, 3000)
    } catch {
      setUploadError('Could not access microphone for streaming')
    }
  }

  function recordNextChunk() {
    if (!shouldRecordRef.current || !streamRef.current || !broadcastId) return
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    const recorder = new MediaRecorder(streamRef.current, { mimeType, audioBitsPerSecond: 128000 })

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && broadcastId) {
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1]
          chunkTimesRef.current.push(Date.now())
          if (chunkTimesRef.current.length > 10) chunkTimesRef.current.shift()
          try {
            await axios.post(`${API_BASE}/api/stream/${broadcastId}/chunk`, {
              chunkIndex: chunkIndexRef.current++,
              chunkData: base64
            }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
            setUploadError('')
          } catch { setUploadError('Upload failed - check connection') }
        }
        reader.readAsDataURL(e.data)
      }
    }

    recorder.onstop = () => {
      if (shouldRecordRef.current && streamRef.current) {
        recordNextChunk()
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()

    chunkTimeoutRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, 2000)
  }

  function stopStreaming(triggerUpload = false): Promise<void> {
    teardownMixer()
    shouldRecordRef.current = false
    if (chunkTimeoutRef.current) { clearTimeout(chunkTimeoutRef.current); chunkTimeoutRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setMicStream(null)
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null }
    mediaRecorderRef.current = null
    chunkTimesRef.current = []
    if (localRecorderRef.current && localRecorderRef.current.state !== 'inactive') {
      localRecorderRef.current.stop()
    }
    if (fileWritableRef.current) {
      fileWritableRef.current.close().catch(() => {})
      fileWritableRef.current = null
    }
    localRecorderRef.current = null
    setRecordingStatus('')

    // Snapshot blobs NOW before the recorder is nulled
    const blobsSnapshot = [...cloudBlobsRef.current]
    const mimeSnapshot = cloudMimeRef.current
    const idSnapshot = broadcastId

    // Return a Promise that resolves only after the cloud upload completes
    const uploadPromise = new Promise<void>((resolve) => {
      if (!triggerUpload || blobsSnapshot.length === 0 || !idSnapshot) { resolve(); return }

      async function doUpload(blobs: Blob[]) {
        setUploadProgress('uploading')
        setRecordingStatus('Uploading recording to cloud...')
        try {
          const blob = new Blob(blobs, { type: mimeSnapshot })
          const formData = new FormData()
          formData.append('recording', blob, `broadcast_${idSnapshot}.webm`)
          const { data } = await axios.post(`${API_BASE}/api/broadcasts/${idSnapshot}/recording`, formData, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' }
          })
          setRecordingUrl(data.recording_url)
          setUploadProgress('done')
          setRecordingStatus('Recording saved to cloud.')
          cloudBlobsRef.current = []
        } catch (e: any) {
          setUploadProgress('error')
          setRecordingStatus('Cloud upload failed: ' + (e.response?.data?.error || e.message || 'Unknown error'))
        } finally { resolve() }
      }

      if (cloudRecorderRef.current && cloudRecorderRef.current.state !== 'inactive') {
        cloudRecorderRef.current.onstop = () => {
          const finalBlobs = [...blobsSnapshot, ...cloudBlobsRef.current.slice(blobsSnapshot.length)]
          doUpload(finalBlobs.length > 0 ? finalBlobs : blobsSnapshot)
        }
        cloudRecorderRef.current.stop()
      } else {
        doUpload(blobsSnapshot)
      }
    })

    cloudRecorderRef.current = null
    return uploadPromise
  }

  async function retryUpload() {
    if (cloudBlobsRef.current.length === 0 || !broadcastId) return
    setUploadProgress('uploading')
    setRecordingStatus('Uploading recording to cloud...')
    try {
      const blob = new Blob(cloudBlobsRef.current, { type: cloudMimeRef.current })
      const formData = new FormData()
      formData.append('recording', blob, `broadcast_${broadcastId}.webm`)
      const { data } = await axios.post(`${API_BASE}/api/broadcasts/${broadcastId}/recording`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' }
      })
      setRecordingUrl(data.recording_url)
      setUploadProgress('done')
      setRecordingStatus('Recording saved to cloud.')
      cloudBlobsRef.current = []
    } catch (e: any) {
      setUploadProgress('error')
      setRecordingStatus('Cloud upload failed: ' + (e.response?.data?.error || e.message || 'Unknown error'))
    }
  }

  async function downloadRecording(id: string) {
    try {
      setRecordingStatus('Starting download...')
      const res = await fetch(`${API_BASE}/api/broadcasts/${id}/recording/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
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
      setRecordingStatus('Download started.')
    } catch (e: any) {
      setRecordingStatus('Download failed: ' + (e.message || 'Unknown error'))
    }
  }

  useEffect(() => {
    if (!broadcastId) return
    return () => {
      axios.delete(`${API_BASE}/api/stream/${broadcastId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).catch(() => {})
    }
  }, [broadcastId])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/broadcasts/stats/overview`)
        setListenerCount(data.live || 0)
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [isLive])

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isNative = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
  const streamUrl = `${isNative ? 'https://www.zionite.online' : window.location.origin}/live${broadcastId ? `/${broadcastId}` : ''}`

  return (
    <div>
      {/* Status Header */}
      <div className="p-5 flex items-center justify-between flex-wrap gap-3"
        style={{ background: isLive ? 'var(--gold)' : 'var(--oxblood)', color: isLive ? '#1b1208' : 'var(--parchment)' }}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: isLive ? 'rgba(27,18,8,0.2)' : 'rgba(255,255,255,0.1)' }}>
              <Radio className="w-6 h-6" />
            </div>
            {isLive && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#1b1208' }} />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5" style={{ background: '#1b1208' }} />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
                style={{ background: isLive ? 'rgba(27,18,8,0.2)' : 'rgba(255,255,255,0.15)' }}>
                {isLive ? 'Live' : 'Paused'}
              </span>
              <BroadcastTimer startTime={startTime} />
            </div>
            <h2 className="text-lg font-bold truncate max-w-[200px] sm:max-w-xs">{title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NetworkIndicator />
          {isLive ? (
            <button onClick={onPause} disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              style={{ background: 'rgba(27,18,8,0.2)', color: '#1b1208' }}>
              <Pause className="w-4 h-4" /> Pause
            </button>
          ) : (
            <button onClick={onResume} disabled={actionLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--parchment)' }}>
              <Play className="w-4 h-4" /> Resume
            </button>
          )}
          <button onClick={() => { onEnd(stopStreaming(true)) }} disabled={actionLoading || uploadProgress === 'uploading'}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            style={{ background: 'rgba(220,38,38,0.3)', color: '#fca5a5' }}>
            <Square className="w-4 h-4" /> End
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mx-6 mt-4 p-3 rounded-xl text-sm flex items-center gap-2"
          style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
          <Wifi className="w-4 h-4" /> {uploadError}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Audio Meters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--dim)' }}>
              <Activity className="w-3.5 h-3.5 inline mr-1" /> VU Meter
            </label>
            <VUMeter active={isLive && !micMuted} deviceId={selectedDevice} stream={micStream || undefined} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--dim)' }}>
              <Activity className="w-3.5 h-3.5 inline mr-1" /> Waveform
            </label>
            <AudioWaveVisualizer active={isLive && !micMuted} micMuted={micMuted} stream={micStream || undefined} />
          </div>
        </div>

        {/* Stream Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={HardDrive} label="Chunks" value={streamStats.chunkCount} />
          <StatCard icon={Zap} label="Bitrate" value={`${streamStats.bitrate} kbps`} />
          <StatCard icon={Headphones} label="Listeners" value={listenerCount} />
          <StatCard icon={Wifi} label="Status" value={isLive ? 'Streaming' : 'Paused'} color={isLive ? '#4ade80' : '#f59e0b'} />
        </div>

        {/* Recording Status */}
        {uploadProgress === 'uploading' && (
          <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg animate-pulse"
            style={{ background: 'rgba(201,162,39,0.1)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.2)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading recording to cloud — do not close the browser...
          </div>
        )}
        {uploadProgress === 'done' && recordingUrl && (
          <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle className="w-3.5 h-3.5" />
            Recording saved. Auto-deletes in 90 days.
            <button
              onClick={() => downloadRecording(broadcastId)}
              className="ml-auto underline hover:opacity-80" style={{ color: '#c9a227' }}>
              Download
            </button>
          </div>
        )}
        {uploadProgress === 'error' && (
          <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
            <Wifi className="w-3.5 h-3.5" /> {recordingStatus}
            <button onClick={retryUpload} className="ml-auto underline hover:opacity-80 text-[#c9a227]">Retry</button>
          </div>
        )}
        {uploadProgress === 'idle' && recordingStatus && (
          <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg"
            style={{ background: recordingStatus.startsWith('Recording:') ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)', color: recordingStatus.startsWith('Recording:') ? '#4ade80' : '#fca5a5', border: `1px solid ${recordingStatus.startsWith('Recording:') ? 'rgba(34,197,94,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
            <Disc className="w-3.5 h-3.5" /> {recordingStatus}
          </div>
        )}

        {/* Feedback Monitor */}
        <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <Headphones className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Feedback Monitor
              <span className="text-xs font-normal" style={{ color: 'var(--dim)' }}>(real-time mic monitor)</span>
            </span>
            <button onClick={() => setMonitorEnabled(!monitorEnabled)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: monitorEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
                color: monitorEnabled ? '#4ade80' : '#fca5a5',
                border: `1px solid ${monitorEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(220,38,38,0.2)'}`
              }}>
              {monitorEnabled ? 'On' : 'Off'}
            </button>
          </div>
          {monitorEnabled && (
            <>
              <MonitorPlayer stream={micStream} enabled={isLive && monitorEnabled} volume={monitorVolume} />
              <div className="flex items-center gap-3 mt-3">
                {monitorVolume === 0 ? <VolumeX className="w-4 h-4" style={{ color: 'var(--dim)' }} /> :
                  monitorVolume > 60 ? <Volume2 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> :
                  <Volume1 className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
                <input type="range" min={0} max={100} value={monitorVolume}
                  onChange={e => setMonitorVolume(parseInt(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, var(--gold) ${monitorVolume}%, var(--line) ${monitorVolume}%)` }} />
                <span className="text-xs font-mono w-8 text-right">{monitorVolume}%</span>
              </div>
            </>
          )}
        </div>

        {/* Mic Controls */}
        <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              {micMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
              Microphone Input
            </span>
            <button onClick={() => {
                const muted = !micMuted
                setMicMuted(muted)
                if (micGainNodeRef.current) micGainNodeRef.current.gain.value = muted ? 0 : micGain / 100
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: micMuted ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.1)',
                color: micMuted ? '#fca5a5' : '#4ade80',
                border: `1px solid ${micMuted ? 'rgba(220,38,38,0.3)' : 'rgba(34,197,94,0.2)'}`
              }}>
              {micMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {micMuted ? <VolumeX className="w-4 h-4" style={{ color: 'var(--dim)' }} /> : (
              micGain > 60 ? <Volume2 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> :
              micGain > 20 ? <Volume1 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> :
              <VolumeX className="w-4 h-4" style={{ color: 'var(--dim)' }} />
            )}
            <input type="range" min={0} max={100} value={micGain}
              onChange={e => {
                const v = parseInt(e.target.value)
                setMicGain(v)
                if (micGainNodeRef.current && !micMuted) micGainNodeRef.current.gain.value = v / 100
              }}
              disabled={micMuted}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, var(--gold) ${micGain}%, var(--line) ${micGain}%)`, opacity: micMuted ? 0.4 : 1 }} />
            <span className="text-xs font-mono w-8 text-right">{micGain}%</span>
          </div>
        </div>

        {/* Background Music Mixer */}
        <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <Music2 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Background Music
              <span className="text-xs font-normal" style={{ color: 'var(--dim)' }}>(mixed into stream)</span>
            </span>
            {musicFile && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const newLoop = !musicLoop
                    setMusicLoop(newLoop)
                    if (musicSourceRef.current) musicSourceRef.current.loop = newLoop
                  }}
                  title={musicLoop ? 'Loop on' : 'Loop off'}
                  className="p-1.5 rounded-lg text-xs transition-colors"
                  style={{ background: musicLoop ? 'rgba(201,162,39,0.15)' : 'var(--ink-2)', color: musicLoop ? 'var(--gold)' : 'var(--dim)', border: '1px solid var(--line)' }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (musicPlaying) { stopMusicPlayback() }
                    else { startMusicPlayback() }
                  }}
                  disabled={!musicBufferRef.current || !mixerCtxRef.current}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-40"
                  style={{
                    background: musicPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
                    color: musicPlaying ? '#fca5a5' : '#4ade80',
                    border: `1px solid ${musicPlaying ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)'}`
                  }}>
                  {musicPlaying ? <><StopCircle className="w-3.5 h-3.5" /> Stop</> : <><Play className="w-3.5 h-3.5" /> Play</>}
                </button>
              </div>
            )}
          </div>

          {/* File picker — use an invisible overlay instead of display:none so Android WebView triggers it reliably */}
          <label className="relative flex items-center gap-2 cursor-pointer mb-3 px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'var(--ink-2)', border: '1px dashed var(--line)' }}>
            <Upload className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold)' }} />
            <span className="text-xs truncate" style={{ color: musicName ? 'var(--parchment)' : 'var(--dim)' }}>
              {musicLoading ? 'Decoding audio...' : musicName || 'Upload background music (MP3, WAV, OGG…)'}
            </span>
            {musicLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto flex-shrink-0" style={{ color: 'var(--gold)' }} />}
            <input type="file" accept="audio/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              style={{ zIndex: 10 }}
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                setMusicFile(file)
                stopMusicPlayback()
                musicBufferRef.current = null
                await loadMusicFile(file)
              }} />
          </label>

          {/* Music volume */}
          <div className="flex items-center gap-3">
            {musicVolume === 0 ? <VolumeX className="w-4 h-4" style={{ color: 'var(--dim)' }} /> :
              musicVolume > 50 ? <Volume2 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> :
              <Volume1 className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
            <input type="range" min={0} max={100} value={musicVolume}
              onChange={e => {
                const v = parseInt(e.target.value)
                setMusicVolume(v)
                if (musicGainNodeRef.current) musicGainNodeRef.current.gain.value = v / 100
              }}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #c9a227 ${musicVolume}%, var(--line) ${musicVolume}%)` }} />
            <span className="text-xs font-mono w-8 text-right">{musicVolume}%</span>
          </div>
          {!isLive && musicFile && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--dim)' }}>
              Music will play when the broadcast goes live. Start it with the Play button above.
            </p>
          )}
          {isLive && !musicFile && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--dim)' }}>
              Upload a track and press Play — it will be mixed into your live stream.
            </p>
          )}
        </div>

        {/* Live Chat Panel — broadcaster can see and reply to listeners */}
        <div className="rounded-xl p-4 flex flex-col" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Live Chat
              {newMsgCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'var(--gold)', color: '#1b1208' }}>
                  {newMsgCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
              <User className="w-3.5 h-3.5" />
              <span>{chatUsers.length} active</span>
              <button
                onClick={() => setNewMsgCount(0)}
                className="ml-2 px-2 py-0.5 rounded text-[10px] transition-colors"
                style={{ background: 'var(--ink-2)', color: 'var(--dim)', border: '1px solid var(--line)' }}>
                Clear badge
              </button>
            </div>
          </div>

          <div ref={chatScrollRef}
            className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1"
            style={{ maxHeight: 360, minHeight: 180 }}>
            {chatMessages.length === 0 ? (
              <div className="text-center py-8 text-xs" style={{ color: 'var(--dim)' }}>
                No messages yet. Listeners will appear here as they chat.
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isBroadcaster = msg.user_id && msg.user_name === 'Broadcaster'
                return (
                  <div key={msg.id || idx} className="rounded-lg px-3 py-2"
                    style={{
                      background: isBroadcaster ? 'rgba(201,162,39,0.12)' : 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      borderLeft: isBroadcaster ? '2px solid var(--gold)' : '1px solid var(--line)'
                    }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium" style={{ color: isBroadcaster ? 'var(--gold)' : 'var(--parchment)' }}>
                        {msg.user_name || msg.guest_name || 'Anonymous'}
                        {msg.is_private && <span className="ml-1.5 text-[9px]" style={{ color: 'var(--gold)' }}>(private)</span>}
                      </span>
                      <span className="text-[10px] font-mono flex items-center gap-0.5" style={{ color: 'var(--dim)' }}>
                        <Clock className="w-2.5 h-2.5" /> {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--parchment)' }}>{msg.message}</p>
                  </div>
                )
              })
            )}
          </div>

          <form onSubmit={sendChatMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Reply to listeners..."
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
            />
            <button type="submit" disabled={!chatInput.trim() || chatSending}
              className="px-3 py-2 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--gold)', color: '#1b1208' }}>
              {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </form>
        </div>

        {/* Stream URL */}
        <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Stream URL
            </span>
          </div>
          <div className="flex gap-2">
            <input type="text" readOnly value={streamUrl}
              className="flex-1 rounded-lg px-3 py-2 text-sm border"
              style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
            <button onClick={() => copyToClipboard(streamUrl)}
              className="px-3 py-2 rounded-lg flex items-center gap-1 text-sm"
              style={{ background: 'var(--gold)', color: '#1b1208' }}>
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Mic Device Selector */}
        {audioDevices.length > 1 && (
          <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium flex items-center gap-2">
                <Mic className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Audio Input Device
              </span>
            </div>
            <select
              value={activeDeviceId}
              onChange={e => {
                activeDeviceIdRef.current = e.target.value
                setActiveDeviceId(e.target.value)
              }}
              className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
              style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
            >
              <option value="">Default microphone</option>
              {audioDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--dim)' }}>
              Switching device during a live broadcast will restart the audio stream.
            </p>
          </div>
        )}

        {/* Broadcast Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {thumbnailUrl && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              <img src={thumbnailUrl} alt="Broadcast thumbnail" className="w-full h-40 object-cover" />
              <div className="p-3" style={{ background: 'var(--ink)' }}>
                <span className="text-xs font-medium block mb-1" style={{ color: 'var(--dim)' }}>Description</span>
                <p className="text-sm">{description || 'No description'}</p>
              </div>
            </div>
          )}
          {!thumbnailUrl && (
            <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
              <span className="text-xs font-medium block mb-1" style={{ color: 'var(--dim)' }}>Description</span>
              <p className="text-sm">{description || 'No description'}</p>
            </div>
          )}
          <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
            <span className="text-xs font-medium block mb-1" style={{ color: 'var(--dim)' }}>Scripture</span>
            <p className="text-sm">{scripture || 'No scripture reference'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
