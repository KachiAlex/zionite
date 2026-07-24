import { useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import MiniPlayer from './MiniPlayer'

const HIDE_NAVBAR_ROUTES = ['/dashboard', '/admin', '/super-admin', '/broadcast']

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const hideNavbar = HIDE_NAVBAR_ROUTES.some(route => location.pathname.startsWith(route))

  return (
    <>
      {!hideNavbar && <Navbar />}
      {children}
      <MiniPlayer />
    </>
  )
}
