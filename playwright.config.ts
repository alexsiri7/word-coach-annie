import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start a local Next.js server when not using a live BASE_URL
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npx next start -p 3001',
          url: 'http://localhost:3001',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
