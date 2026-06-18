import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, UserPlus, Radio, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Login() {
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
    setLoading(true)

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const payload = isRegister ? { email, password, name } : { email, password }
      const { data } = await axios.post(endpoint, payload, { timeout: 10000 })
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
      const msg = err.response?.data?.error
      const errorStr = typeof msg === 'string' ? msg : (msg?.message || JSON.stringify(msg) || 'Something went wrong')
      console.error('Login failed:', err.response?.status, err.response?.data)
      setError(errorStr)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      {/* Header */}
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

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--gold)' }}
            >
              <Radio className="w-8 h-8" style={{ color: '#1b1208' }} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
              {isRegister ? 'Join Zionite FM to start broadcasting' : 'Sign in to your account'}
            </p>
          </div>

          {/* Form Card */}
          <div
            className="p-8 rounded-2xl"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}
          >
            {error && (
              <div
                className="mb-6 p-4 rounded-xl text-sm border"
                style={{ background: 'rgba(220,38,38,0.08)', color: '#fca5a5', borderColor: 'rgba(220,38,38,0.15)' }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isRegister && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--parchment)' }}>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm border transition-shadow"
                    style={{
                      background: 'var(--ink)',
                      borderColor: 'var(--line)',
                      color: 'var(--parchment)'
                    }}
                    placeholder="Enter your name"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--parchment)' }}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm border transition-shadow"
                  style={{
                    background: 'var(--ink)',
                    borderColor: 'var(--line)',
                    color: 'var(--parchment)'
                  }}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--parchment)' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm border transition-shadow"
                  style={{
                    background: 'var(--ink)',
                    borderColor: 'var(--line)',
                    color: 'var(--parchment)'
                  }}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--dim)' }}>Must be at least 6 characters</p>
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

          <p className="text-center text-xs mt-6" style={{ color: 'var(--dim)' }}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </main>
    </div>
  )
}
