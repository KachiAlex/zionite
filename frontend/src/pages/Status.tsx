import { useEffect, useState } from 'react'
import axios from 'axios'
import { Activity, CheckCircle, XCircle, Radio, Database, Server, Wifi, RefreshCw } from 'lucide-react'

interface StatusData {
  status: string
  database: string
  streaming: string
  timestamp: string
}

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  async function fetchStatus() {
    try {
      const { data } = await axios.get('/api/status')
      setData(data)
      setError(false)
    } catch {
      setError(true)
      setData(null)
    }
  }

  return (
    <div className="container-custom py-8 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
          <p className="text-gray-600 mt-2">Real-time monitoring of platform health</p>
        </div>

        <div className="card overflow-hidden">
          {error ? (
            <div className="p-8">
              <div className="flex items-center gap-4 text-red-700 bg-red-50 rounded-xl p-6">
                <XCircle className="w-8 h-8" />
                <div>
                  <p className="font-semibold text-lg">Service Unavailable</p>
                  <p className="text-sm">Cannot connect to the backend server. Please check your connection.</p>
                </div>
              </div>
            </div>
          ) : data ? (
            <div className="divide-y divide-gray-100">
              {/* Overall Status */}
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${data.status === 'healthy' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Server className={`w-5 h-5 ${data.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Platform Status</p>
                    <p className="text-sm text-gray-500">All systems operational</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${data.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {data.status === 'healthy' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {data.status === 'healthy' ? 'Healthy' : 'Issues Detected'}
                </span>
              </div>

              {/* Database */}
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${data.database === 'connected' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Database className={`w-5 h-5 ${data.database === 'connected' ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Database</p>
                    <p className="text-sm text-gray-500">Connection status</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${data.database === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                  {data.database === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Streaming */}
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${data.streaming === 'live' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <Radio className={`w-5 h-5 ${data.streaming === 'live' ? 'text-primary-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Streaming Service</p>
                    <p className="text-sm text-gray-500">Live broadcast status</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${data.streaming === 'live' ? 'text-primary-600' : 'text-gray-600'}`}>
                  {data.streaming === 'live' ? '🔴 Live Broadcast Active' : 'Idle'}
                </span>
              </div>

              {/* Network */}
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Network</p>
                    <p className="text-sm text-gray-500">API connectivity</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-green-600">Connected</span>
              </div>

              {/* Last Updated */}
              <div className="px-6 py-4 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-sm">Last checked</span>
                </div>
                <span className="text-sm text-gray-500">
                  {data.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
              <p className="text-gray-500 mt-4">Checking system status...</p>
            </div>
          )}
        </div>

        {/* Auto-refresh note */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Status updates automatically every 10 seconds
        </p>
      </div>
    </div>
  )
}
