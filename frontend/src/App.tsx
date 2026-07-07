import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AudioPlayerProvider } from './contexts/AudioPlayerContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import { NotificationProvider } from './contexts/NotificationContext'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

// Code-split pages for smaller initial bundle
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Broadcast = lazy(() => import('./pages/Broadcast'))
const Archive = lazy(() => import('./pages/Archive'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'))
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
const Donate = lazy(() => import('./pages/Donate'))
const Notifications = lazy(() => import('./pages/Notifications'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
      <div className="w-8 h-8 border-2 border-[#c9a227] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function DeepLinkHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    let remove: (() => void) | undefined
    const init = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const listener = await App.addListener('appUrlOpen', (event) => {
          try {
            const url = new URL(event.url)
            const path = url.pathname + url.search
            navigate(path)
          } catch (e) {
            console.error('[DEEP_LINK] invalid url', event.url, e)
          }
        })
        remove = listener.remove
      } catch (e) {
        // Capacitor not available (web)
      }
    }
    init()
    return () => remove?.()
  }, [navigate])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="/donate" element={<Donate />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['listener', 'admin', 'broadcaster', 'super_admin']}>
              <MemberDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin', 'broadcaster', 'super_admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/broadcast"
          element={
            <ProtectedRoute allowedRoles={['admin', 'broadcaster', 'super_admin']}>
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
          <NotificationProvider>
          <BrowserRouter>
            <DeepLinkHandler />
            <ErrorBoundary>
              <Layout>
                <Suspense fallback={<PageLoader />}>
                  <AnimatedRoutes />
                </Suspense>
              </Layout>
            </ErrorBoundary>
          </BrowserRouter>
          </NotificationProvider>
        </FavoritesProvider>
      </AudioPlayerProvider>
    </AuthProvider>
  )
}

export default App
