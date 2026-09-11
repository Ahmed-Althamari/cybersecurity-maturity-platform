import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

/**
 * The AI usage guardrail's UI on the settings page — set/view/clear a daily call cap shared
 * across the import wizard's suggestions and Data Analysis's "ai" mode (apps/api/src/llm-settings
 * getUsageSummary/setUsageLimit). Enforcement itself is covered by the backend unit tests and was
 * verified live against a real Anthropic call during development; this exercises the UI round trip.
 */
test.describe('AI usage limit', () => {
  test('lets an admin set a daily limit, see it reflected, then clear it back to unlimited', async ({ page }) => {
    await page.goto('/settings/ai');
    await expect(page.getByRole('heading', { name: 'Usage Today' })).toBeVisible();
    await expect(page.getByText('No daily limit is set — unlimited.')).toBeVisible();

    try {
      await page.locator('#daily-limit-input').fill('25');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('/ 25 AI-assisted calls today')).toBeVisible();
      await expect(page.getByText('No daily limit is set — unlimited.')).not.toBeVisible();

      // Reload to confirm it was actually persisted server-side, not just local state.
      await page.reload();
      await expect(page.getByText('/ 25 AI-assisted calls today')).toBeVisible();
    } finally {
      await page.locator('#daily-limit-input').fill('');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('No daily limit is set — unlimited.')).toBeVisible();
    }
  });
});
