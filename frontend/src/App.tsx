import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import Broadcast from './pages/Broadcast'
import Archive from './pages/Archive'
import AdminDashboard from './pages/AdminDashboard'
import MemberDashboard from './pages/MemberDashboard'
import Status from './pages/Status'
import Live from './pages/Live'
import Music from './pages/Music'
import Podcasts from './pages/Podcasts'
import PrayerWall from './pages/PrayerWall'
import Events from './pages/Events'
import AboutUs from './pages/AboutUs'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/broadcast" element={<Broadcast />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/dashboard" element={<MemberDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/status" element={<Status />} />
            <Route path="/live" element={<Live />} />
            <Route path="/live/:broadcastId" element={<Live />} />
            <Route path="/music" element={<Music />} />
            <Route path="/podcasts" element={<Podcasts />} />
            <Route path="/prayer" element={<PrayerWall />} />
            <Route path="/events" element={<Events />} />
            <Route path="/about" element={<AboutUs />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
