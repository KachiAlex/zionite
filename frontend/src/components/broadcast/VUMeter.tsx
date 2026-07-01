import { useEffect, useRef } from 'react'

interface VUMeterProps {
  active: boolean
  deviceId?: string
  onLevelChange?: (level: number) => void
  width?: number
  height?: number
  stream?: MediaStream
}

export default function VUMeter({ active, deviceId, onLevelChange, width = 280, height = 120, stream: externalStream }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const rafRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (ctxRef.current && ctxRef.current.state !== 'closed') { ctxRef.current.close(); ctxRef.current = null }
      analyserRef.current = null
      dataRef.current = null
      // Draw zero state
      const cvs = canvasRef.current
      if (cvs) {
        const ctx = cvs.getContext('2d')
        if (ctx) drawMeter(ctx, cvs, 0, 0)
      }
      return
    }

    let running = true
    let ownStream = false
    async function init() {
      try {
        let stream = externalStream || null
        if (!stream) {
          const constraints: MediaStreamConstraints = {
            audio: deviceId
              ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
              : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          }
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          ownStream = true
        }
        if (!running) { if (ownStream && stream) stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const ctx = new AudioContext()
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        src.connect(analyser)
        analyserRef.current = analyser
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
        draw()
      } catch {
        // Mic access denied
        const cvs = canvasRef.current
        if (cvs) {
          const ctx = cvs.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, cvs.width, cvs.height)
            ctx.fillStyle = '#ef4444'
            ctx.font = '14px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('Microphone access denied', cvs.width / 2, cvs.height / 2)
          }
        }
      }
    }

    function draw() {
      if (!running) return
      const canvas = canvasRef.current
      const analyser = analyserRef.current
      const data = dataRef.current
      if (!canvas || !analyser || !data) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ;(analyser as any).getByteFrequencyData(data)
      // Calculate RMS volume
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)
      const level = Math.min(100, (rms / 255) * 140) // scale up for sensitivity
      const peak = Math.max(...data) / 2.55

      if (onLevelChange) onLevelChange(level)
      drawMeter(ctx, canvas, level, peak)
      rafRef.current = requestAnimationFrame(draw)
    }

    init()
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (ownStream && streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (ctxRef.current && ctxRef.current.state !== 'closed') { ctxRef.current.close(); ctxRef.current = null }
    }
  }, [active, deviceId, onLevelChange, externalStream])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', maxWidth: width, height: height, borderRadius: 12 }}
    />
  )
}

function drawMeter(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, level: number, peak: number) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const padding = 16
  const barHeight = 24
  const barY = (canvas.height - barHeight) / 2
  const barWidth = canvas.width - padding * 2

  // Background bar
  ctx.fillStyle = '#1e1e24'
  ctx.beginPath()
  ctx.roundRect(padding, barY, barWidth, barHeight, 6)
  ctx.fill()

  // Segments
  const segments = 40
  const segmentGap = 2
  const segmentWidth = (barWidth - (segments + 1) * segmentGap) / segments
  const activeSegments = Math.floor((level / 100) * segments)
  const peakSegment = Math.floor((peak / 100) * segments)

  for (let i = 0; i < segments; i++) {
    const x = padding + segmentGap + i * (segmentWidth + segmentGap)
    const isActive = i < activeSegments
    const isPeak = i === peakSegment && peak > 0

    if (isPeak) {
      ctx.fillStyle = '#f87171'
    } else if (isActive) {
      // Gradient from green → yellow → red
      const pct = i / segments
      if (pct < 0.6) ctx.fillStyle = '#4ade80'
      else if (pct < 0.8) ctx.fillStyle = '#facc15'
      else ctx.fillStyle = '#f87171'
    } else {
      ctx.fillStyle = '#2a2a35'
    }

    ctx.beginPath()
    ctx.roundRect(x, barY + 3, segmentWidth, barHeight - 6, 2)
    ctx.fill()
  }

  // Numeric readout
  ctx.fillStyle = '#c9a227'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`${Math.round(level).toString().padStart(2, '0')} dB`, canvas.width - padding, barY - 6)

  // Peak hold indicator
  ctx.fillStyle = peak > 90 ? '#f87171' : '#6b7280'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`Peak: ${Math.round(peak)}%`, padding, barY - 6)
}
