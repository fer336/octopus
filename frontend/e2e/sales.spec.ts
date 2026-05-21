import { test, expect } from '@playwright/test'
import { loginWithToken } from './helpers/auth'

/**
 * Sales E2E tests.
 * These run against the real dev server + backend.
 * Most flows require authentication — unauthenticated cases are tested here.
 * Authenticated flows need TEST_AUTH_TOKEN env var set.
 */

test.describe('Sales page — unauthenticated', () => {
  test('redirects to login when not authenticated',
    { tag: ['@critical', '@e2e', '@sales', '@SALES-E2E-001'] },
    async ({ page }) => {
    await page.goto('/#/sales')
    await expect(page).toHaveURL(/#\/login/, { timeout: 5_000 })
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
  })
})

test.describe('Sales page — authenticated', () => {
  test.skip(!process.env.TEST_AUTH_TOKEN, 'Requires TEST_AUTH_TOKEN env var')

  test.beforeEach(async ({ page }) => {
    await loginWithToken(page, process.env.TEST_AUTH_TOKEN!)
  })

  test('shows sales page title', async ({ page }) => {
    await page.goto('/#/sales')
    await expect(page.getByRole('heading', { name: /venta|ventas|nueva venta/i }))
      .toBeVisible({ timeout: 8_000 })
  })

  test('mobile view shows bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/sales')
    // Bottom nav tabs: productos, resumen
    await expect(page.getByRole('tab', { name: /productos/i }).or(
      page.getByText(/productos/i)
    )).toBeVisible({ timeout: 8_000 })
  })

  test('desktop view shows product search input', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/#/sales')
    await expect(page.locator('[data-tour-sales-product-search]')).toBeVisible({ timeout: 8_000 })
  })

  test('SRX badge not visible by default', async ({ page }) => {
    await page.goto('/#/sales')
    await expect(page.getByText('SRX')).not.toBeVisible()
  })

  test('voucher type selector shows available types', async ({ page }) => {
    await page.goto('/#/sales')
    // At minimum Cotización and Factura B should be available as buttons
    const voucherTypes = page.locator('[data-tour-sales-voucher-types]')
    await expect(voucherTypes).toBeVisible({ timeout: 8_000 })
    await expect(voucherTypes.getByRole('button', { name: /cotización/i })).toBeVisible()
    await expect(voucherTypes.getByRole('button', { name: /factura/i })).toBeVisible()
  })
})
