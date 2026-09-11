import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

/**
 * The notifications page (apps/api/src/notifications) — a live, computed view of open risks and
 * active remediation initiatives whose due date is overdue or within 14 days. Exercised through
 * the real Risk create/edit UI (which this feature also added a Target Date field to) rather than
 * seeding via the API directly, since that's how a real user would put a risk on this list.
 */
test.describe('Notifications', () => {
  test('shows a risk with an overdue target date, then it disappears once closed', async ({ page }) => {
    const title = `E2E overdue risk ${Date.now()}`;
    const overdueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await page.goto('/risks/new');
    await page.locator('#risk-title').fill(title);
    await page.locator('#risk-target-date').fill(overdueDate);
    await page.getByRole('button', { name: 'Create Risk' }).click();
    // Not waitForURL(/\/risks\/[^/]+$/) followed by an immediate page.url() read — that pattern
    // also matches the current /risks/new URL itself, so it can resolve before the real
    // client-side navigation happens and capture the wrong URL. Wait for the detail page's own
    // heading first (as risks.spec.ts does), then the URL is guaranteed to be the real one.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const riskUrl = page.url();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Overdue \(\d+\)/ })).toBeVisible();
    // Risk alert rows render as a <Link> (an <a>), not a <div> — unlike remediation initiative
    // rows, which have no detail page to link to and render as plain non-clickable divs.
    const row = page.locator('a').filter({ hasText: title });
    await expect(row).toContainText('overdue');

    // Closing the risk should take it out of the due-date list — a closed risk isn't actionable.
    await page.goto(riskUrl);
    await page.locator('#risk-status').selectOption('CLOSED');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto('/notifications');
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto(riskUrl);
    await page.getByRole('button', { name: 'Delete Risk' }).click();
    await page.waitForURL(/\/risks$/);
  });

  test('a risk with no target date, or one far in the future, does not appear', async ({ page }) => {
    const title = `E2E far-future risk ${Date.now()}`;
    const farDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await page.goto('/risks/new');
    await page.locator('#risk-title').fill(title);
    await page.locator('#risk-target-date').fill(farDate);
    await page.getByRole('button', { name: 'Create Risk' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const riskUrl = page.url();

    await page.goto('/notifications');
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto(riskUrl);
    await page.getByRole('button', { name: 'Delete Risk' }).click();
    await page.waitForURL(/\/risks$/);
  });
});
