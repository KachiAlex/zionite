import Navbar from './Navbar'
import MiniPlayer from './MiniPlayer'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <MiniPlayer />
    </>
  )
}
