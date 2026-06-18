import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { Radio, BookOpen, FileText, AlertCircle, ExternalLink, Copy, CheckCircle } from 'lucide-react'

export default function Broadcast() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isLive, setIsLive] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scripture, setScripture] = useState('')
  const [churchOnlineUrl, setChurchOnlineUrl] = useState('')
  const [broadcastId, setBroadcastId] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

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
        church_online_url: churchOnlineUrl || undefined,
      })
      setBroadcastId(data.id)
      setIsLive(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start broadcast')
    }
  }

  async function stopBroadcast() {
    if (broadcastId) {
      try {
        await axios.patch(`/api/broadcasts/${broadcastId}/end`)
      } catch {
        // ignore
      }
    }
    setIsLive(false)
    setBroadcastId('')
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!user || (user.role !== 'broadcaster' && user.role !== 'admin')) {
    return null
  }

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-8">
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--gold)' }}
          >
            <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Broadcast Studio</h1>
          <p className="mt-2" style={{ color: 'var(--dim)' }}>Go live via Church Online Platform</p>
        </div>

        {error && (
          <div 
            className="mb-6 p-4 rounded-xl text-sm flex items-center gap-3"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div 
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
        >
          {!isLive ? (
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Broadcast Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Sunday Morning Service"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ 
                      background: 'var(--ink)', 
                      borderColor: 'var(--line)', 
                      color: 'var(--parchment)'
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional description..."
                    className="w-full rounded-xl px-4 py-3 text-sm border resize-none"
                    style={{ 
                      background: 'var(--ink)', 
                      borderColor: 'var(--line)', 
                      color: 'var(--parchment)'
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                    Scripture Reference
                  </label>
                  <input
                    type="text"
                    value={scripture}
                    onChange={(e) => setScripture(e.target.value)}
                    placeholder="e.g., Romans 8:1-17"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ 
                      background: 'var(--ink)', 
                      borderColor: 'var(--line)', 
                      color: 'var(--parchment)'
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                    Church Online URL (optional)
                  </label>
                  <input
                    type="text"
                    value={churchOnlineUrl}
                    onChange={(e) => setChurchOnlineUrl(e.target.value)}
                    placeholder="https://online.church/your-church or custom embed URL"
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ 
                      background: 'var(--ink)', 
                      borderColor: 'var(--line)', 
                      color: 'var(--parchment)'
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                    Leave empty to use default: https://online.church/zionitefm
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={startBroadcast}
                    className="w-full py-4 text-lg font-medium rounded-xl"
                    style={{ background: 'var(--gold)', color: '#1b1208' }}
                  >
                    <Radio className="w-5 h-5 inline mr-2" />
                    Go Live
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Live Header */}
              <div 
                className="p-6 text-white"
                style={{ background: 'var(--gold)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div 
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(27,18,8,0.2)' }}
                      >
                        <Radio className="w-7 h-7" style={{ color: '#1b1208' }} />
                      </div>
                      <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#1b1208' }} />
                        <span className="relative inline-flex rounded-full h-4 w-4" style={{ background: '#1b1208' }} />
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span 
                          className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
                          style={{ background: 'rgba(27,18,8,0.2)', color: '#1b1208' }}
                        >
                          Live
                        </span>
                      </div>
                      <h2 className="text-xl font-bold" style={{ color: '#1b1208' }}>{title}</h2>
                    </div>
                  </div>
                  <button
                    onClick={stopBroadcast}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                    style={{ background: 'rgba(27,18,8,0.2)', color: '#1b1208' }}
                  >
                    End Broadcast
                  </button>
                </div>
              </div>

              {/* Live Info */}
              <div className="p-6 space-y-6">
                {/* Church Online Platform Link */}
                <div 
                  className="rounded-xl p-4"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Church Online Platform</span>
                    <span className="text-xs" style={{ color: 'var(--dim)' }}>Stream via this link</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={churchOnlineUrl || 'https://online.church/zionitefm'}
                      className="flex-1 rounded-lg px-3 py-2 text-sm border"
                      style={{ 
                        background: 'var(--ink-2)', 
                        borderColor: 'var(--line)',
                        color: 'var(--parchment)'
                      }}
                    />
                    <button
                      onClick={() => copyToClipboard(churchOnlineUrl || 'https://online.church/zionitefm')}
                      className="px-3 py-2 rounded-lg flex items-center gap-1 text-sm"
                      style={{ background: 'var(--gold)', color: '#1b1208' }}
                    >
                      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Broadcast Details */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <FileText className="w-5 h-5 mt-0.5" style={{ color: 'var(--dim)' }} />
                    <div>
                      <span className="font-medium">Description</span>
                      <p style={{ color: 'var(--dim)' }}>{description || 'No description provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <BookOpen className="w-5 h-5 mt-0.5" style={{ color: 'var(--gold)' }} />
                    <div>
                      <span className="font-medium">Scripture</span>
                      <p style={{ color: 'var(--dim)' }}>{scripture || 'No scripture reference'}</p>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div 
                  className="rounded-xl p-4"
                  style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}
                >
                  <p className="text-sm" style={{ color: 'var(--dim)' }}>
                    <span className="font-semibold" style={{ color: 'var(--parchment)' }}>How to stream:</span> Use OBS, StreamYard, or Church Online Platform directly. Share the link above with your team. The live page will automatically show your stream to listeners.
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
