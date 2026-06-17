import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { Users, Radio, Headphones, LayoutDashboard, Signal } from 'lucide-react'

interface Broadcast {
  id: string
  title: string
  status: string
  started_at?: string
  ended_at?: string
  broadcaster_id: string
}

interface User {
  id: string
  email: string
  name: string
  role: 'listener' | 'broadcaster' | 'admin'
  created_at: string
}

interface Stats {
  total: number
  live: number
  ended: number
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, live: 0, ended: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'broadcasts' | 'users'>('broadcasts')

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    fetchData()
  }, [user, navigate])

  async function fetchData() {
    try {
      const [broadcastsRes, statsRes, usersRes] = await Promise.all([
        axios.get('/api/broadcasts'),
        axios.get('/api/broadcasts/stats/overview'),
        axios.get('/api/auth/users')
      ])
      setBroadcasts(broadcastsRes.data.broadcasts)
      setStats(statsRes.data)
      setUsers(usersRes.data.users)
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function updateUserRole(userId: string, newRole: string) {
    try {
      await axios.put(`/api/auth/users/${userId}/role`, { role: newRole })
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u))
    } catch (err) {
      console.error('Failed to update user role:', err)
    }
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className="container-custom py-8 lg:py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
          <LayoutDashboard className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage broadcasts and monitor platform activity</p>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
                <Radio className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Broadcasts</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                <Signal className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Live Now</p>
                <p className="text-3xl font-bold text-gray-900">{stats.live}</p>
              </div>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
                <Headphones className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ended</p>
                <p className="text-3xl font-bold text-gray-900">{stats.ended}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('broadcasts')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'broadcasts'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Radio className="w-4 h-4 inline mr-2" />
            Broadcasts
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Users ({users.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'broadcasts' ? (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">Recent Broadcasts</h2>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
              <p className="text-gray-500 mt-4">Loading broadcasts...</p>
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="p-12 text-center">
              <Radio className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No broadcasts yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {broadcasts.map(b => (
                <div key={b.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{b.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {b.started_at ? new Date(b.started_at).toLocaleString() : 'Scheduled'}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    b.status === 'live' 
                      ? 'bg-primary-100 text-primary-700' 
                      : b.status === 'ended' 
                        ? 'bg-gray-100 text-gray-700' 
                        : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        ) : (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-900">User Management</h2>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
              <p className="text-gray-500 mt-4">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No users yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map(u => (
                <div key={u.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{u.name || u.email}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{u.email}</p>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => updateUserRole(u.id, e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="listener">Listener</option>
                    <option value="broadcaster">Broadcaster</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
