import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { usePageTitle } from '../hooks/usePageTitle'
import { ArrowLeft, Mail, CheckCircle, Radio } from 'lucide-react'

export default function ForgotPassword() {
  usePageTitle('Forgot Password')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) { setError('Please enter a valid email'); return }
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/api/auth/forgot-password`, { email }, { timeout: 15000 })
      setSent(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email')
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
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Reset Password</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>Enter your email and we'll send you a link</p>
          </div>
          <div className="p-4 sm:p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            {sent ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--gold)' }} />
                <h3 className="text-lg font-semibold mb-2">Check your email</h3>
                <p className="text-sm" style={{ color: 'var(--dim)' }}>If an account exists, a reset link has been sent.</p>
                <Link to="/login" className="btn-gold w-full text-sm mt-6 inline-block text-center">Back to Login</Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-6 p-4 rounded-xl text-sm border"
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}>{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email Address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-sm border"
                      style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                      placeholder="you@example.com" required />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-60"
                    style={{ background: 'var(--gold)', color: '#1b1208' }}>
                    <Mail className="w-5 h-5" />
                    {loading ? 'Sending…' : 'Send Reset Link'}
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
