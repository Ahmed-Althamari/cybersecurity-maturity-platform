import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.describe('Remediation Initiatives - read-only viewer', () => {
  test.use({ storageState: authFile('viewer') });

  test('cannot see a way to create an initiative', async ({ page }) => {
    await page.goto('/remediation-initiatives');
    await expect(page.getByRole('heading', { name: 'Remediation Initiatives' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Initiative' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate from Gaps' })).toHaveCount(0);
  });
});

test.describe('Remediation Initiatives - full lifecycle', () => {
  test.use({ storageState: authFile('admin') });

  test('creates, edits, and deletes an initiative', async ({ page }) => {
    const title = `E2E test initiative ${Date.now()}`;

    await page.goto('/remediation-initiatives');
    await page.getByRole('link', { name: 'New Initiative' }).click();
    await expect(page).toHaveURL(/\/remediation-initiatives\/new$/);

    await page.locator('#initiative-title').fill(title);
    await page.locator('#initiative-capability').fill('Identity & Access Management');
    await page.locator('#initiative-priority').selectOption('2');
    await page.locator('#initiative-owner').fill('Jane Doe');
    await page.getByRole('button', { name: 'Create Initiative' }).click();

    // Not waitForURL(/\/remediation-initiatives\/[^/]+$/) — that pattern also matches the current
    // /remediation-initiatives/new URL itself, so it can resolve before the real navigation
    // happens (see notifications.spec.ts for the same pitfall). The heading is the real signal.
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/remediation-initiatives\/[^/]+$/);

    await page.locator('#initiative-status').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    // Reload to confirm the status change was actually persisted server-side.
    await page.reload();
    await expect(page.locator('#initiative-status')).toHaveValue('IN_PROGRESS');

    await page.goto('/remediation-initiatives');
    await expect(page.getByText(title)).toBeVisible();

    await page.getByText(title).click();
    await expect(page.getByRole('button', { name: 'Delete Initiative' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Initiative' }).click();

    await page.waitForURL(/\/remediation-initiatives$/);
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('filters by status', async ({ page }) => {
    const title = `E2E filter initiative ${Date.now()}`;

    await page.goto('/remediation-initiatives/new');
    await page.locator('#initiative-title').fill(title);
    await page.getByRole('button', { name: 'Create Initiative' }).click();
    // Not waitForURL(/\/remediation-initiatives\/[^/]+$/) followed by an immediate page.url()
    // read — that pattern also matches the current /remediation-initiatives/new URL itself, so it
    // can resolve before the real client-side navigation happens and capture the wrong URL (see
    // notifications.spec.ts for the same pitfall). Wait for the detail page's own heading first,
    // then the URL is guaranteed to be the real one.
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
    const detailUrl = page.url();

    // A fresh initiative starts PLANNED, so it shows under that filter and not under COMPLETED.
    await page.goto('/remediation-initiatives?status=PLANNED');
    await expect(page.getByText(title)).toBeVisible();

    await page.goto('/remediation-initiatives?status=COMPLETED');
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto(detailUrl);
    await page.getByRole('button', { name: 'Delete Initiative' }).click();
    await page.waitForURL(/\/remediation-initiatives$/);
  });
});
