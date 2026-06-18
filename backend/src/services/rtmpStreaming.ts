import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db'

const uploadsDir = './uploads/sermons'
const tempDir = './data/temp'

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

interface RTMPStream {
  broadcastId: string
  ffmpeg: ChildProcess
  rtmpUrl: string
  streamKey: string
  startTime: Date
  audioFile: string | null
}

const activeStreams = new Map<string, RTMPStream>()

// Church Online Platform RTMP endpoints
const COP_ENDPOINTS = {
  primary: 'rtmp://live.churchonlineplatform.com/live',
  backup: 'rtmp://backup.churchonlineplatform.com/live',
}

export function startRTMPStream(
  broadcastId: string,
  rtmpUrl: string,
  streamKey: string,
  onData?: (data: Buffer) => void
): Promise<RTMPStream> {
  return new Promise((resolve, reject) => {
    const fullRtmpUrl = `${rtmpUrl}/${streamKey}`
    
    // FFmpeg command to stream to RTMP
    // Takes audio input from stdin (PCM or WebM)
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'webm',           // Input format
      '-i', 'pipe:0',         // Read from stdin
      '-c:a', 'aac',          // Audio codec
      '-b:a', '128k',         // Audio bitrate
      '-ar', '44100',         // Sample rate
      '-f', 'flv',            // Output format for RTMP
      fullRtmpUrl,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stream: RTMPStream = {
      broadcastId,
      ffmpeg,
      rtmpUrl,
      streamKey,
      startTime: new Date(),
      audioFile: null,
    }

    ffmpeg.stderr?.on('data', (data) => {
      console.log(`FFmpeg [${broadcastId}]:`, data.toString())
    })

    ffmpeg.on('error', (err) => {
      console.error(`FFmpeg error [${broadcastId}]:`, err)
      activeStreams.delete(broadcastId)
      reject(err)
    })

    ffmpeg.on('exit', (code) => {
      console.log(`FFmpeg exited [${broadcastId}] with code ${code}`)
      activeStreams.delete(broadcastId)
    })

    // Pipe incoming audio data to FFmpeg
    ffmpeg.stdin?.on('data', (chunk) => {
      onData?.(chunk)
    })

    activeStreams.set(broadcastId, stream)
    resolve(stream)
  })
}

export async function sendAudioChunk(broadcastId: string, chunk: Buffer): Promise<boolean> {
  const stream = activeStreams.get(broadcastId)
  if (!stream || !stream.ffmpeg.stdin) return false

  try {
    stream.ffmpeg.stdin.write(chunk)
    return true
  } catch (err) {
    console.error('Error writing to FFmpeg:', err)
    return false
  }
}

export async function stopRTMPStream(broadcastId: string): Promise<string | null> {
  const stream = activeStreams.get(broadcastId)
  if (!stream) return null

  // Gracefully stop FFmpeg
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Force kill if not exited in 5 seconds
      stream.ffmpeg.kill('SIGKILL')
    }, 5000)

    stream.ffmpeg.on('exit', async () => {
      clearTimeout(timeout)
      activeStreams.delete(broadcastId)

      // Finalize broadcast in DB
      const db = await getDb()
      await db.run(
        'UPDATE broadcasts SET status = $1, ended_at = $2 WHERE id = $3',
        ['ended', new Date().toISOString(), broadcastId]
      )

      // Archive recording if we have one
      const audioPath = path.join(uploadsDir, `${broadcastId}.m4a`)
      if (fs.existsSync(audioPath)) {
        await db.run(
          'UPDATE broadcasts SET audio_path = $1 WHERE id = $2',
          [audioPath, broadcastId]
        )
      }

      resolve(audioPath)
    })

    // Send EOF to FFmpeg stdin
    if (stream.ffmpeg.stdin) {
      stream.ffmpeg.stdin.end()
    }
    stream.ffmpeg.kill('SIGTERM')
  })
}

export function getStream(broadcastId: string): RTMPStream | undefined {
  return activeStreams.get(broadcastId)
}

export function getActiveStreams(): RTMPStream[] {
  return Array.from(activeStreams.values())
}

// Get Church Online Platform embed URL
export function getCOPEmbedUrl(churchId: string): string {
  return `https://live.churchonlineplatform.com/${churchId}`
}

// Generate COP-compatible stream key
export function generateStreamKey(): string {
  return `church-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}
