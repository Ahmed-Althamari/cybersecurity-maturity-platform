import path from 'path';

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const API_PORT = Number(process.env.API_PORT) || 3001;

// Set only in this sandbox, where Chromium ships at a fixed path instead of via
// `playwright install` (see the environment notes) — undefined everywhere else,
// including real CI, which installs its own browser in a separate step.
const CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: CHROMIUM_EXECUTABLE_PATH ? { executablePath: CHROMIUM_EXECUTABLE_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : [
        {
          command: 'node dist/main',
          cwd: path.join(__dirname, '../api'),
          // Health checks unprefixed (main.ts excludes 'health' from the global api/v1 prefix
          // deliberately, for orchestrator probes) — a 2xx here is what tells Playwright to reuse
          // an already-running server instead of trying (and failing on EADDRINUSE) to start a
          // second one.
          url: `http://localhost:${API_PORT}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: 'npm run start',
          cwd: __dirname,
          url: `${BASE_URL}/auth/signin`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});
