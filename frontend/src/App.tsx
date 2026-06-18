import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import Broadcast from './pages/Broadcast'
import Archive from './pages/Archive'
import AdminDashboard from './pages/AdminDashboard'
import Status from './pages/Status'
import Live from './pages/Live'
import Music from './pages/Music'

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
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/status" element={<Status />} />
            <Route path="/live" element={<Live />} />
            <Route path="/live/:broadcastId" element={<Live />} />
            <Route path="/music" element={<Music />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
