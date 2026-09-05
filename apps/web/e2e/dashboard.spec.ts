import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

test.describe('Dashboard', () => {
  test('shows the KPI cards and top-level navigation for a signed-in user', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Cybersecurity Maturity Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Risks' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assessments' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Frameworks' })).toBeVisible();
  });

  test('navigates to the risk register from the dashboard header', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Risks' }).click();
    await expect(page).toHaveURL(/\/risks$/);
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible();
  });

  test('signs out back to the sign-in page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/auth\/signin|\/$/);
  });
});
