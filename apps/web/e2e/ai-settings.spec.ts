import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

/**
 * The "AI Assisted" settings panel — lets an admin configure the org's own LLM provider
 * credentials from the UI (apps/api/src/llm-settings) instead of only via server env vars.
 * Exercises save + remove against the real running API and Postgres; deliberately does not
 * exercise "Test" here (it makes a real outbound call to the configured provider).
 */
test.describe('AI Assisted settings panel', () => {
  test('lets an admin configure and then remove a provider slot', async ({ page }) => {
    await page.goto('/settings/ai');
    await expect(page.getByRole('heading', { name: 'AI Assisted Settings' })).toBeVisible();

    // `div.bg-slate-800` matches only the 5 card-level containers (one per slot), so filtering by
    // heading text here can't accidentally match a nested wrapper div the way a bare `div` would.
    const slot3 = page.locator('div.bg-slate-800').filter({ hasText: 'Provider Slot 3' });
    await expect(slot3.getByText('Not configured')).toBeVisible();

    await slot3.getByRole('button', { name: 'Configure' }).click();
    await slot3.locator('select').selectOption('anthropic');
    await slot3.getByPlaceholder('claude-opus-5').fill('claude-opus-5');
    await slot3.getByPlaceholder('sk-...').fill('sk-ant-e2e-test-1234567890');
    await slot3.getByRole('button', { name: 'Save' }).click();

    await expect(slot3.getByText('Configured for this organisation')).toBeVisible();
    await expect(slot3.getByText('••••7890')).toBeVisible();

    // Reload to confirm it was actually persisted server-side, not just local state.
    await page.reload();
    const slot3AfterReload = page.locator('div.bg-slate-800').filter({ hasText: 'Provider Slot 3' });
    await expect(slot3AfterReload.getByText('Configured for this organisation')).toBeVisible();

    await slot3AfterReload.getByRole('button', { name: 'Remove' }).click();
    await expect(slot3AfterReload.getByText('Not configured')).toBeVisible();
  });
});
