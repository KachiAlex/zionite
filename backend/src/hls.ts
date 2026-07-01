import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HLS_ROOT = process.env.HLS_DIR || '/tmp/hls'

interface BroadcastHls {
  ffmpeg: ChildProcess
  dir: string
  manifest: string
  ended: boolean
  initSent: boolean
  chunksReceived: boolean
  lastChunkAt: number
  timeoutRef: NodeJS.Timeout | null
}

const CLUSTER_ID = Buffer.from([0x1F, 0x43, 0xB6, 0x75])
const SEGMENT_ID = Buffer.from([0x18, 0x53, 0x80, 0x67])

// EBML VINT unknown-size encodings by class
const UNKNOWN_SIZE: Record<number, Buffer> = {
  1: Buffer.from([0x7F]),
  2: Buffer.from([0x7F, 0xFF]),
  3: Buffer.from([0x3F, 0xFF, 0xFF]),
  4: Buffer.from([0x1F, 0xFF, 0xFF, 0xFF]),
  5: Buffer.from([0x0F, 0xFF, 0xFF, 0xFF, 0xFF]),
  6: Buffer.from([0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
  7: Buffer.from([0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
  8: Buffer.from([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
}

function vintWidth(firstByte: number): number {
  if (firstByte >= 0x80) return 1
  if (firstByte >= 0x40) return 2
  if (firstByte >= 0x20) return 3
  if (firstByte >= 0x10) return 4
  if (firstByte >= 0x08) return 5
  if (firstByte >= 0x04) return 6
  if (firstByte >= 0x02) return 7
  return 8
}

function extractInit(buf: Buffer): Buffer | null {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(0, j)
    }
  }
  return null
}

function extractCluster(buf: Buffer): Buffer {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(j)
    }
  }
  return buf // fallback
}

// Modify init segment so Segment has unknown size (required for streaming via pipe)
function makeStreamingInit(buf: Buffer): Buffer | null {
  const init = extractInit(buf)
  if (!init) return null
  for (let i = 0; i <= init.length - 4; i++) {
    if (init[i] === SEGMENT_ID[0] && init[i+1] === SEGMENT_ID[1] &&
        init[i+2] === SEGMENT_ID[2] && init[i+3] === SEGMENT_ID[3]) {
      const sizeStart = i + 4
      if (sizeStart >= init.length) break
      const width = vintWidth(init[sizeStart])
      const unk = UNKNOWN_SIZE[width]
      if (!unk) break
      const before = init.subarray(0, sizeStart)
      const after = init.subarray(sizeStart + width)
      return Buffer.concat([before, unk, after])
    }
  }
  return init // fallback
}

const active = new Map<string, BroadcastHls>()

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getHlsManifestUrl(broadcastId: string): string | null {
  const hls = active.get(broadcastId)
  if (!hls) return null
  return `/live/${broadcastId}/stream.m3u8`
}

function doStart(blsId: string) {
  if (active.has(blsId)) return

  const dir = path.join(HLS_ROOT, blsId)
  ensureDir(dir)
  const manifest = path.join(dir, 'stream.m3u8')

  // Clean old files
  for (const f of fs.readdirSync(dir)) {
    fs.unlinkSync(path.join(dir, f))
  }

  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-fflags', '+genpts',           // Regenerate timestamps for chunked input
    '-thread_queue_size', '512',    // Larger stdin buffer
    '-f', 'webm',                   // Input is WebM
    '-i', 'pipe:0',                 // Read from stdin

    // Audio filtering: cut sub-bass rumble and high hiss, light noise reduction
    '-af', 'highpass=f=80,lowpass=f=15000,afftdn=nf=-25',

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',

    // HLS output
    '-f', 'hls',
    '-hls_time', '2',               // 2-second segments (matches MediaRecorder chunk interval)
    '-hls_init_time', '1',        // First segment after 1s for quick startup
    '-hls_list_size', '24',         // Keep 24 segments (~24s window)
    '-hls_flags', 'delete_segments+append_list+omit_endlist+temp_file',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(dir, 'seg%03d.ts'),
    manifest
  ])

  ffmpeg.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) console.error(`[FFmpeg ${blsId}]`, msg)
  })

  ffmpeg.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) console.log(`[FFmpeg ${blsId} stdout]`, msg)
  })

  ffmpeg.on('close', (code) => {
    console.log(`[FFmpeg ${blsId}] exited with code ${code}`)
    // Log directory state on exit for debugging
    try {
      const files = fs.readdirSync(dir)
      console.log(`[HLS] ${blsId} dir state on exit:`, files)
    } catch (e: any) {
      console.log(`[HLS] ${blsId} dir read error on exit:`, e.message)
    }
    const s = active.get(blsId)
    if (s && !s.ended) {
      console.warn(`[HLS] ${blsId} crashed, restarting…`)
      active.delete(blsId)
      doStart(blsId)
    } else {
      active.delete(blsId)
    }
  })

  ffmpeg.on('error', (err) => {
    console.error(`[FFmpeg ${blsId}] error:`, err.message)
    active.delete(blsId)
  })

  const state: BroadcastHls = { ffmpeg, dir, manifest, ended: false, initSent: false, chunksReceived: false, lastChunkAt: Date.now(), timeoutRef: null }
  active.set(blsId, state)

  // Auto-stop if broadcaster goes silent for 60s (disconnect / crash)
  state.timeoutRef = setInterval(() => {
    const s = active.get(blsId)
    if (!s || s.ended) { clearInterval(state.timeoutRef!); return }
    if (Date.now() - s.lastChunkAt > 60000) {
      console.warn(`[HLS] ${blsId} idle timeout — no chunks for 60s, stopping FFmpeg`)
      clearInterval(state.timeoutRef!)
      forceStop(blsId)
    }
  }, 5000)

  console.log(`[HLS] Started ${blsId} → ${dir}`)
}

function forceStop(blsId: string) {
  const hls = active.get(blsId)
  if (!hls) return
  hls.ended = true
  if (hls.timeoutRef) { clearInterval(hls.timeoutRef); hls.timeoutRef = null }
  try {
    hls.ffmpeg.stdin?.end()
    if (!hls.ffmpeg.killed) hls.ffmpeg.kill('SIGKILL')
  } catch {}
  active.delete(blsId)
  // Clean old files so listeners get fresh manifest
  try {
    for (const f of fs.readdirSync(hls.dir)) fs.unlinkSync(path.join(hls.dir, f))
  } catch {}
}

export function startHlsBroadcast(broadcastId: string) {
  console.log(`[HLS] startHlsBroadcast called for ${broadcastId}`)
  const existing = active.get(broadcastId)
  if (existing) {
    if (existing.chunksReceived) {
      // Broadcaster refreshed/reconnected — restart for fresh MediaRecorder timeline
      console.warn(`[HLS] Restarting ${broadcastId} for broadcaster reconnect`)
      forceStop(broadcastId)
    } else {
      // First start, still waiting for first chunk — don't duplicate
      console.warn(`[HLS] Already active for ${broadcastId}, waiting for first chunk`)
      return
    }
  }
  doStart(broadcastId)
}

export function feedHlsChunk(broadcastId: string, base64Chunk: string) {
  const hls = active.get(broadcastId)
  if (!hls || hls.ended) {
    console.log(`[HLS] feedHlsChunk skipped for ${broadcastId}: active=${!!hls} ended=${hls?.ended}`)
    return
  }
  try {
    hls.chunksReceived = true
    hls.lastChunkAt = Date.now()
    const buf = Buffer.from(base64Chunk, 'base64')
    // FFmpeg expects a continuous WebM stream. Self-contained chunks
    // from MediaRecorder each have their own EBML+Segment+Tracks init.
    // Feed the full first chunk with Segment size set to unknown so FFmpeg
    // keeps reading clusters indefinitely. Subsequent chunks are stripped.
    let data: Buffer
    if (!hls.initSent) {
      const init = makeStreamingInit(buf)
      if (init) {
        const cluster = extractCluster(buf)
        data = Buffer.concat([init, cluster])
      } else {
        data = buf // fallback
      }
      hls.initSent = true
      console.log(`[HLS] ${broadcastId} first chunk fed (init+cluster, ${data.length} bytes)`)
    } else {
      data = extractCluster(buf)
    }
    if (hls.ffmpeg.stdin?.writable) {
      hls.ffmpeg.stdin.write(data)
      console.log(`[HLS] ${broadcastId} fed chunk: ${data.length} bytes (initSent=${hls.initSent})`)
      // Periodically log directory contents so we can see if files are being created
      if (Math.random() < 0.05) { // ~5% of chunks
        try {
          const files = fs.readdirSync(hls.dir)
          console.log(`[HLS] ${broadcastId} dir contents:`, files)
        } catch (e: any) {
          console.log(`[HLS] ${broadcastId} dir read error:`, e.message)
        }
      }
    } else {
      console.warn(`[HLS] ${broadcastId} stdin not writable, dropping ${data.length} bytes`)
    }
  } catch (err: any) {
    console.error(`[HLS] feed error ${broadcastId}:`, err.message)
  }
}

export function stopHlsBroadcast(broadcastId: string) {
  const hls = active.get(broadcastId)
  if (!hls) return
  hls.ended = true
  try {
    hls.ffmpeg.stdin?.end()
    setTimeout(() => {
      if (!hls.ffmpeg.killed) {
        hls.ffmpeg.kill('SIGKILL')
      }
      active.delete(broadcastId)
    }, 2000)
  } catch {
    hls.ffmpeg.kill('SIGKILL')
    active.delete(broadcastId)
  }
  console.log(`[HLS] Stopped ${broadcastId}`)
}

export function getHlsDir(broadcastId: string): string | null {
  return active.get(broadcastId)?.dir || null
}

export function isHlsActive(broadcastId: string): boolean {
  return active.has(broadcastId)
}
