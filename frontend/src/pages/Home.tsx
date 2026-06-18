import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useSocket } from '../hooks/useSocket'
import { 
  Radio, Play, Pause, Volume2, VolumeX, Headphones, Mic, BookOpen, 
  Wifi, Shield, Heart, Globe, Clock, ArrowRight, CheckCircle2 
} from 'lucide-react'

interface Broadcast {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  status: string
  started_at?: string
  broadcaster_id: string
}

export default function Home() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [ended, setEnded] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const queueRef = useRef<AudioBuffer[]>([])
  const isPlayingChunkRef = useRef(false)
  const nextTimeRef = useRef(0)
  const { socket, connected } = useSocket()

  useEffect(() => {
    fetchActiveBroadcast()
    const interval = setInterval(fetchActiveBroadcast, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('audio-chunk', handleAudioChunk)
    socket.on('broadcast-ended', () => {
      setEnded(true)
      setIsPlaying(false)
    })
    return () => {
      socket.off('audio-chunk', handleAudioChunk)
      socket.off('broadcast-ended')
    }
  }, [socket])

  async function fetchActiveBroadcast() {
    try {
      const { data } = await axios.get('/api/broadcasts/active')
      setBroadcast(data.broadcast)
      if (data.broadcast && !ended) {
        joinBroadcast(data.broadcast.id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  function joinBroadcast(broadcastId: string) {
    socket?.emit('listener-join', broadcastId)
  }

  function handleAudioChunk({ chunk }: { chunk: ArrayBuffer }) {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const ctx = audioContextRef.current

    ctx.decodeAudioData(chunk.slice(0), (buffer: AudioBuffer) => {
      queueRef.current.push(buffer)
      if (isPlaying && !isPlayingChunkRef.current) {
        playNextChunk()
      }
    })
  }

  function playNextChunk() {
    if (!audioContextRef.current || queueRef.current.length === 0) {
      isPlayingChunkRef.current = false
      return
    }
    isPlayingChunkRef.current = true
    const ctx = audioContextRef.current
    const buffer = queueRef.current.shift()!
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    if (nextTimeRef.current < ctx.currentTime) {
      nextTimeRef.current = ctx.currentTime
    }
    source.start(nextTimeRef.current)
    nextTimeRef.current += buffer.duration
    source.onended = playNextChunk
  }

  function togglePlay() {
    if (!isPlaying) {
      setIsPlaying(true)
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      playNextChunk()
    } else {
      setIsPlaying(false)
      audioContextRef.current?.suspend()
    }
  }

  function toggleMute() {
    setIsMuted(!isMuted)
  }

  const features = [
    {
      icon: Radio,
      title: 'One-Tap Go Live',
      description: 'Start streaming instantly from a phone or browser. Add titles, descriptions, and scripture references on the fly.'
    },
    {
      icon: BookOpen,
      title: 'Live Scripture Strip',
      description: 'Tag verses in real-time. They appear instantly on the listener\'s screen, perfectly synced to the audio.'
    },
    {
      icon: Heart,
      title: 'Private Prayer Requests',
      description: 'A dedicated channel that routes sensitive prayer needs straight to your pastoral care dashboard.'
    },
    {
      icon: Shield,
      title: 'In-Broadcast Giving',
      description: 'Seamless tithes and offerings built right into the broadcast screen so listeners never have to leave the stream.'
    }
  ]

  const reliabilityFeatures = [
    { icon: Wifi, text: 'Automatic reconnect handling' },
    { icon: Globe, text: 'Low-bandwidth audio fallback' },
    { icon: Clock, text: 'Graceful start and end transitions' },
    { icon: CheckCircle2, text: 'Public status page for your congregation' }
  ]

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-brand-50">
        <div className="container-custom py-16 lg:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Broadcast your message.<br />
              <span className="text-primary-600">Build your community.</span>
            </h1>
            <p className="text-lg lg:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              A single-church, web-first live broadcasting platform purpose-built for sermon broadcasting, congregational engagement, and biblical content discovery.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login" className="btn-primary w-full sm:w-auto">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link to="/archive" className="btn-secondary w-full sm:w-auto">
                Explore Features
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live Broadcast Section */}
      <section className="section bg-white">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">Now Broadcasting</h2>
              <p className="text-gray-600">Tune in to our live stream or browse past sermons</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : broadcast ? (
              <div className="card overflow-hidden">
                <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                    </span>
                    <span className="text-sm font-semibold uppercase tracking-wide">Live Now</span>
                    {!connected && (
                      <span className="ml-auto text-xs bg-white/20 px-2 py-1 rounded-full">
                        Reconnecting...
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl lg:text-2xl font-bold mb-1">{broadcast.title}</h3>
                  {broadcast.description && (
                    <p className="text-primary-100 text-sm">{broadcast.description}</p>
                  )}
                  {broadcast.scripture_reference && (
                    <div className="flex items-center gap-1.5 text-sm text-primary-100 mt-2">
                      <BookOpen className="w-4 h-4" />
                      <span>{broadcast.scripture_reference}</span>
                    </div>
                  )}
                </div>
                
                <div className="p-6">
                  {ended ? (
                    <div className="text-center py-8">
                      <Headphones className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-gray-900">Broadcast Ended</h3>
                      <p className="text-gray-500 text-sm mt-1">This broadcast has concluded.</p>
                      <Link to="/archive" className="btn-primary inline-flex mt-4 text-sm py-2 px-4">
                        Go to Archive
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={togglePlay}
                        className="w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                      </button>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {isPlaying ? 'Listening live' : 'Tap to listen'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {connected ? 'Connected to stream' : 'Reconnecting to stream...'}
                        </p>
                      </div>
                      <button
                        onClick={toggleMute}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                      >
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Radio className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Nothing Live Right Now</h3>
                <p className="text-gray-500 text-sm mb-4">Check back during scheduled services or browse the archive.</p>
                <Link to="/archive" className="btn-secondary inline-flex text-sm py-2 px-4">
                  <Headphones className="w-4 h-4 mr-2" />
                  Browse Archive
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="section bg-gray-50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Designed for Ministry</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Every feature is crafted to support the unique needs of a church broadcast, from pastoral care to accessibility.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="card p-6 lg:p-8 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Unified Platform Section */}
      <section className="section bg-white">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              A unified platform for the modern church.
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Everything you need to broadcast, engage, and grow your congregation in one place. No more stitching together generic tools.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/broadcast" className="btn-primary">
                <Mic className="w-4 h-4 mr-2" />
                Start Broadcasting
              </Link>
              <Link to="/archive" className="btn-secondary">
                <Headphones className="w-4 h-4 mr-2" />
                Browse Archive
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Reliability Section */}
      <section className="section bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">
                Built for reliability and scale.
              </h2>
              <p className="text-lg text-gray-300 mb-6">
                Whether you're streaming to 50 people or 5,000, Zionitefm ensures a flawless experience with intelligent fallbacks and automatic reconnects.
              </p>
              <ul className="space-y-3">
                {reliabilityFeatures.map((item) => (
                  <li key={item.text} className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 text-primary-400" />
                    <span className="text-gray-300">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
                <div className="text-3xl lg:text-4xl font-bold text-primary-400 mb-1">99.9%</div>
                <div className="text-sm text-gray-400">Uptime</div>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
                <div className="text-3xl lg:text-4xl font-bold text-primary-400 mb-1">&lt;1s</div>
                <div className="text-sm text-gray-400">Latency</div>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
                <div className="text-3xl lg:text-4xl font-bold text-primary-400 mb-1">24/7</div>
                <div className="text-sm text-gray-400">Support</div>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
                <div className="text-3xl lg:text-4xl font-bold text-primary-400 mb-1">GDPR</div>
                <div className="text-sm text-gray-400">Compliant</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section bg-primary-600">
        <div className="container-custom text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to upgrade your broadcast?
          </h2>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
            Join churches using Zionitefm to engage their congregation online.
          </p>
          <Link to="/login" className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-base font-medium rounded-xl text-primary-600 bg-white hover:bg-gray-50 transition-colors">
            Get Started Today
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>
    </div>
  )
}
