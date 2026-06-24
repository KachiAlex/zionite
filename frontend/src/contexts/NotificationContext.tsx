import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { API_BASE } from '../lib/api'

interface NotificationContextType {
  pushEnabled: boolean
  pushSupported: boolean
  requestPush: () => Promise<void>
  disablePush: () => Promise<void>
  biometricSupported: boolean
  biometricRegistered: boolean
  registerBiometric: () => Promise<void>
  removeBiometric: (credId: string) => Promise<void>
  credentials: BiometricCred[]
  loadingPush: boolean
  loadingBiometric: boolean
}

interface BiometricCred {
  id: string
  credential_id: string
  device_name: string
  created_at: string
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function arrayBufferToBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [loadingPush, setLoadingPush] = useState(false)
  const [loadingBiometric, setLoadingBiometric] = useState(false)
  const [credentials, setCredentials] = useState<BiometricCred[]>([])
  const [biometricRegistered, setBiometricRegistered] = useState(false)

  const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  const biometricSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential

  useEffect(() => {
    if (!pushSupported) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setPushEnabled(!!sub)
    }).catch(() => {})
  }, [pushSupported])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !biometricSupported) return
    fetch(`${API_BASE}/api/auth/webauthn/credentials`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const creds = data.credentials || []
        setCredentials(creds)
        setBiometricRegistered(creds.length > 0)
      })
      .catch(() => {})
  }, [biometricSupported])

  async function requestPush() {
    if (!pushSupported) return
    setLoadingPush(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { alert('Notification permission denied.'); return }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const vapidKey = urlBase64ToUint8Array(
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
        )
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
      }

      const subJson = sub.toJSON()
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')
      const userId = userData ? JSON.parse(userData).id : undefined

      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: (subJson.keys as any)?.p256dh,
          auth: (subJson.keys as any)?.auth,
          user_id: userId
        })
      })
      setPushEnabled(true)
    } catch (e: any) {
      console.error('Push subscribe error:', e)
      alert(e.message || 'Failed to enable push notifications')
    } finally {
      setLoadingPush(false)
    }
  }

  async function disablePush() {
    if (!pushSupported) return
    setLoadingPush(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
    } catch (e: any) {
      console.error('Push unsubscribe error:', e)
    } finally {
      setLoadingPush(false)
    }
  }

  async function registerBiometric() {
    if (!biometricSupported) return
    setLoadingBiometric(true)
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null
      if (!user) { alert('You must be logged in to register biometrics.'); return }

      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const userId = new TextEncoder().encode(user.id)

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'ZioniteFM', id: window.location.hostname },
          user: { id: userId, name: user.email, displayName: user.name || user.email },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
          attestation: 'none'
        }
      }) as PublicKeyCredential

      if (!cred) { alert('Biometric registration cancelled.'); return }

      const response = cred.response as AuthenticatorAttestationResponse
      const publicKey = await arrayBufferToBase64(response.getPublicKey()!)
      const credentialId = await arrayBufferToBase64(cred.rawId)
      const deviceName = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')
        ? 'iPhone / iPad' : navigator.userAgent.includes('Android') ? 'Android Device' : 'This Device'

      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/auth/webauthn/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ credential_id: credentialId, public_key: publicKey, device_name: deviceName })
      })

      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Registration failed') }

      const newCred: BiometricCred = { id: credentialId, credential_id: credentialId, device_name: deviceName, created_at: new Date().toISOString() }
      setCredentials(prev => [...prev, newCred])
      setBiometricRegistered(true)
      alert('Biometric login registered successfully!')
    } catch (e: any) {
      console.error('Biometric register error:', e)
      if (e.name !== 'NotAllowedError') alert(e.message || 'Biometric registration failed')
    } finally {
      setLoadingBiometric(false)
    }
  }

  async function removeBiometric(credId: string) {
    setLoadingBiometric(true)
    try {
      const token = localStorage.getItem('token')
      await fetch(`${API_BASE}/api/auth/webauthn/credentials/${credId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const updated = credentials.filter(c => c.id !== credId)
      setCredentials(updated)
      setBiometricRegistered(updated.length > 0)
    } catch (e: any) {
      console.error('Remove biometric error:', e)
    } finally {
      setLoadingBiometric(false)
    }
  }

  return (
    <NotificationContext.Provider value={{
      pushEnabled, pushSupported, requestPush, disablePush,
      biometricSupported, biometricRegistered, registerBiometric, removeBiometric, credentials,
      loadingPush, loadingBiometric
    }}>
      {children}
    </NotificationContext.Provider>
  )
}
