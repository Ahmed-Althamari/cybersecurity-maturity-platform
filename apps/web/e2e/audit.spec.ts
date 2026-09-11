import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

/**
 * The audit log page (apps/api/src/audit already records every action — this is purely the UI
 * to view it). Every test run's own sign-in (see global-setup.ts) already produces a real
 * LOGIN/User audit event, so filtering for that is a reliable way to assert real rows render
 * without this spec needing to trigger a fresh action itself.
 */
test.describe('Audit log', () => {
  test.use({ storageState: authFile('admin') });

  test('an authorised admin can filter to see their own sign-in recorded', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();

    await page.locator('#action').selectOption('LOGIN');
    await page.getByRole('button', { name: 'Filter' }).click();

    await expect(page.locator('table')).toBeVisible();
    const rows = page.locator('tbody tr');
    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();
    // The description column's auto-generated text also contains the word "LOGIN" (e.g. "LOGIN
    // User <id>"), so a plain row-wide getByText('LOGIN') is ambiguous — target the action badge
    // and the resource column specifically instead.
    await expect(firstRow.locator('td').nth(2).getByText('LOGIN', { exact: true })).toBeVisible();
    await expect(firstRow.locator('td').nth(3)).toContainText('User');
  });
});

test.describe('Audit log — unauthorised role', () => {
  test.use({ storageState: authFile('viewer') });

  test('a read-only viewer sees an access-denied state, not the log', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
    await expect(page.getByText("You don't have access to the audit log.")).toBeVisible();
    await expect(page.locator('table')).not.toBeVisible();
  });
});
