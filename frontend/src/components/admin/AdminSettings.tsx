import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Lock, Loader2, Bell, BellOff, Fingerprint, Trash2,
  Mail, Users, Send, CheckCircle, Smartphone, ShieldCheck
} from 'lucide-react'
import { useNotifications } from '../../contexts/NotificationContext'

export default function AdminSettings() {
  const token = localStorage.getItem('token')
  const {
    pushEnabled, pushSupported, requestPush, disablePush, loadingPush,
    biometricSupported, biometricRegistered, registerBiometric, removeBiometric,
    credentials, loadingBiometric
  } = useNotifications()

  const [pwdForm, setPwdForm] = useState({ current: '', newPass: '', confirm: '' })
  const [changing, setChanging] = useState(false)
  const [pwdSuccess, setPwdSuccess] = useState(false)

  const [pushForm, setPushForm] = useState({ title: '', body: '', url: '' })
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [subCount, setSubCount] = useState<number | null>(null)
  const [newsletterCount, setNewsletterCount] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return
    axios.get('/api/push/subscribers/count', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setSubCount(r.data.count)).catch(() => {})
    axios.get('/api/newsletter/subscribers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setNewsletterCount(r.data.total)).catch(() => {})
  }, [token])

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwdForm.current || !pwdForm.newPass || !pwdForm.confirm) { alert('All fields required'); return }
    if (pwdForm.newPass !== pwdForm.confirm) { alert('New passwords do not match'); return }
    setChanging(true)
    setPwdSuccess(false)
    try {
      await axios.post('/api/auth/change-password', { currentPassword: pwdForm.current, newPassword: pwdForm.newPass },
        { headers: { Authorization: `Bearer ${token}` } })
      setPwdForm({ current: '', newPass: '', confirm: '' })
      setPwdSuccess(true)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to change password')
    } finally { setChanging(false) }
  }

  async function sendPushBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!pushForm.title || !pushForm.body) { alert('Title and message are required'); return }
    setSending(true)
    setSendResult(null)
    try {
      const r = await axios.post('/api/push/broadcast', pushForm, { headers: { Authorization: `Bearer ${token}` } })
      setSendResult(r.data.message || 'Sent!')
      setPushForm({ title: '', body: '', url: '' })
    } catch (err: any) {
      setSendResult(err.response?.data?.error || 'Failed to send')
    } finally { setSending(false) }
  }

  const card = 'rounded-2xl p-5 space-y-4'
  const cardStyle = { background: 'var(--ink-2)', border: '1px solid var(--line)' }
  const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none'
  const inputStyle = { background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Push Notification Stats ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className={card} style={cardStyle}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(201,162,39,0.12)] flex items-center justify-center">
              <Bell className="w-5 h-5 text-[#c9a227]" />
            </div>
            <div>
              <p className="text-xs text-[#9c958a]">Push Subscribers</p>
              <p className="text-2xl font-bold text-white">{subCount ?? '—'}</p>
            </div>
          </div>
        </div>
        <div className={card} style={cardStyle}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(59,130,246,0.12)] flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#3b82f6]" />
            </div>
            <div>
              <p className="text-xs text-[#9c958a]">Email Subscribers</p>
              <p className="text-2xl font-bold text-white">{newsletterCount ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Broadcast Push Notification ── */}
      <div className={card} style={cardStyle}>
        <h3 className="font-semibold flex items-center gap-2 text-sm text-white">
          <Send className="w-4 h-4 text-[#c9a227]" /> Broadcast Push Notification
        </h3>
        <p className="text-xs text-[#9c958a]">Send a push notification to all subscribed devices.</p>
        <form onSubmit={sendPushBroadcast} className="space-y-3">
          <input className={inputCls} style={inputStyle} placeholder="Notification title" value={pushForm.title}
            onChange={e => setPushForm({ ...pushForm, title: e.target.value })} />
          <textarea className={inputCls} style={inputStyle} placeholder="Notification message" rows={3} value={pushForm.body}
            onChange={e => setPushForm({ ...pushForm, body: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="URL to open (optional, e.g. /events)" value={pushForm.url}
            onChange={e => setPushForm({ ...pushForm, url: e.target.value })} />
          <button type="submit" disabled={sending}
            className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to All Subscribers
          </button>
          {sendResult && (
            <p className={`text-sm flex items-center gap-2 ${sendResult.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
              <CheckCircle className="w-4 h-4" /> {sendResult}
            </p>
          )}
        </form>
      </div>

      {/* ── Your Push Notification Toggle ── */}
      <div className={card} style={cardStyle}>
        <h3 className="font-semibold flex items-center gap-2 text-sm text-white">
          <Bell className="w-4 h-4 text-[#c9a227]" /> Your Push Notifications
        </h3>
        <p className="text-xs text-[#9c958a]">
          {!pushSupported
            ? 'Push notifications are not supported in this browser.'
            : pushEnabled
            ? 'Push notifications are enabled on this device.'
            : 'Enable push notifications to receive alerts on this device.'}
        </p>
        {pushSupported && (
          <button onClick={pushEnabled ? disablePush : requestPush} disabled={loadingPush}
            className={`flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors ${
              pushEnabled
                ? 'bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.2)] text-[#ef4444] border border-[#ef4444]/20'
                : 'bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208]'
            }`}>
            {loadingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : pushEnabled ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            {pushEnabled ? 'Disable Notifications' : 'Enable Notifications'}
          </button>
        )}
      </div>

      {/* ── Biometric Authentication ── */}
      <div className={card} style={cardStyle}>
        <h3 className="font-semibold flex items-center gap-2 text-sm text-white">
          <Fingerprint className="w-4 h-4 text-[#c9a227]" /> Biometric Login
        </h3>
        {!biometricSupported ? (
          <p className="text-xs text-[#9c958a]">
            Biometric login (fingerprint / Face ID) is not supported on this device or browser.
          </p>
        ) : (
          <>
            <p className="text-xs text-[#9c958a]">
              Register this device's fingerprint or Face ID to sign in without a password.
            </p>
            {credentials.length > 0 && (
              <div className="space-y-2">
                {credentials.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--ink)', border: '1px solid var(--line)' }}>
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-4 h-4 text-[#9c958a]" />
                      <div>
                        <p className="text-sm text-white font-medium">{c.device_name}</p>
                        <p className="text-[10px] text-[#9c958a]">Registered {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button onClick={() => removeBiometric(c.id)} disabled={loadingBiometric}
                      className="text-[#ef4444] hover:text-red-300 transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!biometricRegistered && (
              <button onClick={registerBiometric} disabled={loadingBiometric}
                className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors">
                {loadingBiometric ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Register This Device
              </button>
            )}
            {biometricRegistered && (
              <button onClick={registerBiometric} disabled={loadingBiometric}
                className="flex items-center gap-2 text-sm text-[#c9a227] hover:underline disabled:opacity-50">
                <Fingerprint className="w-4 h-4" /> Add Another Device
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Change Password ── */}
      <div className={card} style={cardStyle}>
        <h3 className="font-semibold flex items-center gap-2 text-sm text-white">
          <Lock className="w-4 h-4 text-[#c9a227]" /> Change Password
        </h3>
        <form onSubmit={changePassword} className="space-y-3 max-w-md">
          <input type="password" placeholder="Current password" value={pwdForm.current} className={inputCls} style={inputStyle}
            onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })} />
          <input type="password" placeholder="New password" value={pwdForm.newPass} className={inputCls} style={inputStyle}
            onChange={e => setPwdForm({ ...pwdForm, newPass: e.target.value })} />
          <input type="password" placeholder="Confirm new password" value={pwdForm.confirm} className={inputCls} style={inputStyle}
            onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })} />
          <button type="submit" disabled={changing}
            className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors">
            {changing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Update Password
          </button>
          {pwdSuccess && <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Password changed successfully!</p>}
        </form>
      </div>

      {/* ── Contact Info ── */}
      <div className={card} style={cardStyle}>
        <h3 className="font-semibold flex items-center gap-2 text-sm text-white">
          <Users className="w-4 h-4 text-[#c9a227]" /> Ministry Contact
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-[#9c958a]">
            <Mail className="w-4 h-4 text-[#c9a227]" />
            <span>theredemptionprojectministries@gmail.com</span>
          </div>
          <p className="text-xs text-[#9c958a]">All newsletter subscriptions and contact enquiries route to this address.</p>
        </div>
      </div>
    </div>
  )
}
