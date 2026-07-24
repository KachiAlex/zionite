import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Broadcast() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/admin')
  }, [navigate])

  return null
}
