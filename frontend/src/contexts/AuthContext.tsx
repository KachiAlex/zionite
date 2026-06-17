import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

interface User {
  id: string
  email: string
  name: string
  role: 'listener' | 'broadcaster' | 'admin'
}

interface AuthContextType {
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('token')
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        try {
          const { data } = await axios.get('/api/auth/verify')
          setUser(data.user)
          localStorage.setItem('user', JSON.stringify(data.user))
        } catch {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          delete axios.defaults.headers.common['Authorization']
        }
      }
      setLoading(false)
    }
    validateToken()
  }, [])

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
