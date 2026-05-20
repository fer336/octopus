import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    // Linux headless — no Mac-specific flags needed
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },

  projects: [
    {
      name: 'chromium-linux',
      use: {
        ...devices['Desktop Chrome'],
        // Force Linux Chromium channel — not the Mac system browser
        channel: undefined,
      },
    },
  ],

  // Start the dev server before running E2E tests.
  // Linux/headless environments must not use Vite --open.
  webServer: {
    command: 'npx vite --config vite.config.ts --host --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
