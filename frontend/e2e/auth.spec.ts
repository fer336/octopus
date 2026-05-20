import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page is reachable and shows Google button',
    { tag: ['@critical', '@e2e', '@auth', '@AUTH-E2E-001'] },
    async ({ page }) => {
    await page.goto('/')
    // Should redirect to login or show login page
    await expect(page).toHaveURL(/#\/login|\/$/)
    const googleButton = page.getByRole('button', { name: /continuar con google/i })
    await expect(googleButton).toBeVisible({ timeout: 8_000 })
  })

  test('unauthenticated access to /sales redirects to login',
    { tag: ['@critical', '@e2e', '@auth', '@AUTH-E2E-002'] },
    async ({ page }) => {
    await page.goto('/#/sales')
    // Should land on login
    await expect(page).toHaveURL(/#\/login/, { timeout: 5_000 })
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
  })

  test('unauthenticated access to /settings redirects to login',
    { tag: ['@critical', '@e2e', '@auth', '@AUTH-E2E-003'] },
    async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page).toHaveURL(/#\/login/, { timeout: 5_000 })
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
  })
})
