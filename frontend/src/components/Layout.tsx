import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Radio, Archive, LayoutDashboard, Activity, LogIn, LogOut, Mic, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const isActive = (path: string) => location.pathname === path

  const navLinks = [
    { to: '/', label: 'Home', icon: Radio },
    { to: '/archive', label: 'Archive', icon: Archive },
    { to: '/status', label: 'Status', icon: Activity },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', icon: LayoutDashboard }] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="container-custom">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                <Radio className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
              </div>
              <span className="font-bold text-lg lg:text-xl text-gray-900">Zionitefm</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  {(user.role === 'broadcaster' || user.role === 'admin') && (
                    <Link
                      to="/broadcast"
                      className="btn-primary text-sm py-2 px-4"
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Go Live
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn-primary text-sm py-2 px-4">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="container-custom py-4 space-y-1">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive(to)
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
              <div className="pt-4 border-t border-gray-100 mt-4">
                {user ? (
                  <>
                    {(user.role === 'broadcaster' || user.role === 'admin') && (
                      <Link
                        to="/broadcast"
                        onClick={() => setMobileMenuOpen(false)}
                        className="btn-primary w-full justify-center text-sm py-3 mb-2"
                      >
                        <Mic className="w-4 h-4 mr-2" />
                        Go Live
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        handleLogout()
                        setMobileMenuOpen(false)
                      }}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="btn-primary w-full justify-center text-sm py-3"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="container-custom py-12 lg:py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                  <Radio className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg text-gray-900">Zionitefm</span>
              </div>
              <p className="text-gray-600 text-sm max-w-xs">
                A single-church, web-first live broadcasting platform purpose-built for sermon broadcasting and congregational engagement.
              </p>
            </div>

            {/* Platform Links */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Platform</h4>
              <ul className="space-y-2">
                <li><Link to="/" className="text-sm text-gray-600 hover:text-primary-600">Home</Link></li>
                <li><Link to="/archive" className="text-sm text-gray-600 hover:text-primary-600">Archive</Link></li>
                <li><Link to="/status" className="text-sm text-gray-600 hover:text-primary-600">Status</Link></li>
              </ul>
            </div>

            {/* Legal Links */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><span className="text-sm text-gray-600 hover:text-primary-600 cursor-pointer">Privacy Policy</span></li>
                <li><span className="text-sm text-gray-600 hover:text-primary-600 cursor-pointer">Terms of Service</span></li>
                <li><span className="text-sm text-gray-600 hover:text-primary-600 cursor-pointer">GDPR Compliance</span></li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-gray-200 mt-12 pt-8">
            <p className="text-center text-sm text-gray-500">
              © 2026 Zionitefm. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
