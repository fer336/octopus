import { test, expect } from '@playwright/test'
import { loginWithToken } from './helpers/auth'

test.describe('ARCA / Electronic Billing settings — authenticated', () => {
  test.skip(!process.env.TEST_AUTH_TOKEN, 'Requires TEST_AUTH_TOKEN env var')

  test.beforeEach(async ({ page }) => {
    await loginWithToken(page, process.env.TEST_AUTH_TOKEN!)
  })

  test('settings page has Facturación Electrónica section', async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page.getByText(/facturación electrónica/i)).toBeVisible({ timeout: 8_000 })
  })

  test('electronic sale point input is present', async ({ page }) => {
    await page.goto('/#/settings')
    await expect(
      page.getByLabel(/punto de venta electrónico|electronic.*sale.*point/i)
        .or(page.getByPlaceholder(/0012/))
    ).toBeVisible({ timeout: 8_000 })
  })

  test('SRX-User toggle is present', async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page.getByText(/srx.?user/i)).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('ARCA settings — unauthenticated', () => {
  test('redirects to login',
    { tag: ['@critical', '@e2e', '@arca', '@ARCA-E2E-001'] },
    async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page).toHaveURL(/#\/login/, { timeout: 5_000 })
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
  })
})
