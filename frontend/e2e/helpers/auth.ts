import { Page } from '@playwright/test'

/**
 * Injects a fake JWT into localStorage so E2E tests can bypass Google OAuth.
 * The token must be accepted by the backend — use a test-only token.
 */
export async function loginWithToken(page: Page, token: string) {
  await page.addInitScript((t) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

/**
 * Clears auth state between tests.
 */
export async function logout(page: Page) {
  await page.evaluate(() => localStorage.clear())
}
