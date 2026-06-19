import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Radio, Pause, Play, Square, Mic, MicOff, Volume2, Volume1, VolumeX,
  Copy, CheckCircle, Activity, Share2, Headphones, Wifi, Zap, HardDrive
} from 'lucide-react'
import AudioWaveVisualizer from './AudioWaveVisualizer'
import VUMeter from './VUMeter'

function NetworkIndicator() {
  const [strength, setStrength] = useState(4)
  const [latency, setLatency] = useState(0)
  useEffect(() => {
    const interval = setInterval(async () => {
      const start = Date.now()
      try {
        await fetch('/api/ping', { method: 'GET', cache: 'no-store' })
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
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  actionLoading: boolean
}

/* ── MonitorPlayer (feedback loop) ─────────────────── */
function MonitorPlayer({ broadcastId, enabled, volume }: { broadcastId: string; enabled: boolean; volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastPlayedRef = useRef(-1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [bufferedCount, setBufferedCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  useEffect(() => {
    if (!enabled) return
    lastPlayedRef.current = -1

    async function tick() {
      try {
        const infoRes = await fetch(`/api/stream/${broadcastId}/info`)
        if (!infoRes.ok) return
        const info = await infoRes.json()
        const target = info.latestChunk ?? -1
        if (target <= lastPlayedRef.current) return // nothing new

        const res = await fetch(`/api/stream/${broadcastId}/chunk/${target}`)
        if (!res.ok) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = audioRef.current
        if (!audio) { URL.revokeObjectURL(url); return }
        audio.src = url
        audio.onended = () => { URL.revokeObjectURL(url); setIsPlaying(false) }
        audio.onerror = () => { URL.revokeObjectURL(url); setIsPlaying(false) }
        try {
          await audio.play()
          setIsPlaying(true)
          lastPlayedRef.current = target
          setBufferedCount(c => c + 1)
        } catch { setIsPlaying(false) }
      } catch {}
    }

    tick()
    intervalRef.current = setInterval(tick, 2500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [broadcastId, enabled])

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} className="flex-1" controls style={{ height: 36 }} />
      {isPlaying && (
        <span className="text-xs font-mono" style={{ color: 'var(--gold)' }}>
          <span className="w-2 h-2 rounded-full inline-block mr-1 animate-pulse" style={{ background: '#4ade80' }} />
          Playing
        </span>
      )}
      <span className="text-xs font-mono" style={{ color: 'var(--dim)' }}>{bufferedCount} chunks</span>
    </div>
  )
}

export default function RadioStudio({
  broadcastId, title, description, scripture,
  churchOnlineUrl: _churchOnlineUrl, status, startTime, selectedDevice,
  onPause, onResume, onEnd, actionLoading
}: Props) {
  const [micMuted, setMicMuted] = useState(false)
  const [micGain, setMicGain] = useState(80)
  const [copied, setCopied] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [streamStats, setStreamStats] = useState({ chunkCount: 0, bitrate: 0, latestChunk: -1 })
  const [uploadError, setUploadError] = useState('')
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [monitorVolume, setMonitorVolume] = useState(60)

  const isLive = status === 'live'
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkIndexRef = useRef(0)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkTimesRef = useRef<number[]>([])

  useEffect(() => {
    if (isLive && selectedDevice) { startStreaming() } else { stopStreaming() }
    return () => stopStreaming()
  }, [isLive, selectedDevice, broadcastId])

  async function startStreaming() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true
      })
      streamRef.current = stream
      setMicStream(stream)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && broadcastId) {
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1]
            chunkTimesRef.current.push(Date.now())
            if (chunkTimesRef.current.length > 10) chunkTimesRef.current.shift()
            try {
              await axios.post(`/api/stream/${broadcastId}/chunk`, {
                chunkIndex: chunkIndexRef.current++,
                chunkData: base64
              }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
              setUploadError('')
            } catch { setUploadError('Upload failed - check connection') }
          }
          reader.readAsDataURL(e.data)
        }
      }
      recorder.start(2000)
      mediaRecorderRef.current = recorder

      statsIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await axios.get(`/api/stream/${broadcastId}/info`)
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

  function stopStreaming() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setMicStream(null)
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null }
    mediaRecorderRef.current = null
    chunkTimesRef.current = []
  }

  useEffect(() => {
    if (!broadcastId) return
    return () => {
      axios.delete(`/api/stream/${broadcastId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).catch(() => {})
    }
  }, [broadcastId])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get('/api/broadcasts/stats/overview')
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

  const streamUrl = `${window.location.origin}/live${broadcastId ? `/${broadcastId}` : ''}`

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
          <button onClick={onEnd} disabled={actionLoading}
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

        {/* Feedback Monitor */}
        <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <Headphones className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Feedback Monitor
              <span className="text-xs font-normal" style={{ color: 'var(--dim)' }}>(hear what listeners hear)</span>
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
              <MonitorPlayer broadcastId={broadcastId} enabled={isLive && monitorEnabled} volume={monitorVolume} />
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
            <button onClick={() => setMicMuted(!micMuted)}
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
              onChange={e => setMicGain(parseInt(e.target.value))}
              disabled={micMuted}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, var(--gold) ${micGain}%, var(--line) ${micGain}%)`, opacity: micMuted ? 0.4 : 1 }} />
            <span className="text-xs font-mono w-8 text-right">{micGain}%</span>
          </div>
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

        {/* Broadcast Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
            <span className="text-xs font-medium block mb-1" style={{ color: 'var(--dim)' }}>Description</span>
            <p className="text-sm">{description || 'No description'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
            <span className="text-xs font-medium block mb-1" style={{ color: 'var(--dim)' }}>Scripture</span>
            <p className="text-sm">{scripture || 'No scripture reference'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
