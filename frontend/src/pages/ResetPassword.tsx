import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { usePageTitle } from '../hooks/usePageTitle'
import { ArrowLeft, Lock, CheckCircle, Radio } from 'lucide-react'

export default function ResetPassword() {
  usePageTitle('Reset Password')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, { token, password }, { timeout: 15000 })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <header className="max-w-6xl mx-auto w-full px-6 py-6">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm no-underline transition-colors" style={{ color: 'var(--dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--parchment)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}>
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
              <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>New Password</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>Create a new password for your account</p>
          </div>
          <div className="p-4 sm:p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            {done ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--gold)' }} />
                <h3 className="text-lg font-semibold mb-2">Password updated</h3>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>You can now sign in with your new password.</p>
                <Link to="/login" className="btn-gold w-full text-sm mt-6 inline-block text-center">Go to Login</Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-6 p-4 rounded-xl text-sm border"
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}>{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">New Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-sm border"
                      style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                      placeholder="Enter new password" required minLength={6} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Confirm Password</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-sm border"
                      style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                      placeholder="Re-enter password" required minLength={6} />
                  </div>
                  <button type="submit" disabled={loading || !token}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-60"
                    style={{ background: 'var(--gold)', color: '#1b1208' }}>
                    <Lock className="w-5 h-5" />
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
