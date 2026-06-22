import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AudioPlayerProvider } from './contexts/AudioPlayerContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

// Code-split pages for smaller initial bundle
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Broadcast = lazy(() => import('./pages/Broadcast'))
const Archive = lazy(() => import('./pages/Archive'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'))
const Status = lazy(() => import('./pages/Status'))
const Live = lazy(() => import('./pages/Live'))
const Music = lazy(() => import('./pages/Music'))
const SermonDetail = lazy(() => import('./pages/SermonDetail'))
const PrayerWall = lazy(() => import('./pages/PrayerWall'))
const Testimonies = lazy(() => import('./pages/Testimonies'))
const Events = lazy(() => import('./pages/Events'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const AboutUs = lazy(() => import('./pages/AboutUs'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
      <div className="w-8 h-8 border-2 border-[#c9a227] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/sermons/:id" element={<SermonDetail />} />
        <Route path="/status" element={<Status />} />
        <Route path="/live" element={<Live />} />
        <Route path="/live/:broadcastId" element={<Live />} />
        <Route path="/music" element={<Music />} />
        <Route path="/prayer" element={<PrayerWall />} />
        <Route path="/testimonies" element={<Testimonies />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/about" element={<AboutUs />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['listener', 'admin', 'broadcaster']}>
              <MemberDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin', 'broadcaster']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/broadcast"
          element={
            <ProtectedRoute allowedRoles={['admin', 'broadcaster']}>
              <Broadcast />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AudioPlayerProvider>
        <FavoritesProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Layout>
                <Suspense fallback={<PageLoader />}>
                  <AnimatedRoutes />
                </Suspense>
              </Layout>
            </ErrorBoundary>
          </BrowserRouter>
        </FavoritesProvider>
      </AudioPlayerProvider>
    </AuthProvider>
  )
}

export default App
