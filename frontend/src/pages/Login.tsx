import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { loginSchema, registerSchema } from '../lib/validation'
import { LogIn, UserPlus, Radio, ArrowLeft } from 'lucide-react'

export default function Login() {
  usePageTitle('Login')
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side Zod validation
    const schema = isRegister ? registerSchema : loginSchema
    const payload = isRegister ? { email, password, name } : { email, password }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Invalid input'
      setError(firstError)
      return
    }

    setLoading(true)
    try {
      const endpoint = isRegister ? `${API_BASE}/api/auth/register` : `${API_BASE}/api/auth/login`
      console.log('[AUTH] calling', endpoint, 'with', JSON.stringify(Object.keys(payload)))
      const { data } = await axios.post(endpoint, payload, { timeout: 15000 })
      console.log('[AUTH] success, role:', data.user?.role)
      login(data.token, data.user)

      switch (data.user.role) {
        case 'admin':
          navigate('/admin')
          break
        case 'broadcaster':
          navigate('/broadcast')
          break
        case 'listener':
        default:
          navigate('/')
          break
      }
    } catch (err: any) {
      console.error('[AUTH] raw error:', err)
      console.error('[AUTH] err.message:', err.message)
      console.error('[AUTH] err.code:', err.code)
      console.error('[AUTH] err.response:', err.response)
      console.error('[AUTH] err.request:', err.request ? 'request exists (no response)' : 'no request')
      const msg = err.response?.data?.error
      const errorStr = typeof msg === 'string' ? msg : (msg?.message || JSON.stringify(msg) || (err.message || 'Something went wrong'))
      console.error('[AUTH] derived errorStr:', errorStr)
      setError(errorStr)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <header className="max-w-6xl mx-auto w-full px-6 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm no-underline transition-colors"
          style={{ color: 'var(--dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--parchment)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--gold)' }}
            >
              <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
              {isRegister ? 'Join Zionite FM to start broadcasting' : 'Sign in to your account'}
            </p>
          </div>

          <div className="p-4 sm:p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm border"
                style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isRegister && (
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm border"
                    style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                    placeholder="Enter your name"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm border"
                  style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm border"
                  style={{ background: 'var(--ink)', borderColor: 'var(--line)', color: 'var(--parchment)' }}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--dim)' }}>Must be at least 6 characters</p>
                {!isRegister && (
                  <Link to="/forgot-password" className="text-xs mt-1 inline-block hover:underline" style={{ color: 'var(--gold)' }}>Forgot password?</Link>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-60"
                style={{ background: 'var(--gold)', color: '#1b1208' }}
              >
                {isRegister ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-center text-sm" style={{ color: 'var(--dim)' }}>
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setIsRegister(!isRegister)}
                  className="font-medium underline-offset-2 hover:underline"
                  style={{ color: 'var(--gold)' }}
                >
                  {isRegister ? 'Sign in' : 'Create one'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
