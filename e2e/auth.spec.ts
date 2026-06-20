import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('can navigate to login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  })

  test('shows validation error for empty fields', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid input|required/i)).toBeVisible()
  })

  test('can toggle to registration', async ({ page }) => {
    await page.goto('/login')
    await page.getByText(/create account/i).click()
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/zionite fm/i)).toBeVisible()
  })

  test('archive page loads', async ({ page }) => {
    await page.goto('/archive')
    await expect(page.getByRole('heading', { name: /sermons|archive/i })).toBeVisible()
  })
})
