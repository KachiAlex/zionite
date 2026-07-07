import { useState } from 'react'
import { Bell, Mail, Smartphone, ChevronLeft, Save, Loader2 } from 'lucide-react'
import { useNotifications, NotificationPreferences } from '../contexts/NotificationContext'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const categories = [
  { key: 'live_broadcast', label: 'Live Broadcasts', desc: 'Alerts when we go live' },
  { key: 'sermon_radio', label: 'Sermon Radio', desc: 'Station start and resume alerts' },
  { key: 'daily_verse', label: 'Daily Verses', desc: 'Scripture of the day' },
  { key: 'events', label: 'Events & Reminders', desc: 'Upcoming ministry events' },
]

export default function Notifications() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    pushEnabled, pushSupported, requestPush, disablePush, loadingPush,
    preferences, loadingPreferences, updatePreferences
  } = useNotifications()

  const [draft, setDraft] = useState<NotificationPreferences | null>(null)
  const [saving, setSaving] = useState(false)

  const current = draft ?? preferences

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await updatePreferences(draft)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  function toggle(key: string, channel: 'push' | 'email') {
    setDraft((prev) => ({
      ...(prev ?? preferences),
      [`${key}_${channel}`]: !(prev ?? preferences)[`${key}_${channel}` as keyof NotificationPreferences]
    }))
  }

  const changed = draft !== null

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-[11px] text-[#9c958a] hover:text-[#c9a227] mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#c9a227]" /> Notifications
        </h1>
        <p className="text-xs text-[#9c958a] mb-6">Choose what you hear about and how.</p>

        {/* Push master toggle */}
        <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(201,162,39,0.12)] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-[#c9a227]" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Push Notifications</p>
                <p className="text-[11px] text-[#9c958a] mt-0.5">
                  {pushSupported ? 'Receive alerts on this device.' : 'Not supported in this browser.'}
                </p>
              </div>
            </div>
            {pushSupported && (
              <button
                onClick={pushEnabled ? disablePush : requestPush}
                disabled={loadingPush}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                  pushEnabled
                    ? 'bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[#ef4444]/20 hover:bg-[rgba(239,68,68,0.2)]'
                    : 'bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208]'
                }`}>
                {loadingPush ? '...' : pushEnabled ? 'Disable' : 'Enable'}
              </button>
            )}
          </div>
        </div>

        {/* Per-category preferences */}
        <div className="rounded-2xl border border-[rgba(243,238,228,0.08)] bg-[#1c1d24] p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-[#c9a227]" />
            <h2 className="text-sm font-medium text-white">Notification Preferences</h2>
          </div>

          {loadingPreferences ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[#c9a227] animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(({ key, label, desc }) => {
                const pushKey = `${key}_push` as keyof NotificationPreferences
                const emailKey = `${key}_email` as keyof NotificationPreferences
                return (
                  <div key={key} className="rounded-xl bg-[#14141a] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-[11px] text-[#9c958a]">{desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-[12px] text-[#9c958a] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={current[pushKey] !== false}
                          onChange={() => toggle(key, 'push')}
                          className="accent-[#c9a227]"
                        /> Push
                      </label>
                      <label className="flex items-center gap-2 text-[12px] text-[#9c958a] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={current[emailKey] !== false}
                          onChange={() => toggle(key, 'email')}
                          className="accent-[#c9a227]"
                        /> Email
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {changed && (
            <button
              onClick={save}
              disabled={saving}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Preferences
            </button>
          )}
        </div>

        {!user && (
          <p className="text-[11px] text-[#9c958a] text-center">
            <button onClick={() => navigate('/login')} className="text-[#c9a227] hover:underline">Sign in</button> to manage notification preferences.
          </p>
        )}
      </div>
    </div>
  )
}
