import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SearchOverlay from './SearchOverlay'
import { Search, Heart, Users, Menu, X, LayoutDashboard, LogOut, LogIn } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement>(null)

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
    { label: 'Home', path: '/' },
    { label: 'Live Radio', path: '/live' },
    { label: 'Sermons', path: '/archive' },
    { label: 'Music', path: '/music' },
    { label: 'Prayer Wall', path: '/prayer' },
    { label: 'Testimonies', path: '/testimonies' },
    { label: 'Events', path: '/events' },
    { label: 'About Us', path: '/about' },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-[rgba(243,238,228,0.08)] bg-[#14141a]/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="ZioniteFM Logo" className="w-9 h-9 rounded-xl object-cover" />
          <div className="leading-tight">
            <div className="text-sm font-medium text-white tracking-wide">ZIONITEFM</div>
            <div className="text-[9px] text-[#9c958a] tracking-widest uppercase">The Voice of Redemption</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navItems.map(item => {
            const active = location.pathname === item.path
            return (
              <Link key={item.label} to={item.path}
                className={`text-xs font-medium transition-colors ${active ? 'text-[#c9a227]' : 'text-[#9c958a] hover:text-white'}`}>
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center bg-[#1c1d24] rounded-full px-3 py-1.5 border border-[rgba(243,238,228,0.08)] text-[#9c958a] hover:text-white transition-colors"
          >
            <Search className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs">Search sermons, topics, speakers...</span>
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
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(243,238,228,0.04)]"
                      style={{ color: 'var(--parchment)' }}>
                      <LayoutDashboard className="w-4 h-4" style={{ color: 'var(--dim)' }} /> Dashboard
                    </Link>
                    <button onClick={() => { logout(); setAvatarOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(243,238,228,0.04)]"
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

          <button className="hidden md:flex items-center gap-1.5 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-medium px-4 py-1.5 rounded-full transition-colors">
            <Heart className="w-3.5 h-3.5" /> Donate
          </button>

          {/* Mobile menu toggle */}
          <button className="md:hidden text-[#9c958a]" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[rgba(243,238,228,0.08)] px-4 py-3 space-y-2" style={{ background: 'var(--ink-2)' }}>
          <button onClick={() => { setSearchOpen(true); setMenuOpen(false); }}
            className="flex items-center gap-2 text-sm py-2 text-[#9c958a] w-full text-left">
            <Search className="w-4 h-4" /> Search
          </button>
          {navItems.map(item => {
            const active = location.pathname === item.path
            return (
              <Link key={item.label} to={item.path} onClick={() => setMenuOpen(false)}
                className={`block text-sm py-2 ${active ? 'text-[#c9a227]' : 'text-[#9c958a]'}`}>
                {item.label}
              </Link>
            )
          })}
          {user && (
            <>
              <Link to={user.role==='admin' || user.role==='broadcaster' ? '/admin' : '/dashboard'} onClick={() => setMenuOpen(false)} className="block text-sm py-2 text-[#c9a227]">Dashboard</Link>
              <button onClick={() => { logout(); setMenuOpen(false); }} className="block text-sm py-2 text-[#c9a227]">Sign Out</button>
            </>
          )}
          {!user && (
            <Link to="/login" onClick={() => setMenuOpen(false)} className="block text-sm py-2 text-[#c9a227]">Sign In</Link>
          )}
        </div>
      )}
    </nav>
  )
}
