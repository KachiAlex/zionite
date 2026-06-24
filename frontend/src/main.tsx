import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// Keep all audio playing when app is backgrounded on Android / browser
function resumeAllAudioContexts() {
  const win = window as any
  if (win.__audioContexts) {
    win.__audioContexts.forEach((ctx: AudioContext) => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    })
  }
}

// Poll every 8s — Android WebView may suspend AudioContext silently;
// this keeps it alive whether the app is foregrounded or backgrounded.
setInterval(resumeAllAudioContexts, 8000)

// Also resume on visibility change (tab switch, screen lock, app switch)
document.addEventListener('visibilitychange', () => {
  resumeAllAudioContexts()
})

;(async () => {
  const isNative = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
  if (isNative) {
    try {
      const { App: CapApp } = await import('@capacitor/app')
      // isActive=true means app came back to foreground — resume any paused contexts
      // isActive=false means backgrounded — still attempt resume as Android may not
      // immediately suspend but we want to pre-emptively keep audio alive
      CapApp.addListener('appStateChange', ({ isActive: _ }) => {
        resumeAllAudioContexts()
      })
    } catch {}
  }
})()

// Sentry error tracking
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: 1 },
  },
})

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=5')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          // Only reload on update (existing SW active), not on first install
          if (!newWorker || !registration.active) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              // New build deployed — reload to get fresh assets
              window.location.reload()
            }
          })
        })
      })
      .catch(console.error)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
