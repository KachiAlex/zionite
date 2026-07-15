import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { usePageTitle } from '../hooks/usePageTitle'
import { ArrowLeft, Lock, CheckCircle, Radio, Loader2, Eye, EyeOff } from 'lucide-react'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  visible: boolean
  setVisible: (v: boolean) => void
  autoComplete?: string
}

const PasswordField = ({ id, label, value, onChange, visible, setVisible, autoComplete }: PasswordFieldProps) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), [onChange])
  const toggleVisible = useCallback(() => setVisible(!visible), [setVisible, visible])

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={handleChange}
          autoComplete={autoComplete || 'new-password'}
          inputMode="text"
          className="w-full rounded-xl px-4 py-3 text-sm border pr-10"
          style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
          placeholder={label}
          required
          minLength={6}
        />
        <button
          type="button"
          onClick={toggleVisible}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:text-parchment"
          style={{ color: 'var(--dim)' }}>
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ResetPassword() {
  usePageTitle('Reset Password')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Please request a new password reset link.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) { setError('Password must include at least one letter and one number'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, { token, password }, { timeout: 15000 })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <header className="max-w-6xl mx-auto w-full px-6 py-6">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm no-underline transition-colors hover:opacity-80" style={{ color: 'var(--dim)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
              <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Set New Password</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>Create a strong password for your account</p>
          </div>
          <div className="p-4 sm:p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            {done ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--gold)' }} />
                <h3 className="text-lg font-semibold mb-2">Password updated</h3>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>Your password has been changed successfully. You can now sign in with your new password.</p>
                <Link to="/login" className="btn-gold w-full text-sm mt-6 inline-block text-center">Go to Login</Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-6 p-4 rounded-xl text-sm border"
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}>{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <PasswordField id="password" label="New Password" value={password} onChange={setPassword} visible={showPassword} setVisible={setShowPassword} autoComplete="new-password" />
                  <PasswordField id="confirm" label="Confirm Password" value={confirm} onChange={setConfirm} visible={showConfirm} setVisible={setShowConfirm} autoComplete="new-password" />
                  <p className="text-xs" style={{ color: 'var(--dim)' }}>Password must be at least 6 characters with letters and numbers.</p>
                  <button type="submit" disabled={loading || !token}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-60"
                    style={{ background: 'var(--gold)', color: '#1b1208' }}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                    {loading ? 'Updating…' : 'Update Password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
