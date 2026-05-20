import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page is reachable and shows Google button', async ({ page }) => {
    await page.goto('/')
    // Should redirect to login or show login page
    await expect(page).toHaveURL(/\/(login|auth|$)/)
    const googleButton = page.getByRole('button', { name: /google/i })
      .or(page.getByText(/iniciar sesión/i))
      .or(page.getByText(/sign in/i))
    await expect(googleButton).toBeVisible({ timeout: 8_000 })
  })

  test('unauthenticated access to /sales redirects to login', async ({ page }) => {
    await page.goto('/sales')
    // Should land on login
    await expect(page).not.toHaveURL(/\/sales/, { timeout: 5_000 })
  })

  test('unauthenticated access to /settings redirects to login', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).not.toHaveURL(/\/settings/, { timeout: 5_000 })
  })
})
