import { useState } from 'react'
import axios from 'axios'
import { Settings, Lock, Loader2 } from 'lucide-react'

export default function AdminSettings() {
  const [pwdForm, setPwdForm] = useState({ current: '', newPass: '', confirm: '' })
  const [changing, setChanging] = useState(false)
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const token = localStorage.getItem('token')

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwdForm.current || !pwdForm.newPass || !pwdForm.confirm) {
      alert('All fields required')
      return
    }
    if (pwdForm.newPass !== pwdForm.confirm) {
      alert('New passwords do not match')
      return
    }
    setChanging(true)
    setPwdSuccess(false)
    try {
      await axios.post('/api/auth/change-password', {
        currentPassword: pwdForm.current,
        newPassword: pwdForm.newPass
      }, { headers: { Authorization: `Bearer ${token}` } })
      setPwdForm({ current: '', newPass: '', confirm: '' })
      setPwdSuccess(true)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to change password')
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          Change Password
        </h3>
        <form onSubmit={changePassword} className="space-y-3 max-w-md">
          <input
            type="password"
            placeholder="Current password"
            value={pwdForm.current}
            onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            type="password"
            placeholder="New password"
            value={pwdForm.newPass}
            onChange={e => setPwdForm({ ...pwdForm, newPass: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={pwdForm.confirm}
            onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }}
          />
          <button type="submit" disabled={changing} className="btn-gold disabled:opacity-50">
            {changing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Update Password
          </button>
          {pwdSuccess && (
            <p className="text-sm text-green-400">Password changed successfully!</p>
          )}
        </form>
      </div>

      {/* Biometrics placeholder */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          Biometric Authentication
        </h3>
        <p className="text-sm" style={{ color: 'var(--dim)' }}>
          Biometric login (fingerprint / face recognition) requires a device with compatible hardware.
          This feature will be enabled when WebAuthn/FIDO2 is configured.
        </p>
      </div>
    </div>
  )
}
