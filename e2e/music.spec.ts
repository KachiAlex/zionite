import { test, expect } from '@playwright/test'

test.describe('Add Music Flow', () => {
  test('admin can add a track via external URL', async ({ page }) => {
    let musicTracks: any[] = []

    // Prevent service workers from interfering with Playwright route interception
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, writable: false })
    })

    await page.route('**/api/auth/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin-1', email: 'admin@zionite.online', name: 'Admin User', role: 'admin' }
        })
      })
    })

    await page.route('**/api/broadcasts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ broadcasts: [] }) })
    })

    await page.route('**/api/broadcasts/stats/overview', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, live: 0, ended: 0 }) })
    })

    await page.route('**/api/auth/users', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) })
    })

    await page.route('**/api/sermons', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sermons: [] }) })
    })

    await page.route(url => new URL(url).pathname === '/api/music/signature', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signature: 'fakesig',
          timestamp: 1234567890,
          apiKey: 'fakekey',
          cloudName: 'fakecloud',
          folder: 'zionite/music/audio',
          uploadUrl: 'https://api.cloudinary.com/v1_1/fakecloud/auto/upload'
        })
      })
    })

    await page.route('https://api.cloudinary.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://cloudinary.com/fake-file.mp3' })
      })
    })

    await page.route(url => new URL(url).pathname === '/api/music', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON()
        const id = `track-${Date.now()}`
        musicTracks.push({
          id,
          title: body.title || '',
          artist: body.artist || '',
          album: body.album || '',
          genre: body.genre || '',
          audio_url: body.audio_url || '',
          cover_url: body.cover_url || '',
          duration: parseInt(body.duration) || 0,
          lyrics: body.lyrics || '',
          file_format: '',
          file_size: 0,
          created_at: new Date().toISOString()
        })
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id, title: body.title }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ music: musicTracks }) })
      }
    })

    await page.route('**/api/prayer', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prayers: [] }) })
    })

    await page.route('**/api/analytics/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: { listenersOnline: 0, totalListenersToday: 0, sermonCount: 0, prayerCount: 0, totalDonations: 0 },
          platformBreakdown: [],
          recentSermons: [],
          pendingTestimonies: [],
          recentDonations: [],
          activeCampaigns: [],
          transcripts: [],
          listenerHistory: []
        })
      })
    })

    await page.route('**/api/chat/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [] }) })
    })

    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-admin-token')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', email: 'admin@zionite.online', name: 'Admin User', role: 'admin' }))
    })

    await page.goto('/admin')
    await expect(page.getByText(/welcome back/i)).toBeVisible()

    await page.getByRole('button', { name: /auto dj/i }).click()
    await expect(page.getByRole('heading', { name: /add music/i })).toBeVisible()

    await page.getByRole('button', { name: /external url/i }).click()

    await page.getByPlaceholder('Audio URL (e.g. CDN link)').fill('https://example.com/song.mp3')
    await page.getByPlaceholder('Title *').fill('Test Song')
    await page.getByPlaceholder('Artist').fill('Test Artist')
    await page.getByPlaceholder('Album').fill('Test Album')
    await page.locator('select').selectOption('Gospel')
    await page.getByPlaceholder('Duration (seconds)').fill('180')

    // Upload cover image via file picker
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mock image data')
    })

    await page.getByRole('button', { name: /add track/i }).click()

    await expect(page.getByText('Test Song')).toBeVisible()
    await expect(page.getByText('Test Artist')).toBeVisible()
    await expect(page.getByText('Test Album')).toBeVisible()
    await expect(page.getByText('3:00')).toBeVisible()
  })

  test('user can discover and play music from home and library', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, writable: false })
    })

    const mockTrack = {
      id: 'track-123',
      title: 'Amazing Grace',
      artist: 'Worship Team',
      album: 'Sunday Worship',
      genre: 'Gospel',
      audio_url: 'https://example.com/amazing-grace.mp3',
      cover_url: 'https://example.com/cover.jpg',
      duration: 240,
      lyrics: 'Amazing grace, how sweet the sound...'
    }

    await page.route(url => new URL(url).pathname === '/api/music', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ music: [mockTrack] }) })
    })

    await page.route('**/api/broadcasts/active', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ broadcast: null }) })
    })

    await page.route('**/api/sermons?limit=4', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sermons: [] }) })
    })

    await page.route('**/api/guest-speakers', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ speakers: [] }) })
    })

    await page.route('**/api/events', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) })
    })

    // Home page shows featured music
    await page.goto('/')
    await expect(page.getByText(/featured music/i)).toBeVisible()
    await expect(page.getByText('Amazing Grace')).toBeVisible()
    await expect(page.getByText('Worship Team')).toBeVisible()

    // Navigate to Music page via navbar
    await page.getByRole('link', { name: /music/i }).click()
    await expect(page.getByRole('heading', { name: /music library/i })).toBeVisible()
    await expect(page.getByText('Amazing Grace')).toBeVisible()

    // Click to play track
    await page.getByText('Amazing Grace').click()

    // Global MiniPlayer appears
    await expect(page.locator('.fixed.bottom-0').getByText('Amazing Grace')).toBeVisible()
    await expect(page.locator('.fixed.bottom-0').getByText('Worship Team')).toBeVisible()
  })

  test('admin can upload a track with cover image', async ({ page }) => {
    let musicTracks: any[] = []

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined, writable: false })
    })

    await page.route('**/api/auth/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin-1', email: 'admin@zionite.online', name: 'Admin User', role: 'admin' }
        })
      })
    })

    await page.route('**/api/broadcasts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ broadcasts: [] }) })
    })

    await page.route('**/api/broadcasts/stats/overview', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, live: 0, ended: 0 }) })
    })

    await page.route('**/api/auth/users', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) })
    })

    await page.route('**/api/sermons', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sermons: [] }) })
    })

    await page.route(url => new URL(url).pathname === '/api/music/signature', async (route) => {
      const folder = route.request().url().includes('covers') ? 'zionite/music/covers' : 'zionite/music/audio'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signature: 'fakesig',
          timestamp: 1234567890,
          apiKey: 'fakekey',
          cloudName: 'fakecloud',
          folder,
          uploadUrl: 'https://api.cloudinary.com/v1_1/fakecloud/auto/upload'
        })
      })
    })

    await page.route('https://api.cloudinary.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://cloudinary.com/fake-file.mp3' })
      })
    })

    await page.route(url => new URL(url).pathname === '/api/music', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON()
        const id = `track-${Date.now()}`
        musicTracks.push({
          id,
          title: body.title || '',
          artist: body.artist || '',
          album: body.album || '',
          genre: body.genre || '',
          audio_url: body.audio_url || '',
          cover_url: body.cover_url || '',
          duration: parseInt(body.duration) || 0,
          lyrics: body.lyrics || '',
          file_format: '',
          file_size: 0,
          created_at: new Date().toISOString()
        })
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id, title: body.title }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ music: musicTracks }) })
      }
    })

    await page.route('**/api/prayer', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prayers: [] }) })
    })

    await page.route('**/api/analytics/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: { listenersOnline: 0, totalListenersToday: 0, sermonCount: 0, prayerCount: 0, totalDonations: 0 },
          platformBreakdown: [],
          recentSermons: [],
          pendingTestimonies: [],
          recentDonations: [],
          activeCampaigns: [],
          transcripts: [],
          listenerHistory: []
        })
      })
    })

    await page.route('**/api/chat/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [] }) })
    })

    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-admin-token')
      localStorage.setItem('user', JSON.stringify({ id: 'admin-1', email: 'admin@zionite.online', name: 'Admin User', role: 'admin' }))
    })

    await page.goto('/admin')
    await expect(page.getByText(/welcome back/i)).toBeVisible()

    await page.getByRole('button', { name: /auto dj/i }).click()
    await expect(page.getByRole('heading', { name: /add music/i })).toBeVisible()

    // Ensure File Upload mode is selected
    await page.getByRole('button', { name: /file upload/i }).click()

    // Upload audio file
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'test-audio.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('mock audio data')
    })

    // Upload cover image
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: 'test-cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mock image data')
    })

    await page.getByPlaceholder('Title *').fill('Track With Cover')
    await page.getByPlaceholder('Artist').fill('Cover Artist')
    await page.getByPlaceholder('Album').fill('Cover Album')
    await page.locator('select').selectOption('Gospel')
    await page.getByPlaceholder('Duration (seconds)').fill('200')

    await page.getByRole('button', { name: /add track/i }).click()

    await expect(page.getByText('Track With Cover')).toBeVisible()
    await expect(page.getByText('Cover Artist')).toBeVisible()
    await expect(page.getByText('Cover Album')).toBeVisible()
  })
})
