import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

type Role = 'admin' | 'broadcaster' | 'listener'

interface Props {
  children: React.ReactNode
  allowedRoles?: Role[]
  fallback?: string
}

export default function ProtectedRoute({ children, allowedRoles, fallback = '/login' }: Props) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-8 h-8 border-2 border-[#c9a227] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={fallback} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
    // Redirect based on role
    if (user.role === 'admin' || user.role === 'broadcaster') {
      return <Navigate to="/admin" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
