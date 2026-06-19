import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Headphones, Volume2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import VUMeter from './VUMeter'

interface AudioDevice {
  deviceId: string
  label: string
}

interface AudioTestPanelProps {
  onDeviceSelect?: (deviceId: string) => void
  onTestStateChange?: (isTesting: boolean) => void
}

export default function AudioTestPanel({ onDeviceSelect, onTestStateChange }: AudioTestPanelProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [isTesting, setIsTesting] = useState(false)
  const [loopbackEnabled, setLoopbackEnabled] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [hasAudio, setHasAudio] = useState(false)
  const [audioCheckTime, setAudioCheckTime] = useState(0)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopbackNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }))
      setDevices(audioInputs)
      if (audioInputs.length > 0 && !selectedDevice) {
        setSelectedDevice(audioInputs[0].deviceId)
        onDeviceSelect?.(audioInputs[0].deviceId)
      }
    } catch {
      setPermissionStatus('denied')
    }
  }, [selectedDevice, onDeviceSelect])

  useEffect(() => {
    // Request permission first to get labeled devices
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        setPermissionStatus('granted')
        enumerateDevices()
      })
      .catch(() => setPermissionStatus('denied'))

    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
  }, [enumerateDevices])

  // Audio detection
  useEffect(() => {
    if (!isTesting) {
      setHasAudio(false)
      setAudioCheckTime(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    let samples = 0
    let audioDetected = false
    intervalRef.current = setInterval(() => {
      samples++
      if (audioLevel > 5) audioDetected = true
      setAudioCheckTime(samples)
      if (samples >= 5) {
        setHasAudio(audioDetected)
      }
    }, 1000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isTesting, audioLevel])

  // Loopback audio
  useEffect(() => {
    if (!isTesting || !loopbackEnabled) {
      if (loopbackNodeRef.current) { loopbackNodeRef.current = null }
      return
    }

    async function setupLoopback() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true
        })
        streamRef.current = stream
        const ctx = new AudioContext()
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const dest = ctx.createMediaStreamDestination()
        src.connect(dest)
        loopbackNodeRef.current = dest

        // Play the loopback stream
        const audio = new Audio()
        audio.srcObject = dest.stream
        audio.play().catch(() => {})

        return () => {
          audio.pause()
          audio.srcObject = null
        }
      } catch {
        setLoopbackEnabled(false)
      }
    }

    const cleanup = setupLoopback()
    return () => {
      cleanup?.then?.(fn => fn?.())
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (ctxRef.current && ctxRef.current.state !== 'closed') { ctxRef.current.close(); ctxRef.current = null }
    }
  }, [isTesting, loopbackEnabled, selectedDevice])

  function handleDeviceChange(deviceId: string) {
    setSelectedDevice(deviceId)
    onDeviceSelect?.(deviceId)
  }

  return (
    <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
      <h3 className="font-semibold flex items-center gap-2">
        <Mic className="w-4 h-4" style={{ color: 'var(--gold)' }} />
        Audio Test & Setup
      </h3>

      {/* Device Selector */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--dim)' }}>Microphone Device</label>
        <div className="flex gap-2">
          <select
            value={selectedDevice}
            onChange={e => handleDeviceChange(e.target.value)}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          >
            {devices.length === 0 && <option value="">No devices found</option>}
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId} style={{ background: 'var(--ink-2)' }}>{d.label}</option>
            ))}
          </select>
          <button
            onClick={enumerateDevices}
            className="px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--dim)' }}
            title="Refresh devices"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {permissionStatus === 'denied' && (
          <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#fca5a5' }}>
            <AlertTriangle className="w-3 h-3" /> Microphone permission denied. Enable it in browser settings.
          </p>
        )}
      </div>

      {/* VU Meter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{ color: 'var(--dim)' }}>Input Level</label>
          <div className="flex items-center gap-2">
            {hasAudio ? (
              <span className="text-xs flex items-center gap-1" style={{ color: '#4ade80' }}>
                <CheckCircle2 className="w-3 h-3" /> Audio detected
              </span>
            ) : isTesting && audioCheckTime >= 5 ? (
              <span className="text-xs flex items-center gap-1" style={{ color: '#fca5a5' }}>
                <AlertTriangle className="w-3 h-3" /> No audio detected
              </span>
            ) : isTesting ? (
              <span className="text-xs" style={{ color: 'var(--dim)' }}>Checking... {audioCheckTime}s</span>
            ) : null}
          </div>
        </div>
        <VUMeter active={isTesting} deviceId={selectedDevice} onLevelChange={setAudioLevel} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            const next = !isTesting
            setIsTesting(next)
            onTestStateChange?.(next)
            if (!next) {
              setLoopbackEnabled(false)
              setHasAudio(false)
            }
          }}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{
            background: isTesting ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.1)',
            color: isTesting ? '#fca5a5' : '#4ade80',
            border: `1px solid ${isTesting ? 'rgba(220,38,38,0.3)' : 'rgba(34,197,94,0.2)'}`
          }}
        >
          {isTesting ? 'Stop Test' : 'Test Microphone'}
        </button>

        {isTesting && (
          <button
            onClick={() => setLoopbackEnabled(!loopbackEnabled)}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
            style={{
              background: loopbackEnabled ? 'rgba(201,162,39,0.1)' : 'var(--ink-2)',
              color: loopbackEnabled ? 'var(--gold)' : 'var(--dim)',
              border: `1px solid ${loopbackEnabled ? 'var(--gold)' : 'var(--line)'}`
            }}
          >
            <Headphones className="w-4 h-4" />
            {loopbackEnabled ? 'Disable Loopback' : 'Hear Yourself'}
          </button>
        )}
      </div>

      {loopbackEnabled && (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--dim)' }}>
          <Volume2 className="w-3 h-3" />
          You should hear your voice through your speakers/headphones.
        </p>
      )}
    </div>
  )
}
