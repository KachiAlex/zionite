const CACHE_NAME = 'zionite-v6'
const STATIC_ASSETS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Navigation: network-first so users always get the latest index.html after a deploy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone))
          }
          return networkResponse
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => {
            if (cached) return cached
            return caches.match('/').then((fallback) => {
              if (fallback) return fallback
              return new Response('<!DOCTYPE html><html><body>Offline</body></html>', {
                headers: { 'Content-Type': 'text/html' }
              })
            })
          })
        })
    )
    return
  }

  // API calls: network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'Network error' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    )
    return
  }

  // Static assets (JS, CSS, images): cache first, stale-while-revalidate
  // Guard against caching HTML responses (happens when Vercel catch-all serves index.html for missing chunks)
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const offlineResponse = new Response('', { status: 404, statusText: 'Not found' })
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (!networkResponse) return cached || offlineResponse
            const contentType = networkResponse.headers.get('content-type') || ''
            if (networkResponse.status === 200 && networkResponse.type === 'basic' && !contentType.includes('text/html')) {
              const clone = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            }
            return networkResponse
          })
          .catch(() => cached || offlineResponse)
        return cached || fetchPromise
      })
    )
  }
})

// ── Push Notifications ─────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'ZioniteFM', body: 'New update from The Voice of Redemption', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'zionite-push',
      renotify: true,
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  )
})

// ── Keep-alive: respond to pings from the audio player so the SW stays active ──
self.addEventListener('message', (event) => {
  if (event.data === 'keepAlive') {
    event.source?.postMessage('alive')
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
