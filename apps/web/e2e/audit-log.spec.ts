import { test, expect } from '@playwright/test';

const CISO_EMAIL = 'ciso@example.local';
const CISO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';

async function login(page: import('@playwright/test').Page, email = CISO_EMAIL) {
  await page.goto('/auth/signin');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', CISO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/assessments', { timeout: 15_000 });
  // The session cookie is set before this redirect fires, but NextAuth's
  // client-side session hydration on the *next* page needs a beat -- wait
  // for the page to actually render authenticated content (not just the
  // URL to change) before navigating away, or a following hard navigation
  // can render before the session confirms and get redirected to sign-in.
  await page.getByText('Sign Out').waitFor({ timeout: 15_000 });
}

test.describe('Audit log end-to-end', () => {
  test('login produces a LOGIN audit event visible on the audit dashboard', async ({ page }) => {
    await login(page);

    await page.goto('/audit');
    await expect(page.getByText('Audit Log')).toBeVisible();
    await expect(page.getByText('Total Events')).toBeVisible();
    await expect(page.getByText('LOGIN').first()).toBeVisible();
  });

  test('creating a risk produces a CREATE audit event', async ({ page }) => {
    await login(page);

    await page.goto('/risks/new');
    await page.fill('label:has-text("Title") + input', `E2E audit-verification risk ${Date.now()}`);
    await page.click('button[type="submit"]');
    await page.waitForResponse((res) => res.url().includes('/api/v1/risks') && res.request().method() === 'POST');

    await page.goto('/audit');
    await expect(page.getByText('CREATE').first()).toBeVisible();
    await expect(page.locator('td', { hasText: 'Risks' }).first()).toBeVisible();
  });

  test('a non-privileged role sees a friendly permission message, not raw data', async ({ page }) => {
    await login(page, 'viewer@example.local');

    await page.goto('/audit');
    await expect(page.getByText("You don't have permission to view the audit log.")).toBeVisible();
  });
});
