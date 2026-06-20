import { test, expect } from '@playwright/test'

test.describe('Add Music Flow', () => {
  test('admin can add a track via external URL', async ({ page }) => {
    let musicTracks: any[] = []

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

    await page.route('**/api/music', async (route) => {
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
          stats: { listenersOnline: 0, totalListenersToday: 0, sermonCount: 0, podcastCount: 0, prayerCount: 0, totalDonations: 0 },
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
    await page.getByPlaceholder('Genre').fill('Gospel')
    await page.getByPlaceholder('Duration (seconds)').fill('180')

    await page.getByRole('button', { name: /add track/i }).click()

    await expect(page.getByText('Test Song')).toBeVisible()
    await expect(page.getByText('Test Artist')).toBeVisible()
    await expect(page.getByText('Test Album')).toBeVisible()
    await expect(page.getByText('3:00')).toBeVisible()
  })
})
