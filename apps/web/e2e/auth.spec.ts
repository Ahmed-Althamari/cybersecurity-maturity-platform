import { expect, test } from '@playwright/test';

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoPassword123!';

// Deliberately no storageState here — this spec exercises the sign-in flow itself, which every
// other spec's global-setup shortcuts past.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sign in', () => {
  test('rejects invalid credentials with an inline error, not a crash', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel('Email').fill('nobody@example.local');
    await page.getByLabel('Password').fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('signs in with valid credentials and reaches the dashboard', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel('Email').fill('admin@example.local');
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: 'Cybersecurity Maturity Dashboard' })).toBeVisible();
  });

  test('an unauthenticated visitor is redirected to sign in from a protected page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
