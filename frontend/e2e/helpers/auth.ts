import { Page } from '@playwright/test'

/**
 * Injects the same Zustand persisted auth shape used by the tenant app.
 * The token must be accepted by the backend — CI generates it with the test user script.
 */
export async function loginWithToken(page: Page, token: string) {
  await page.addInitScript((t) => {
    localStorage.setItem(
      'auth-storage:tenant',
      JSON.stringify({
        state: {
          accessToken: t,
          refreshToken: '',
          isAuthenticated: true,
          user: {
            id: 'ci-e2e-user',
            email: 'ci-e2e@octopustrack.test',
            name: 'CI E2E User',
            platform_role: 'tenant_user',
            membership_role: 'owner',
            module_permissions: {},
          },
        },
        version: 0,
      })
    )
  }, token)
}

/**
 * Clears auth state between tests.
 */
export async function logout(page: Page) {
  await page.evaluate(() => localStorage.clear())
}
