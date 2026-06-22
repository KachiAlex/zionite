import { test, expect } from '@playwright/test'

test.describe('Music Flow', () => {
  test('music page displays tracks from API', async ({ page }) => {
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

    await page.route('**/api/music', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ music: [mockTrack] }) })
    })

    await page.goto('/music')
    await expect(page.getByRole('heading', { name: /music library/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Amazing Grace')).toBeVisible()
    await expect(page.getByText('Worship Team')).toBeVisible()
  })
})
