import path from 'path';

import { chromium, type FullConfig } from '@playwright/test';

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';
const CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;

// One authenticated storage state per role, saved to e2e/.auth/<role>.json and reused by
// `test.use({ storageState: ... })` across spec files — signing in through the real
// credentials -> NextAuth -> API round trip once per role here is much faster (and no less
// real) than repeating that round trip in every single test.
export const DEMO_USERS = {
  admin: 'admin@example.local',
  ciso: 'ciso@example.local',
  viewer: 'viewer@example.local',
} as const;

export function authFile(role: keyof typeof DEMO_USERS): string {
  return path.join(__dirname, '.auth', `${role}.json`);
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL as string;
  const browser = await chromium.launch(
    CHROMIUM_EXECUTABLE_PATH ? { executablePath: CHROMIUM_EXECUTABLE_PATH } : undefined,
  );

  try {
    for (const [role, email] of Object.entries(DEMO_USERS) as [keyof typeof DEMO_USERS, string][]) {
      const page = await browser.newPage({ baseURL });
      await page.goto('/auth/signin');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(DEMO_PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      await page.context().storageState({ path: authFile(role) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
