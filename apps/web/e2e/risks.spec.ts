import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.describe('Risk register - read-only viewer', () => {
  test.use({ storageState: authFile('viewer') });

  test('cannot see a way to create a risk', async ({ page }) => {
    await page.goto('/risks');
    await expect(page.getByRole('heading', { name: 'Risk Register' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Risk' })).toHaveCount(0);
  });
});

test.describe('Risk register - full lifecycle', () => {
  test.use({ storageState: authFile('admin') });

  test('creates, edits, and deletes a risk', async ({ page }) => {
    const title = `E2E test risk ${Date.now()}`;

    await page.goto('/risks');
    await page.getByRole('link', { name: 'New Risk' }).click();
    await expect(page).toHaveURL(/\/risks\/new$/);

    await page.locator('#risk-title').fill(title);
    await page.locator('#risk-likelihood').selectOption('5');
    await page.locator('#risk-impact').selectOption('4');
    await page.getByRole('button', { name: 'Create Risk' }).click();

    // createRisk() navigates to the new risk's detail page on success.
    await page.waitForURL(/\/risks\/[^/]+$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(/Inherent risk score:\s*20/)).toBeVisible();

    await page.locator('#risk-status').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto('/risks');
    await expect(page.getByText(title)).toBeVisible();

    await page.getByText(title).click();
    await expect(page.getByRole('button', { name: 'Delete Risk' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Risk' }).click();

    await page.waitForURL(/\/risks$/);
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
