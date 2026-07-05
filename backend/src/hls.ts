import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { db, dbWriteSafe } from './db.js'

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
  pendingInit?: Buffer // persisted init loaded from DB for recovery after restart
  lastProcessedIndex?: number // dedupe duplicate chunk deliveries (WS + HTTP)
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

const EBML_ID = Buffer.from([0x1A, 0x45, 0xDF, 0xA3])

function hasEbmlHeader(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === EBML_ID[0] && buf[1] === EBML_ID[1] && buf[2] === EBML_ID[2] && buf[3] === EBML_ID[3]
}

function extractInit(buf: Buffer): Buffer | null {
  if (buf.length < 4) {
    console.warn(`[HLS] extractInit: buffer too small (${buf.length} bytes)`)
    return null
  }
  // Only chunks that start with a valid EBML header can contain an init segment.
  // MediaRecorder continuation chunks lack the EBML header.
  if (!hasEbmlHeader(buf)) {
    console.warn(`[HLS] extractInit: no EBML header in ${buf.length} bytes, first4=${buf.subarray(0, 4).toString('hex')}`)
    return null
  }
  for (let j = 4; j <= buf.length - 4; j++) {
    if (buf[j] === CLUSTER_ID[0] && buf[j+1] === CLUSTER_ID[1] &&
        buf[j+2] === CLUSTER_ID[2] && buf[j+3] === CLUSTER_ID[3]) {
      return buf.subarray(0, j)
    }
  }
  console.warn(`[HLS] extractInit: no cluster ID found in ${buf.length} bytes, header: ${buf.subarray(0, 16).toString('hex')}`)
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
  // Debug: log first 32 bytes of init before modification
  console.log(`[HLS] makeStreamingInit: init length=${init.length}, first32=${init.subarray(0, 32).toString('hex')}`)
  for (let i = 0; i <= init.length - 4; i++) {
    if (init[i] === SEGMENT_ID[0] && init[i+1] === SEGMENT_ID[1] &&
        init[i+2] === SEGMENT_ID[2] && init[i+3] === SEGMENT_ID[3]) {
      const sizeStart = i + 4
      if (sizeStart >= init.length) {
        console.warn(`[HLS] makeStreamingInit: Segment found at ${i} but no size bytes after`)
        break
      }
      const width = vintWidth(init[sizeStart])
      const unk = UNKNOWN_SIZE[width]
      if (!unk) {
        console.warn(`[HLS] makeStreamingInit: unknown-size not available for width ${width} (byte=0x${init[sizeStart].toString(16)})`)
        break
      }
      const before = init.subarray(0, sizeStart)
      const after = init.subarray(sizeStart + width)
      const result = Buffer.concat([before, unk, after])
      console.log(`[HLS] makeStreamingInit: Segment at ${i}, size byte 0x${init[sizeStart].toString(16)} (width=${width}), result length=${result.length}`)
      return result
    }
  }
  console.warn(`[HLS] makeStreamingInit: no Segment ID found in init of ${init.length} bytes`)
  return init // fallback — feed raw init and let FFmpeg handle it
}

// Same transform as makeStreamingInit, but operates on an already-extracted init buffer
function makeStreamingInitFromBuffer(init: Buffer): Buffer | null {
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

// Modify the Segment size inside a full chunk, preserving the rest of the chunk.
// This is used when the first chunk (with EBML header) is fed to FFmpeg as-is.
function makeStreamingChunk(buf: Buffer): Buffer | null {
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === SEGMENT_ID[0] && buf[i+1] === SEGMENT_ID[1] &&
        buf[i+2] === SEGMENT_ID[2] && buf[i+3] === SEGMENT_ID[3]) {
      const sizeStart = i + 4
      if (sizeStart >= buf.length) break
      const width = vintWidth(buf[sizeStart])
      const unk = UNKNOWN_SIZE[width]
      if (!unk) break
      const result = Buffer.from(buf)
      unk.copy(result, sizeStart)
      return result
    }
  }
  return null
}

const active = new Map<string, BroadcastHls>()
const lastCrash = new Map<string, number>()
const crashCount = new Map<string, number>()
const CRASH_BACKOFF_MS = 10000 // wait 10s before restarting after a crash
const MAX_CONSECUTIVE_CRASHES = 5
const inBackoff = new Map<string, boolean>()

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

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-bufsize', '256k',

    // HLS output
    '-f', 'hls',
    '-hls_time', '2',               // 2-second segments (matches MediaRecorder chunk interval)
    '-hls_init_time', '1',        // First segment after 1s for quick startup
    '-hls_list_size', '6',          // Keep 6 segments (~12s latency)
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
    active.delete(blsId)
    if (s && !s.ended) {
      const now = Date.now()
      const last = lastCrash.get(blsId) || 0
      const count = (crashCount.get(blsId) || 0) + 1
      crashCount.set(blsId, count)
      if (count >= MAX_CONSECUTIVE_CRASHES) {
        console.error(`[HLS] ${blsId} crashed ${count} times consecutively — giving up. Check broadcaster WebM format.`)
        lastCrash.set(blsId, now)
        inBackoff.set(blsId, false)
        return
      }
      if (now - last < CRASH_BACKOFF_MS) {
        console.warn(`[HLS] ${blsId} crashed too fast (${now - last}ms < ${CRASH_BACKOFF_MS}ms), backing off… (crash #${count})`)
        lastCrash.set(blsId, now)
        inBackoff.set(blsId, true)
        setTimeout(() => {
          inBackoff.set(blsId, false)
          if (!active.has(blsId)) doStart(blsId)
        }, CRASH_BACKOFF_MS)
        return
      }
      console.warn(`[HLS] ${blsId} crashed, restarting… (crash #${count})`)
      lastCrash.set(blsId, now)
      doStart(blsId)
    }
  })

  ffmpeg.on('error', (err) => {
    console.error(`[FFmpeg ${blsId}] error:`, err.message)
    active.delete(blsId)
  })

  const state: BroadcastHls = { ffmpeg, dir, manifest, ended: false, initSent: false, chunksReceived: false, lastChunkAt: Date.now(), timeoutRef: null }
  active.set(blsId, state)

  // Auto-stop if broadcaster goes silent for 120s (disconnect / crash)
  state.timeoutRef = setInterval(() => {
    const s = active.get(blsId)
    if (!s || s.ended) { clearInterval(state.timeoutRef!); return }
    if (Date.now() - s.lastChunkAt > 120000) {
      console.warn(`[HLS] ${blsId} idle timeout — no chunks for 120s, stopping FFmpeg`)
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

export async function restartHlsBroadcast(broadcastId: string) {
  console.warn(`[HLS] restartHlsBroadcast for ${broadcastId}`)
  forceStop(broadcastId)
  await startHlsBroadcast(broadcastId, true)
}

export async function startHlsBroadcast(broadcastId: string, force = false) {
  console.log(`[HLS] startHlsBroadcast called for ${broadcastId} force=${force}`)
  if (inBackoff.get(broadcastId)) {
    if (force) {
      console.warn(`[HLS] ${broadcastId} clearing backoff and restarting (chunk received)`)
      inBackoff.set(broadcastId, false)
      crashCount.set(broadcastId, 0)
    } else {
      console.warn(`[HLS] ${broadcastId} is in backoff, skipping start`)
      return
    }
  }
  const existing = active.get(broadcastId)
  if (existing) {
    // Already running — don't restart just because a chunk arrived.
    // Restarting here on every chunk wiped the manifest and prevented HLS output.
    console.warn(`[HLS] Already active for ${broadcastId}, ignoring start request`)
    return
  }
  // Don't reset crashCount on fresh start here — let backoff logic handle it.
  doStart(broadcastId)

  // Try to preload a persisted init segment so recovery works after server restart
  try {
    const row = await db.get<{ init_segment: string }>(`SELECT init_segment FROM broadcasts WHERE id=$1`, [broadcastId])
    if (row?.init_segment) {
      const hls = active.get(broadcastId)
      if (hls) {
        hls.pendingInit = Buffer.from(row.init_segment, 'base64')
        console.log(`[HLS] ${broadcastId} preloaded persisted init (${hls.pendingInit.length} bytes)`)
      }
    }
  } catch (err: any) {
    console.warn(`[HLS] ${broadcastId} failed to preload init from DB:`, err.message)
  }
}

export async function feedHlsChunk(broadcastId: string, chunkIndex: number, base64Chunk: string) {
  let hls = active.get(broadcastId)
  if (!hls) {
    // Safety net: broadcaster is sending chunks but HLS isn't running — restart
    console.warn(`[HLS] feedHlsChunk: no active HLS for ${broadcastId}, auto-starting`)
    await startHlsBroadcast(broadcastId, true)
    hls = active.get(broadcastId)
  }
  if (!hls || hls.ended || hls.ffmpeg.killed) {
    console.log(`[HLS] feedHlsChunk skipped for ${broadcastId}: active=${!!hls} ended=${hls?.ended} killed=${hls?.ffmpeg.killed}`)
    return
  }
  try {
    hls.chunksReceived = true
    hls.lastChunkAt = Date.now()
    // Deduplicate chunks delivered via both WebSocket and HTTP fallback
    if (hls.lastProcessedIndex !== undefined && chunkIndex <= hls.lastProcessedIndex) {
      console.log(`[HLS] ${broadcastId} chunk ${chunkIndex} already processed (last=${hls.lastProcessedIndex}), skipping`)
      return
    }
    hls.lastProcessedIndex = chunkIndex
    const buf = Buffer.from(base64Chunk, 'base64')
    console.log(`[HLS] ${broadcastId} chunk ${chunkIndex}: decoded ${buf.length} bytes, first16=${buf.subarray(0, 16).toString('hex')}`)
    // If a fresh EBML header appears mid-stream, the broadcaster restarted
    // MediaRecorder (new timeline). Restart FFmpeg to honor it.
    if (hls.initSent && hasEbmlHeader(buf)) {
      console.warn(`[HLS] ${broadcastId} chunk ${chunkIndex} has fresh EBML header while active — broadcaster reconnect, restarting`)
      await restartHlsBroadcast(broadcastId)
      hls = active.get(broadcastId)
      if (!hls || hls.ended || hls.ffmpeg.killed) return
    }
    // FFmpeg expects a continuous WebM byte stream. MediaRecorder timeslice
    // chunks are contiguous, not necessarily cluster-aligned, so we feed the
    // first chunk (with EBML) as a whole after patching Segment size, then
    // every subsequent chunk as-is.
    let data: Buffer
    let isInitChunk = false
    if (!hls.initSent) {
      if (hasEbmlHeader(buf)) {
        const streamingChunk = makeStreamingChunk(buf)
        if (streamingChunk) {
          data = streamingChunk
          isInitChunk = true
          console.log(`[HLS] ${broadcastId} first chunk ${chunkIndex}: streaming chunk (${data.length} bytes), first16=${data.subarray(0, 16).toString('hex')}`)
          // Persist init for recovery after server restart
          const rawInit = extractInit(buf)
          if (rawInit) dbWriteSafe(`UPDATE broadcasts SET init_segment=$1 WHERE id=$2`, [rawInit.toString('base64'), broadcastId])
        } else {
          console.warn(`[HLS] ${broadcastId} first chunk ${chunkIndex} has EBML but no Segment ID — feeding raw`)
          data = buf
        }
      } else if (hls.pendingInit) {
        // Server restarted mid-broadcast: use persisted init + raw continuation
        const streamingInit = makeStreamingInitFromBuffer(hls.pendingInit)
        data = Buffer.concat([streamingInit || hls.pendingInit, buf])
        isInitChunk = true
        console.log(`[HLS] ${broadcastId} recovery chunk ${chunkIndex}: persisted init (${hls.pendingInit.length} bytes) + raw ${buf.length} bytes`)
      } else {
        console.warn(`[HLS] ${broadcastId} chunk ${chunkIndex} has no valid EBML header and no persisted init — skipping (broadcaster may need to refresh)`)
        return
      }
    } else {
      data = buf
    }
    if (hls.ffmpeg.stdin?.writable && !hls.ffmpeg.killed) {
      try {
        hls.ffmpeg.stdin.write(data)
        if (isInitChunk) hls.initSent = true
        console.log(`[HLS] ${broadcastId} fed chunk ${chunkIndex}: ${data.length} bytes (initSent=${hls.initSent})`)
      } catch (writeErr: any) {
        console.warn(`[HLS] ${broadcastId} stdin write failed:`, writeErr.message)
      }
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
