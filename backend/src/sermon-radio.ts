import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import { db, initDb } from './db.js'
import { enqueueNotification } from './services/notificationService.js'

const STREAM_KEY = 'radio'

interface ActiveSermonStream {
  streamKey: string
  process: ChildProcess
  currentContentId: string
  currentAudioUrl: string
  offsetSeconds: number
  playlistId: string
  playlistItems: Array<{ id: string; content_type: string; content_id: string; audio_url: string; title: string; speaker: string; duration_minutes: number }>
  itemIndex: number
  startedAt: number
}

let active: ActiveSermonStream | null = null
let schedulerTimer: ReturnType<typeof setInterval> | null = null
let broadcastPaused = false
let preBroadcastState: { playlistId: string; itemIndex: number; offsetSeconds: number } | null = null

async function getPlaylistItems(playlistId: string) {
  await initDb()
  const rows = await db.all(
    `SELECT pi.id, pi.content_type, pi.content_id, pi.order_index, pi.duration_minutes,
            COALESCE(s.title, m.title) as title,
            COALESCE(s.speaker, m.artist) as speaker,
            COALESCE(s.audio_url, m.audio_url) as audio_url
     FROM playlist_items pi
     LEFT JOIN sermons s ON s.id = pi.content_id AND pi.content_type = 'sermon'
     LEFT JOIN music m ON m.id = pi.content_id AND pi.content_type = 'music'
     WHERE pi.playlist_id = $1
     ORDER BY pi.order_index ASC`,
    [playlistId]
  )
  return rows.map((r: any) => ({
    id: r.id,
    content_type: r.content_type,
    content_id: r.content_id,
    audio_url: r.audio_url,
    title: r.title,
    speaker: r.speaker,
    duration_minutes: r.duration_minutes || 30,
  }))
}

async function updateRadioState(scheduleId: string | null, itemId: string | null, offset: number, manualStop: boolean | null = null) {
  await initDb()
  if (manualStop !== null) {
    await db.run(
      `INSERT INTO radio_state (id, schedule_id, current_item_id, offset_seconds, manual_stop, updated_at)
       VALUES ('singleton', $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         schedule_id = $1, current_item_id = $2, offset_seconds = $3, manual_stop = $4, updated_at = NOW()`,
      [scheduleId, itemId, offset, manualStop]
    )
  } else {
    await db.run(
      `INSERT INTO radio_state (id, schedule_id, current_item_id, offset_seconds, updated_at)
       VALUES ('singleton', $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         schedule_id = $1, current_item_id = $2, offset_seconds = $3, updated_at = NOW()`,
      [scheduleId, itemId, offset]
    )
  }
}

async function startFfmpeg(audioUrl: string, streamKey: string, offsetSeconds: number = 0): Promise<ChildProcess> {
  const HLS_ROOT = process.env.HLS_DIR || '/tmp/hls'
  const dir = `${HLS_ROOT}/${streamKey}`
  const manifest = `${dir}/stream.m3u8`
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-re',
    ...(offsetSeconds > 0 ? ['-ss', String(offsetSeconds)] : []),
    '-i', audioUrl,
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-b:a', '128k',
    '-bufsize', '256k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_init_time', '1',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+append_list+omit_endlist+temp_file',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', `${dir}/seg%03d.ts`,
    manifest,
  ]

  console.log(`[RADIO] spawning ffmpeg for ${audioUrl} offset=${offsetSeconds}s`)
  const proc = spawn('ffmpeg', args)

  let stderrBuf = ''
  proc.stderr?.on('data', (chunk) => {
    stderrBuf += chunk.toString()
    const lines = stderrBuf.split('\n')
    stderrBuf = lines.pop() || ''
    for (const line of lines) {
      if (line.trim()) console.log('[RADIO] ffmpeg:', line.trim())
    }
  })

  proc.on('error', (err) => {
    console.error('[RADIO] ffmpeg error:', err.message)
  })

  proc.on('exit', (code, signal) => {
    console.log(`[RADIO] ffmpeg exited code=${code} signal=${signal}`)
  })

  return proc
}

async function playNextSermon() {
  if (!active) return
  const nextIndex = active.itemIndex + 1
  if (nextIndex >= active.playlistItems.length) {
    active.itemIndex = 0
  } else {
    active.itemIndex = nextIndex
  }
  const item = active.playlistItems[active.itemIndex]
  await startSermonItem(item, 0)
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function startSermonItem(item: ActiveSermonStream['playlistItems'][0], offsetSeconds: number) {
  if (!active) return

  if (active.process) {
    active.process.kill('SIGTERM')
    active.process = null as any
  }

  active.currentContentId = item.content_id
  active.currentAudioUrl = item.audio_url
  active.offsetSeconds = offsetSeconds
  active.startedAt = Date.now()

  await updateRadioState(null, item.id, offsetSeconds)

  if (!item.audio_url) {
    console.error(`[RADIO] No audio_url for item ${item.content_id}, skipping`)
    setTimeout(() => playNextSermon(), 1000)
    return
  }

  const proc = await startFfmpeg(item.audio_url, active.streamKey, offsetSeconds)
  active.process = proc

  proc.on('exit', async (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      return
    }
    if (!active) return
    if (active.currentContentId === item.content_id) {
      console.log('[RADIO] item finished naturally, advancing')
      await playNextSermon()
    }
  })
}

async function findActiveSchedule() {
  await initDb()
  const now = new Date().toISOString()
  const row = await db.get(
    `SELECT rs.*, p.title as playlist_title, p.repeat_mode, p.shuffle
     FROM radio_schedules rs
     JOIN playlists p ON p.id = rs.playlist_id
     WHERE rs.is_active = true
       AND rs.start_time IS NOT NULL
       AND rs.start_time <= $1 AND (rs.end_time IS NULL OR rs.end_time >= $1)
     ORDER BY rs.start_time ASC
     LIMIT 1`,
    [now]
  )
  return row || null
}

export async function startRadio(playlistId: string, shuffle = false, repeatMode = 'none') {
  if (broadcastPaused) {
    console.log('[RADIO] Not starting — paused for live broadcast')
    return
  }
  if (active) {
    console.log('[RADIO] Already streaming, stopping first')
    await stopRadio()
  }

  let items = await getPlaylistItems(playlistId)
  if (items.length === 0) {
    console.log('[RADIO] Playlist has no items, not starting')
    return
  }

  if (shuffle) {
    items = shuffleArray(items)
  }

  active = {
    streamKey: STREAM_KEY,
    process: null as any,
    currentContentId: '',
    currentAudioUrl: '',
    offsetSeconds: 0,
    playlistId,
    playlistItems: items,
    itemIndex: 0,
    startedAt: Date.now(),
  }

  await startSermonItem(items[0], 0)
  enqueueNotification({
    category: 'sermon_radio',
    type: 'sermon_radio_start',
    title: 'Sermon Radio is now playing',
    body: `Tune in to ${items[0].title || 'Sermon Radio'} on ZioniteFM.`,
    url: '/radio'
  }).catch((e: any) => console.error('[RADIO] enqueue notification failed:', e.message))
  console.log(`[RADIO] Started streaming playlist ${playlistId} with ${items.length} items (shuffle=${shuffle}, repeat=${repeatMode})`)
}

export async function stopRadio(): Promise<void> {
  if (!active) return

  if (active.process) {
    active.process.kill('SIGTERM')
    active.process = null as any
  }

  active = null
  await updateRadioState(null, null, 0)
  console.log('[RADIO] Stopped streaming')
}

export async function pauseRadio() {
  if (!active) {
    console.log('[RADIO] No active radio to pause')
    return
  }
  const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
  const offset = active.offsetSeconds + elapsed
  await updateRadioState(active.playlistId, active.currentContentId, offset)
  await db.run(
    `INSERT INTO radio_state (id, paused, manual_stop, updated_at)
     VALUES ('singleton', TRUE, FALSE, NOW())
     ON CONFLICT (id) DO UPDATE SET paused = TRUE, manual_stop = FALSE, updated_at = NOW()`
  )
  await stopRadio()
  console.log('[RADIO] Paused and saved state')
}

export function isRadioPausedForBroadcast(): boolean {
  return broadcastPaused
}

export async function pauseRadioForBroadcast() {
  if (broadcastPaused) return
  if (active) {
    const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
    preBroadcastState = {
      playlistId: active.playlistId,
      itemIndex: active.itemIndex,
      offsetSeconds: active.offsetSeconds + elapsed,
    }
    console.log('[RADIO] Pausing for broadcast, saved state:', preBroadcastState)
    await stopRadio()
  } else {
    console.log('[RADIO] No active radio to pause for broadcast')
  }
  broadcastPaused = true
}

export async function resumeRadioAfterBroadcast() {
  if (!broadcastPaused) return
  broadcastPaused = false
  if (preBroadcastState) {
    const { playlistId, itemIndex, offsetSeconds } = preBroadcastState
    const items = await getPlaylistItems(playlistId)
    if (items.length > 0 && itemIndex < items.length) {
      active = {
        streamKey: STREAM_KEY,
        process: null as any,
        currentContentId: '',
        currentAudioUrl: '',
        offsetSeconds: 0,
        playlistId,
        playlistItems: items,
        itemIndex,
        startedAt: Date.now() - (offsetSeconds * 1000),
      }
      const item = items[itemIndex]
      await startSermonItem(item, offsetSeconds)
      enqueueNotification({
        category: 'sermon_radio',
        type: 'sermon_radio_resume',
        title: 'Sermon Radio is back on',
        body: `Live broadcast ended. Tune back in to ${item.title || 'Sermon Radio'} on ZioniteFM.`,
        url: '/radio'
      }).catch((e: any) => console.error('[RADIO] enqueue notification failed:', e.message))
      console.log(`[RADIO] Resumed after broadcast at item ${itemIndex}, offset ${offsetSeconds}s`)
    } else {
      console.log('[RADIO] Saved playlist item no longer valid, not resuming')
    }
    preBroadcastState = null
  } else {
    console.log('[RADIO] No saved state, letting scheduler restart on next tick')
  }
}

export async function skipSermon(): Promise<void> {
  if (!active) throw new Error('Radio is not streaming')
  await playNextSermon()
}

export function getRadioStatus() {
  if (!active) return null
  const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
  const item = active.playlistItems[active.itemIndex]
  return {
    streamKey: active.streamKey,
    playlistId: active.playlistId,
    currentSermonId: active.currentContentId,
    currentSermonTitle: item?.title || '',
    currentSermonSpeaker: item?.speaker || '',
    offsetSeconds: active.offsetSeconds + elapsed,
    itemIndex: active.itemIndex,
    totalItems: active.playlistItems.length,
  }
}

async function tick() {
  // If a live broadcast is ongoing, pause radio and skip schedule start
  const liveBroadcast = await db.get("SELECT 1 FROM broadcasts WHERE status = 'live' LIMIT 1")
  if (liveBroadcast) {
    if (active && !broadcastPaused) {
      console.log('[RADIO-SCHEDULER] Live broadcast detected, pausing radio')
      await pauseRadioForBroadcast()
    }
    return
  }

  // No live broadcast — resume if we were paused for one (unless manually stopped)
  if (broadcastPaused) {
    const state = await db.get('SELECT manual_stop FROM radio_state WHERE id = \'singleton\'')
    if (state?.manual_stop) {
      console.log('[RADIO-SCHEDULER] Broadcast ended but radio was manually stopped, not resuming')
      broadcastPaused = false
      return
    }
    console.log('[RADIO-SCHEDULER] Broadcast ended, resuming radio')
    await resumeRadioAfterBroadcast()
  }

  const schedule = await findActiveSchedule()
  if (schedule) {
    const state = await db.get('SELECT manual_stop, paused FROM radio_state WHERE id = \'singleton\'')
    if (state?.manual_stop) {
      console.log('[RADIO-SCHEDULER] Active schedule found but radio manually stopped, skipping start')
      return
    }
    if (state?.paused) {
      console.log('[RADIO-SCHEDULER] Active schedule found but radio is paused, skipping start')
      return
    }
    if (!active || active.playlistId !== schedule.playlist_id) {
      console.log(`[RADIO-SCHEDULER] Active schedule found: ${schedule.id} (playlist ${schedule.playlist_id}), starting radio`)
      await startRadio(schedule.playlist_id, schedule.shuffle, schedule.repeat_mode)
    }
  } else {
    if (active) {
      console.log('[RADIO-SCHEDULER] No active schedule in current window, stopping radio')
      await stopRadio()
    }
  }
}

export function initRadioScheduler(intervalMs = 60000) {
  console.log('[RADIO-SCHEDULER] Initializing radio scheduler')
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
  }
  tick().catch(err => console.error('[RADIO-SCHEDULER] initial tick error:', err))
  schedulerTimer = setInterval(() => {
    tick().catch(err => console.error('[RADIO-SCHEDULER] tick error:', err))
  }, intervalMs)
}

export function stopRadioScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}
