import { useState, useCallback, useRef } from 'react'

interface RTMPOptions {
  onConnect?: () => void
  onError?: (error: string) => void
  onEnded?: () => void
}

interface BroadcastData {
  id: string
  title: string
  status: string
  stream_key?: string
}

interface StartResponse {
  broadcast: BroadcastData
  rtmp: {
    url: string
    streamKey: string
    fullUrl: string
  }
  churchOnline: {
    embedUrl: string
    settings: {
      chat: boolean
      bible: boolean
      notes: boolean
      prayer: boolean
    }
  } | null
}

export function useRTMP() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broadcast, setBroadcast] = useState<BroadcastData | null>(null)
  const [rtmpUrl, setRtmpUrl] = useState<string | null>(null)
  const [copEmbedUrl, setCopEmbedUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const broadcastIdRef = useRef<string | null>(null)

  const startBroadcast = useCallback(async (
    title: string,
    description?: string,
    scripture?: string,
    churchOnlineId?: string,
    options?: RTMPOptions
  ) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/rtmp/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          scripture_reference: scripture,
          churchOnlineId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start broadcast')
      }

      const data: StartResponse = await res.json()
      broadcastIdRef.current = data.broadcast.id
      setBroadcast(data.broadcast)
      setRtmpUrl(data.rtmp.fullUrl)
      setCopEmbedUrl(data.churchOnline?.embedUrl || null)
      setIsStreaming(true)
      setError(null)
      options?.onConnect?.()
      return data
    } catch (e: any) {
      setError(e.message)
      options?.onError?.(e.message)
      throw e
    }
  }, [])

  const startBrowserStreaming = useCallback(async (
    stream: MediaStream,
    broadcastId: string
  ) => {
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    })

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const buffer = await event.data.arrayBuffer()
        
        try {
          const token = localStorage.getItem('token')
          await fetch(`/api/rtmp/chunk/${broadcastId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/octet-stream',
            },
            body: buffer,
          })
        } catch (err) {
          console.error('Failed to send chunk:', err)
        }
      }
    }

    mediaRecorder.start(1000) // Send chunks every second
    mediaRecorderRef.current = mediaRecorder
  }, [])

  const endBroadcast = useCallback(async (options?: RTMPOptions) => {
    if (!broadcastIdRef.current) return

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/rtmp/end/${broadcastIdRef.current}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to end broadcast')
      }

      const data = await res.json()
      broadcastIdRef.current = null
      setIsStreaming(false)
      setBroadcast(null)
      setRtmpUrl(null)
      setCopEmbedUrl(null)
      options?.onEnded?.()
      return data
    } catch (e: any) {
      setError(e.message)
      options?.onError?.(e.message)
      throw e
    }
  }, [])

  return {
    startBroadcast,
    startBrowserStreaming,
    endBroadcast,
    isStreaming,
    error,
    broadcast,
    rtmpUrl,
    copEmbedUrl,
    broadcastId: broadcastIdRef.current,
  }
}

// Hook for listeners to view Church Online Platform embed
export function useChurchOnline(churchId: string | null) {
  const getEmbedUrl = useCallback(() => {
    if (!churchId) return null
    return `https://live.churchonlineplatform.com/${churchId}`
  }, [churchId])

  return {
    embedUrl: getEmbedUrl(),
    features: {
      chat: true,
      bible: true,
      notes: true,
      prayer: true,
    },
  }
}
