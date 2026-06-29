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
}

const CLUSTER_ID = Buffer.from([0x1F, 0x43, 0xB6, 0x75])

function extractCluster(buf: Buffer): Buffer {
  for (let j = 0; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(j)
    }
  }
  return buf // fallback
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

export function startHlsBroadcast(broadcastId: string) {
  if (active.has(broadcastId)) {
    console.warn(`[HLS] Already active for ${broadcastId}`)
    return
  }

  const dir = path.join(HLS_ROOT, broadcastId)
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

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',

    // HLS output
    '-f', 'hls',
    '-hls_time', '4',               // 4-second segments
    '-hls_list_size', '6',          // Keep 6 segments (~24s window)
    '-hls_flags', 'delete_segments+append_list+omit_endlist',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(dir, 'seg%03d.ts'),
    manifest
  ])

  ffmpeg.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) console.error(`[FFmpeg ${broadcastId}]`, msg)
  })

  ffmpeg.on('close', (code) => {
    console.log(`[FFmpeg ${broadcastId}] exited with code ${code}`)
    active.delete(broadcastId)
  })

  ffmpeg.on('error', (err) => {
    console.error(`[FFmpeg ${broadcastId}] error:`, err.message)
    active.delete(broadcastId)
  })

  active.set(broadcastId, { ffmpeg, dir, manifest, ended: false, initSent: false })
  console.log(`[HLS] Started ${broadcastId} → ${dir}`)
}

export function feedHlsChunk(broadcastId: string, base64Chunk: string) {
  const hls = active.get(broadcastId)
  if (!hls || hls.ended) return
  try {
    const buf = Buffer.from(base64Chunk, 'base64')
    // FFmpeg expects a continuous WebM stream. Self-contained chunks
    // from MediaRecorder each have their own EBML+Segment+Tracks init.
    // Feed the full first chunk (contains init), then only cluster data.
    const data = hls.initSent ? extractCluster(buf) : buf
    hls.initSent = true
    if (hls.ffmpeg.stdin?.writable) {
      hls.ffmpeg.stdin.write(data)
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
