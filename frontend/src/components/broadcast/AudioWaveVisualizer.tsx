import { useEffect, useRef } from 'react'

export default function AudioWaveVisualizer({ active, micMuted, stream: externalStream }: { active: boolean; micMuted: boolean; stream?: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const rafRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active || micMuted) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (ctxRef.current && ctxRef.current.state !== 'closed') { ctxRef.current.close(); ctxRef.current = null }
      analyserRef.current = null
      dataRef.current = null
      const cvs = canvasRef.current
      if (cvs) {
        const ctx = cvs.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, cvs.width, cvs.height)
          ctx.fillStyle = '#c9a227'
          const barCount = 32
          const barW = (cvs.width / barCount) * 0.6
          const gap = (cvs.width / barCount) * 0.4
          for (let i = 0; i < barCount; i++) {
            const h = 4
            ctx.fillRect(i * (barW + gap) + gap / 2, (cvs.height - h) / 2, barW, h)
          }
        }
      }
      return
    }

    let running = true
    let ownStream = false
    async function init() {
      try {
        let stream = externalStream || null
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          ownStream = true
        }
        if (!running) { if (ownStream && stream) stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const ctx = new AudioContext()
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.7
        src.connect(analyser)
        analyserRef.current = analyser
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
        draw()
      } catch {
        drawSimulated()
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
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barCount = 32
      const barW = (canvas.width / barCount) * 0.6
      const gap = (canvas.width / barCount) * 0.4
      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * (data.length / 2))
        const value = data[idx] || 0
        const pct = value / 255
        const h = Math.max(4, pct * canvas.height * 0.9)
        const y = (canvas.height - h) / 2
        const gradient = ctx.createLinearGradient(0, y, 0, y + h)
        gradient.addColorStop(0, 'rgba(201,162,39,0.3)')
        gradient.addColorStop(0.5, '#c9a227')
        gradient.addColorStop(1, 'rgba(201,162,39,0.3)')
        ctx.fillStyle = gradient
        ctx.fillRect(i * (barW + gap) + gap / 2, y, barW, h)
      }
      rafRef.current = requestAnimationFrame(draw)
    }

    let simPhase = 0
    function drawSimulated() {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barCount = 32
      const barW = (canvas.width / barCount) * 0.6
      const gap = (canvas.width / barCount) * 0.4
      simPhase += 0.08
      for (let i = 0; i < barCount; i++) {
        const wave = Math.sin(simPhase + i * 0.4) * 0.5 + 0.5
        const h = Math.max(4, wave * canvas.height * 0.7)
        const y = (canvas.height - h) / 2
        const gradient = ctx.createLinearGradient(0, y, 0, y + h)
        gradient.addColorStop(0, 'rgba(201,162,39,0.2)')
        gradient.addColorStop(0.5, '#c9a227')
        gradient.addColorStop(1, 'rgba(201,162,39,0.2)')
        ctx.fillStyle = gradient
        ctx.fillRect(i * (barW + gap) + gap / 2, y, barW, h)
      }
      rafRef.current = requestAnimationFrame(drawSimulated)
    }

    init()
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (ownStream && streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      if (ctxRef.current && ctxRef.current.state !== 'closed') { ctxRef.current.close(); ctxRef.current = null }
    }
  }, [active, micMuted, externalStream])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={80}
      className="w-full h-20 rounded-xl"
      style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}
    />
  )
}
