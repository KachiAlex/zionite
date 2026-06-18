import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { Users, Radio, Headphones, LayoutDashboard, Signal, MessageSquare, Settings, Music } from 'lucide-react'
import BroadcastManager from '../components/admin/BroadcastManager'
import SermonManager from '../components/admin/SermonManager'
import ChatSupervisor from '../components/admin/ChatSupervisor'
import AdminSettings from '../components/admin/AdminSettings'
import MusicManager from '../components/admin/MusicManager'

interface Broadcast {
  id: string
  title: string
  status: 'scheduled' | 'live' | 'ended'
  started_at?: string
  created_at: string
}

interface User {
  id: string
  email: string
  name?: string
  role: string
  created_at: string
}

interface Sermon {
  id: string
  title: string
  speaker: string
  audio_url: string
  date: string
}

interface ChatMessage {
  id: string
  broadcast_id?: string
  user_name: string
  message: string
  created_at: string
}

interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  audio_url: string
  cover_url: string
  duration: number
  lyrics: string
  file_format: string
  file_size: number
  created_at: string
}

interface Stats {
  total: number
  live: number
  ended: number
}

type Tab = 'broadcasts' | 'users' | 'sermons' | 'chat' | 'settings' | 'music'

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, live: 0, ended: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('broadcasts')

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    fetchData()
  }, [user, navigate])

  async function fetchData() {
    setLoading(true)
    try {
      const [broadcastsRes, statsRes, usersRes, sermonsRes, musicRes] = await Promise.all([
        axios.get('/api/broadcasts'),
        axios.get('/api/broadcasts/stats/overview'),
        axios.get('/api/auth/users', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get('/api/sermons'),
        axios.get('/api/music')
      ])
      setBroadcasts(broadcastsRes.data.broadcasts)
      setStats(statsRes.data)
      setUsers(usersRes.data.users)
      setSermons(sermonsRes.data.sermons)
      setMusicTracks(musicRes.data.music || [])
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChat() {
    try {
      // Fetch messages from all broadcasts - simplified approach
      const res = await axios.get('/api/broadcasts')
      const broadcasts = res.data.broadcasts as Broadcast[]
      const allMessages: ChatMessage[] = []
      for (const b of broadcasts.slice(0, 5)) {
        try {
          const msgRes = await axios.get(`/api/chat/${b.id}`)
          allMessages.push(...msgRes.data.messages)
        } catch {}
      }
      // Also get messages without broadcast_id (general chat)
      try {
        const general = await axios.get('/api/chat/general')
        allMessages.push(...general.data.messages)
      } catch {}
      setChatMessages(allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (err) {
      console.error('Failed to fetch chat:', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'chat') fetchChat()
  }, [activeTab])

  async function updateUserRole(userId: string, newRole: string) {
    const token = localStorage.getItem('token')
    try {
      await axios.patch(`/api/auth/users/${userId}/role`, { role: newRole }, { headers: { Authorization: `Bearer ${token}` } })
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update role')
    }
  }

  if (!user || user.role !== 'admin') return null

  const tabBase = 'px-4 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2'

  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <LayoutDashboard className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
            Admin Dashboard
          </h1>
          <p className="mt-2" style={{ color: 'var(--dim)' }}>
            Manage broadcasts, users, sermons, chat, and settings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,162,39,0.08)' }}>
                <Radio className="w-6 h-6" style={{ color: 'var(--gold)' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>Total Broadcasts</p>
                <p className="text-3xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.08)' }}>
                <Signal className="w-6 h-6" style={{ color: '#4ade80' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>Live Now</p>
                <p className="text-3xl font-bold">{stats.live}</p>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(243,238,228,0.06)' }}>
                <Headphones className="w-6 h-6" style={{ color: 'var(--dim)' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>Sermons</p>
                <p className="text-3xl font-bold">{sermons.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {[
            { key: 'broadcasts' as Tab, label: 'Broadcasts', icon: Radio },
            { key: 'users' as Tab, label: 'Users', icon: Users },
            { key: 'sermons' as Tab, label: 'Sermons', icon: Headphones },
            { key: 'music' as Tab, label: 'Music', icon: Music },
            { key: 'chat' as Tab, label: 'Chat', icon: MessageSquare },
            { key: 'settings' as Tab, label: 'Settings', icon: Settings },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={tabBase}
              style={activeTab === tab.key ? { background: 'var(--gold)', color: '#1b1208' } : { color: 'var(--dim)' }}
              onMouseEnter={e => activeTab !== tab.key && (e.currentTarget.style.color = 'var(--parchment)')}
              onMouseLeave={e => activeTab !== tab.key && (e.currentTarget.style.color = 'var(--dim)')}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'broadcasts' && (
          <BroadcastManager broadcasts={broadcasts} onRefresh={fetchData} />
        )}

        {activeTab === 'users' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
              <h2 className="font-semibold">User Management</h2>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--gold)' }} />
                <p className="mt-4 text-sm" style={{ color: 'var(--dim)' }}>Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--line)' }} />
                <p style={{ color: 'var(--dim)' }}>No users yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {users.map(u => (
                  <div
                    key={u.id}
                    className="px-6 py-4 flex items-center justify-between transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(243,238,228,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <p className="font-medium">{u.name || u.email}</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--dim)' }}>{u.email}</p>
                    </div>
                    <select
                      value={u.role}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      className="text-sm rounded-lg px-3 py-1.5 border"
                      style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                    >
                      <option value="listener" style={{ background: 'var(--ink-2)' }}>Listener</option>
                      <option value="broadcaster" style={{ background: 'var(--ink-2)' }}>Broadcaster</option>
                      <option value="admin" style={{ background: 'var(--ink-2)' }}>Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sermons' && (
          <SermonManager sermons={sermons} onRefresh={fetchData} />
        )}

        {activeTab === 'chat' && (
          <ChatSupervisor messages={chatMessages} onRefresh={fetchChat} />
        )}

        {activeTab === 'settings' && (
          <AdminSettings />
        )}

        {activeTab === 'music' && (
          <MusicManager music={musicTracks} onRefresh={fetchData} />
        )}
      </div>
    </div>
  )
}
