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
      const { data } = await axios.post(endpoint, payload)
      login(data.token, data.user)
      
      // Route to role-based dashboard
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
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-brand-50 flex flex-col">
      {/* Header */}
      <header className="container-custom py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-gray-600 mt-2">
              {isRegister ? 'Join Zionitefm to start broadcasting' : 'Sign in to your account'}
            </p>
          </div>

          {/* Form Card */}
          <div className="card p-8">
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isRegister && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                    placeholder="Enter your name"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
                <p className="text-xs text-gray-500 mt-2">Must be at least 6 characters</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3"
              >
                {isRegister ? <UserPlus className="w-5 h-5 mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
                {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-center text-sm text-gray-600">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  {isRegister ? 'Sign in' : 'Create one'}
                </button>
              </p>
            </div>
          </div>

          {/* Trust Indicators */}
          <p className="text-center text-xs text-gray-500 mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </main>
    </div>
  )
}
