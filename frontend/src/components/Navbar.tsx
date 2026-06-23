import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SearchOverlay from './SearchOverlay'
import { Search, Heart, Users, Menu, X, LayoutDashboard, LogOut, LogIn, Radio, BookOpen, Music, HandHeart, Calendar, Info } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement>(null)

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const navItems = [
    { label: 'Home', path: '/', icon: null },
    { label: 'Live Radio', path: '/live', icon: Radio },
    { label: 'Sermons', path: '/archive', icon: BookOpen },
    { label: 'Music', path: '/music', icon: Music },
    { label: 'Prayer Wall', path: '/prayer', icon: Heart },
    { label: 'Events', path: '/events', icon: Calendar },
    { label: 'About Us', path: '/about', icon: Info },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-[rgba(243,238,228,0.08)] bg-[#14141a]/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img src="/logo.png" alt="ZioniteFM Logo" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover" />
          <div className="leading-tight hidden sm:block">
            <div className="text-sm font-medium text-white tracking-wide">ZIONITEFM</div>
            <div className="text-[9px] text-[#9c958a] tracking-widest uppercase">The Voice of Redemption</div>
          </div>
        </Link>

        {/* Desktop nav — only at lg+ so tablets get hamburger */}
        <div className="hidden lg:flex items-center gap-5 flex-1 justify-center">
          {navItems.map(item => {
            const active = location.pathname === item.path
            return (
              <Link key={item.label} to={item.path}
                className={`text-xs font-medium transition-colors whitespace-nowrap ${active ? 'text-[#c9a227]' : 'text-[#9c958a] hover:text-white'}`}>
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search — desktop only */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden lg:flex items-center bg-[#1c1d24] rounded-full px-3 py-1.5 border border-[rgba(243,238,228,0.08)] text-[#9c958a] hover:text-white transition-colors"
          >
            <Search className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs whitespace-nowrap">Search...</span>
          </button>
          {/* Search icon — tablet/mobile */}
          <button onClick={() => setSearchOpen(true)} className="lg:hidden p-2 text-[#9c958a] hover:text-white transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

          {/* Avatar dropdown */}
          <div ref={avatarRef} className="relative">
            <button onClick={() => setAvatarOpen(!avatarOpen)}
              className="w-8 h-8 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] text-xs font-bold hover:bg-[#e0bd5a] transition-colors">
              {user ? user.name?.[0]?.toUpperCase() || 'A' : <Users className="w-4 h-4" />}
            </button>

            {avatarOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden shadow-xl"
                style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
                {user ? (
                  <>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>{user.email}</p>
                      <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                        style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)' }}>{user.role}</span>
                    </div>
                    <Link to={user.role==='admin' || user.role==='broadcaster' ? '/admin' : '/dashboard'} onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-[rgba(243,238,228,0.04)]"
                      style={{ color: 'var(--parchment)' }}>
                      <LayoutDashboard className="w-4 h-4" style={{ color: 'var(--dim)' }} /> Dashboard
                    </Link>
                    <button onClick={() => { logout(); setAvatarOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-[rgba(243,238,228,0.04)]"
                      style={{ color: 'var(--parchment)' }}>
                      <LogOut className="w-4 h-4" style={{ color: 'var(--dim)' }} /> Sign Out
                    </button>
                  </>
                ) : (
                  <Link to="/login" onClick={() => setAvatarOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-[rgba(243,238,228,0.04)]"
                    style={{ color: 'var(--parchment)' }}>
                    <LogIn className="w-4 h-4" style={{ color: 'var(--dim)' }} /> Sign In
                  </Link>
                )}
              </div>
            )}
          </div>

          <button className="hidden lg:flex items-center gap-1.5 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium px-4 py-1.5 rounded-full transition-colors">
            <HandHeart className="w-3.5 h-3.5" /> Donate
          </button>

          {/* Hamburger — tablet & mobile (< lg) */}
          <button className="lg:hidden p-2 text-[#9c958a] hover:text-white transition-colors" onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet slide-down menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-[rgba(243,238,228,0.08)]" style={{ background: 'var(--ink-2)' }}>
          {/* Search row */}
          <div className="px-4 pt-3 pb-2">
            <button onClick={() => { setSearchOpen(true); setMenuOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-[#9c958a] bg-[rgba(243,238,228,0.04)] border border-[rgba(243,238,228,0.06)]">
              <Search className="w-4 h-4" /> Search sermons, topics, speakers...
            </button>
          </div>
          {/* Nav links */}
          <div className="px-4 pb-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {navItems.map(item => {
              const active = location.pathname === item.path
              const Icon = item.icon
              return (
                <Link key={item.label} to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-[rgba(201,162,39,0.12)] text-[#c9a227]' : 'text-[#9c958a] hover:text-white hover:bg-[rgba(243,238,228,0.04)]'}`}>
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  {item.label}
                </Link>
              )
            })}
          </div>
          {/* Auth + Donate */}
          <div className="px-4 pb-4 pt-1 flex flex-col sm:flex-row gap-2 border-t border-[rgba(243,238,228,0.06)] mt-1">
            {user ? (
              <>
                <Link to={user.role==='admin' || user.role==='broadcaster' ? '/admin' : '/dashboard'}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[rgba(243,238,228,0.06)] text-white">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <button onClick={() => { logout(); setMenuOpen(false) }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[rgba(243,238,228,0.06)] text-[#9c958a]">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </>
            ) : (
              <Link to="/login"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[rgba(243,238,228,0.06)] text-white">
                <LogIn className="w-4 h-4" /> Sign In
              </Link>
            )}
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-[#c9a227] text-[#1b1208]">
              <HandHeart className="w-4 h-4" /> Donate
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
