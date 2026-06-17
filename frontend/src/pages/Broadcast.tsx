import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../hooks/useSocket'
import { Mic, MicOff, Radio, BookOpen, FileText, AlertCircle, Signal, Volume2 } from 'lucide-react'

export default function Broadcast() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { socket, connected } = useSocket()
  const [isLive, setIsLive] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scripture, setScripture] = useState('')
  const [broadcastId, setBroadcastId] = useState('')
  const [error, setError] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!user || (user.role !== 'broadcaster' && user.role !== 'admin')) {
      navigate('/')
    }
  }, [user, navigate])

  async function startBroadcast() {
    if (!title.trim()) {
      setError('Please enter a broadcast title')
      return
    }
    setError('')

    try {
      const { data } = await axios.post('/api/broadcasts', {
        title,
        description,
        scripture_reference: scripture,
      })
      setBroadcastId(data.broadcast.id)
      setIsLive(true)
      await startAudioCapture(data.broadcast.id)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start broadcast')
    }
  }

  async function startAudioCapture(bid: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket) {
          event.data.arrayBuffer().then((buffer) => {
            socket.emit('audio-chunk', { broadcastId: bid, chunk: buffer })
          })
        }
      }

      mediaRecorder.start(1000)
      socket?.emit('broadcaster-join', bid)

      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      intervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(average / 255)
      }, 100)
    } catch {
      setError('Microphone access denied or not available')
      setIsLive(false)
    }
  }

  async function stopBroadcast() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (broadcastId) {
      try {
        await axios.post(`/api/broadcasts/${broadcastId}/end`)
      } catch {
        // ignore
      }
    }
    setIsLive(false)
    setBroadcastId('')
    setAudioLevel(0)
  }

  if (!user || (user.role !== 'broadcaster' && user.role !== 'admin')) {
    return null
  }

  return (
    <div className="container-custom py-8 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Radio className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Broadcast Studio</h1>
          <p className="text-gray-600 mt-2">Go live and connect with your congregation</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="card overflow-hidden">
          {!isLive ? (
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Broadcast Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Sunday Morning Service"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional description..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary-600" />
                    Scripture Reference
                  </label>
                  <input
                    type="text"
                    value={scripture}
                    onChange={(e) => setScripture(e.target.value)}
                    placeholder="e.g., Romans 8:1-17"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={startBroadcast}
                    disabled={!connected}
                    className="w-full btn-primary py-4 text-lg"
                  >
                    <Mic className="w-5 h-5 mr-2" />
                    {connected ? 'Go Live' : 'Connecting...'}
                  </button>
                  {!connected && (
                    <p className="text-sm text-gray-500 text-center mt-3">Waiting for server connection...</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Live Header */}
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                        <Mic className="w-7 h-7 text-white" />
                      </div>
                      <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-white" />
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-white/20 rounded text-xs font-semibold uppercase tracking-wide">Live</span>
                        <Signal className="w-4 h-4 text-green-300" />
                      </div>
                      <h2 className="text-xl font-bold">{title}</h2>
                    </div>
                  </div>
                  <button
                    onClick={stopBroadcast}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors backdrop-blur"
                  >
                    <MicOff className="w-4 h-4" />
                    End Broadcast
                  </button>
                </div>
              </div>

              {/* Live Controls */}
              <div className="p-6 space-y-6">
                {/* Audio Level Meter */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4" />
                      <span>Audio Level</span>
                    </div>
                    <span className="font-medium">{Math.round(audioLevel * 100)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-100"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                </div>

                {/* Broadcast Details */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <span className="font-medium text-gray-700">Description</span>
                      <p className="text-gray-600">{description || 'No description provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <BookOpen className="w-5 h-5 text-primary-500 mt-0.5" />
                    <div>
                      <span className="font-medium text-gray-700">Scripture</span>
                      <p className="text-gray-600">{scripture || 'No scripture reference'}</p>
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
                  <p className="text-sm text-primary-800">
                    <span className="font-semibold">Pro tip:</span> Keep an eye on your audio levels. Aim for the green zone (50-80%) for optimal sound quality.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
