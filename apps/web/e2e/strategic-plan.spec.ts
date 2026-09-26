import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.describe('Strategic Plan - read-only viewer', () => {
  test.use({ storageState: authFile('viewer') });

  test('cannot see a way to create an initiative', async ({ page }) => {
    await page.goto('/strategic-plan');
    await expect(page.getByRole('heading', { name: 'Strategic Plan' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Initiative' })).toHaveCount(0);
  });
});

test.describe('Strategic Plan - full lifecycle', () => {
  test.use({ storageState: authFile('admin') });

  test('creates an initiative, records monthly progress, adds a milestone, links a risk, and deletes it', async ({ page }) => {
    const title = `E2E strategic initiative ${Date.now()}`;

    await page.goto('/strategic-plan');
    await page.getByRole('link', { name: 'New Initiative' }).click();
    await expect(page).toHaveURL(/\/strategic-plan\/new$/);

    await page.locator('#initiative-title').fill(title);
    await page.locator('#initiative-objective').fill('Strengthen Vulnerability & Patch Management');
    await page.locator('#initiative-owner').fill('Jane Doe');
    await page.getByRole('button', { name: 'Create Initiative' }).click();

    // Not waitForURL(/\/strategic-plan\/[^/]+$/) — that pattern also matches the current
    // /strategic-plan/new URL itself, so it can resolve before the real navigation happens (see
    // import.spec.ts / remediation-initiatives.spec.ts for the same pitfall). The heading is the
    // real signal that the create actually finished and redirected.
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/strategic-plan\/[^/]+$/);
    // The initiative code (e.g. INIT-005) renders inline in the heading.
    await expect(page.getByText(/INIT-\d+/)).toBeVisible();

    // Record a monthly progress entry -- the initiative's cached percentComplete should update.
    await page.locator('#progress-month').fill('2026-03');
    await page.locator('#progress-percent').fill('35');
    await page.locator('#progress-note').fill('Kickoff complete, scoping underway.');
    // exact: true -- otherwise this also matches the basic-details form's "Save Changes" button.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('March 2026')).toBeVisible();
    await expect(page.getByText('35%').first()).toBeVisible();

    // Add a milestone.
    await page.locator('#milestone-title').fill('Complete vendor selection');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Complete vendor selection')).toBeVisible();

    // Link an existing risk (the seeded demo data has at least one open risk). The picker's
    // result list is the only ".max-h-48" container on this page (the risk-detail page's mirror
    // picker uses the same class, but that's a different page).
    await expect(page.locator('.max-h-48 button').first()).toBeVisible();
    await page.locator('.max-h-48 button').first().click();
    await page.getByRole('button', { name: 'Link' }).click();
    await expect(page.getByText('No risks linked yet.')).toHaveCount(0);

    // Reload to confirm everything actually persisted server-side, not just optimistic UI state.
    await page.reload();
    await expect(page.getByText('March 2026')).toBeVisible();
    await expect(page.getByText('Complete vendor selection')).toBeVisible();
    await expect(page.getByText('No risks linked yet.')).toHaveCount(0);

    await page.goto('/strategic-plan');
    await expect(page.getByText(title)).toBeVisible();

    await page.getByText(title).click();
    await expect(page.getByRole('button', { name: 'Delete Initiative' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Initiative' }).click();

    await page.waitForURL(/\/strategic-plan$/);
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('shows the executive dashboard KPIs', async ({ page }) => {
    await page.goto('/strategic-plan');
    await expect(page.getByText('Overall Progress')).toBeVisible();
    await expect(page.getByText('Total Initiatives')).toBeVisible();
    await expect(page.getByText('Linked to Risks')).toBeVisible();
  });
});
