import { defineConfig, devices } from '@playwright/test';

/**
 * Real E2E suite against the actual running stack (Next.js + NestJS API +
 * Postgres) -- nothing here is mocked. Requires a seeded local database
 * (see packages/database/prisma/seed.ts / `npm run db:seed`) and both dev
 * servers reachable at their default ports; `webServer` below will start
 * them itself if they aren't already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  // Sequential real logins against a single dev-mode Next.js/NestJS process
  // in a resource-constrained sandbox can occasionally stall waiting on
  // session hydration; one retry absorbs that without masking a real
  // regression (a genuine break fails both the first try and the retry).
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Only override the browser binary when explicitly told to (e.g. a
        // sandbox with a pre-installed Chromium at a fixed path); otherwise
        // leave it unset so Playwright resolves its own managed browser --
        // hardcoding a fallback path here broke CI, which has no such path
        // and installs Chromium via `playwright install` into the default
        // cache location instead.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../api',
      url: 'http://localhost:3001/api/v1/frameworks',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
