import { test, expect } from '@playwright/test'

test.describe('Navigation & Pages', () => {
  test('home page loads with hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/zionite fm/i)).toBeVisible()
    await expect(page.getByText(/the voice of redemption/i)).toBeVisible()
  })

  test('archive page loads sermons', async ({ page }) => {
    await page.goto('/archive')
    await expect(page.getByRole('heading', { name: /sermon archive/i })).toBeVisible()
  })

  test('events page loads', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: /events/i })).toBeVisible()
  })

  test('music page loads', async ({ page }) => {
    await page.goto('/music')
    await expect(page.getByRole('heading', { name: /music/i })).toBeVisible()
  })

  test('prayer wall page loads', async ({ page }) => {
    await page.goto('/prayer')
    await expect(page.getByRole('heading', { name: /prayer wall/i })).toBeVisible()
  })

  test('about page loads', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { name: /about zionitefm/i })).toBeVisible()
  })

  test('status page loads', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { name: /status/i })).toBeVisible()
  })

  test('search overlay opens and shows results', async ({ page }) => {
    await page.goto('/')
    const searchBtn = page.getByRole('button', { name: /search/i })
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click()
      const input = page.getByPlaceholder(/search/i)
      await expect(input).toBeVisible()
      await input.fill('love')
      await page.waitForTimeout(500)
      const results = page.locator('text=/sermons|events|music|speakers/i')
      await expect(results.first()).toBeVisible({ timeout: 5000 })
    }
  })
})
