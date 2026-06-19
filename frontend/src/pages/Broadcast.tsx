import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { Radio, BookOpen, AlertCircle, ExternalLink } from 'lucide-react'
import RadioStudio from '../components/broadcast/RadioStudio'
import AudioTestPanel from '../components/broadcast/AudioTestPanel'

export default function Broadcast() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Setup form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scripture, setScripture] = useState('')
  const [churchOnlineUrl, setChurchOnlineUrl] = useState('')
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const [selectedDevice, setSelectedDevice] = useState('')
  const [error, setError] = useState('')

  // Broadcast state
  const [broadcastId, setBroadcastId] = useState('')
  const [status, setStatus] = useState<'idle' | 'live' | 'paused'>('idle')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!user || (user.role !== 'broadcaster' && user.role !== 'admin')) {
      navigate('/')
    }
  }, [user, navigate])

  async function startBroadcast() {
    if (!title.trim()) { setError('Please enter a broadcast title'); return }
    setError('')
    setActionLoading(true)
    try {
      const { data } = await axios.post('/api/broadcasts', {
        title, description, scripture_reference: scripture,
        church_online_url: churchOnlineUrl || undefined,
        rtmp_url: rtmpUrl || undefined,
        stream_key: streamKey || undefined,
      })
      await axios.patch(`/api/broadcasts/${data.id}/start`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      setBroadcastId(data.id)
      setStatus('live')
      setStartTime(new Date())
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start broadcast')
    } finally { setActionLoading(false) }
  }

  async function pauseBroadcast() {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`/api/broadcasts/${broadcastId}/pause`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      setStatus('paused')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to pause')
    } finally { setActionLoading(false) }
  }

  async function resumeBroadcast() {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`/api/broadcasts/${broadcastId}/resume`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      setStatus('live')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resume')
    } finally { setActionLoading(false) }
  }

  async function stopBroadcast() {
    if (!broadcastId) return
    setActionLoading(true)
    try {
      await axios.patch(`/api/broadcasts/${broadcastId}/end`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
    } catch { /* ignore */ }
    setStatus('idle')
    setBroadcastId('')
    setStartTime(null)
    setActionLoading(false)
  }

  if (!user || (user.role !== 'broadcaster' && user.role !== 'admin')) return null

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Broadcast Studio</h1>
          <p className="mt-2" style={{ color: 'var(--dim)' }}>Go live via Church Online Platform</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          {status === 'idle' ? (
            /* ── SETUP FORM ── */
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Broadcast Title</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g., Sunday Morning Service"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                    placeholder="Optional description..."
                    className="w-full rounded-xl px-4 py-3 text-sm border resize-none"
                    style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Scripture Reference
                  </label>
                  <input type="text" value={scripture} onChange={e => setScripture(e.target.value)}
                    placeholder="e.g., Romans 8:1-17"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" style={{ color: 'var(--gold)' }} /> Church Online URL (optional)
                  </label>
                  <input type="text" value={churchOnlineUrl} onChange={e => setChurchOnlineUrl(e.target.value)}
                    placeholder="https://online.church/your-church or custom embed URL"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                  <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>Leave empty to use default: https://online.church/zionitefm</p>
                </div>

                {/* Stream Config */}
                <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <h4 className="text-sm font-medium">Stream Configuration</h4>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dim)' }}>RTMP Ingest URL</label>
                    <input type="text" value={rtmpUrl} onChange={e => setRtmpUrl(e.target.value)}
                      placeholder="rtmp://live.churchonline.com/live"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dim)' }}>Stream Key</label>
                    <input type="password" value={streamKey} onChange={e => setStreamKey(e.target.value)}
                      placeholder="Your Church Online stream key"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ background: 'var(--ink-2)', borderColor: 'var(--line)', color: 'var(--parchment)' }} />
                  </div>
                </div>

                {/* Mic Test */}
                <AudioTestPanel onDeviceSelect={setSelectedDevice} />

                <div className="pt-2">
                  <button onClick={startBroadcast} disabled={actionLoading}
                    className="w-full py-4 text-lg font-medium rounded-xl disabled:opacity-50"
                    style={{ background: 'var(--gold)', color: '#1b1208' }}>
                    {actionLoading ? 'Starting...' : <><Radio className="w-5 h-5 inline mr-2" />Go Live</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── LIVE STUDIO ── */
            <RadioStudio
              broadcastId={broadcastId}
              title={title}
              description={description}
              scripture={scripture}
              churchOnlineUrl={churchOnlineUrl}
              status={status}
              startTime={startTime}
              selectedDevice={selectedDevice}
              onPause={pauseBroadcast}
              onResume={resumeBroadcast}
              onEnd={stopBroadcast}
              actionLoading={actionLoading}
            />
          )}
        </div>
      </div>
    </div>
  )
}
