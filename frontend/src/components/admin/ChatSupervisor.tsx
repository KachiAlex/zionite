import { useState } from 'react'
import axios from 'axios'
import { MessageSquare, Trash2, Loader2, RefreshCw } from 'lucide-react'

interface ChatMessage {
  id: string
  broadcast_id?: string
  user_name: string
  message: string
  created_at: string
}

export default function ChatSupervisor({ messages, onRefresh }: { messages: ChatMessage[]; onRefresh: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const token = localStorage.getItem('token')

  async function deleteMessage(id: string) {
    if (!confirm('Delete this message?')) return
    setDeleting(id)
    try {
      await axios.delete(`/api/chat/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      onRefresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(243,238,228,0.03)' }}>
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            Chat Messages ({messages.length})
          </h3>
          <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--dim)' }} />
          </button>
        </div>
        {messages.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>No chat messages</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {messages.map(m => (
              <div key={m.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: 'var(--gold)' }}>{m.user_name}</p>
                  <p className="text-sm mt-0.5 break-words">{m.message}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteMessage(m.id)}
                  disabled={deleting === m.id}
                  className="p-1.5 rounded-lg hover:bg-red-900/30 transition-colors shrink-0 mt-1"
                  title="Delete"
                >
                  {deleting === m.id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
