import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

/**
 * The Data Analysis page's "ai" mode provider picker — lets the user pin one specific
 * UI-configured slot for a request instead of the default full fallback chain. Configures a
 * real slot through the settings panel (same as ai-settings.spec.ts), then intercepts the
 * actual /data-analysis/analyze request to confirm the picked slot is what's actually sent,
 * without making a real outbound call to a provider.
 */
test.describe('Data Analysis — provider slot picker', () => {
  test('lets the user pin a configured slot, and sends it with the request', async ({ page }) => {
    // Configure slot 2 via the real settings panel + API.
    await page.goto('/settings/ai');
    const slot2 = page.locator('div.bg-slate-800').filter({ hasText: 'Provider Slot 2' });
    await slot2.getByRole('button', { name: 'Configure' }).click();
    await slot2.locator('select').selectOption('openai');
    await slot2.getByPlaceholder('e.g. gpt-4.1').fill('llama-3.3-70b-versatile');
    await slot2.getByPlaceholder('https://openrouter.ai/api/v1').fill('https://api.groq.com/openai/v1');
    await slot2.getByPlaceholder('sk-...').fill('gsk-e2e-test-1234567890');
    await slot2.getByRole('button', { name: 'Save' }).click();
    await expect(slot2.getByText('Configured for this organisation')).toBeVisible();

    try {
      await page.goto('/data-analysis');
      await page.getByText('AI-Powered').click();

      // The picker only renders once a slot is actually configured — confirms this test's setup
      // above took effect, not just that the element exists unconditionally.
      const slotSelect = page.locator('#slot-input');
      await expect(slotSelect).toBeVisible();
      await expect(slotSelect.locator('option')).toHaveCount(2); // "Auto" + slot 2
      await slotSelect.selectOption('2');

      let capturedBody = '';
      await page.route('**/api/v1/data-analysis/analyze', async (route) => {
        capturedBody = (await route.request().postDataBuffer())?.toString('utf-8') ?? '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            mode: 'ai',
            rowCount: 1,
            columnCount: 1,
            columns: [],
            charts: [],
            answer: 'stubbed',
            table: null,
            error: null,
          }),
        });
      });

      await page.locator('input[type="file"]').setInputFiles({
        name: 'data.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('category,value\nA,1\n'),
      });
      await page.getByRole('button', { name: 'Analyze' }).click();

      await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
      // Multipart bodies separate fields with a boundary; the field's own value line is enough to
      // confirm "2" was sent as the slot, not just that the field name appears somewhere.
      expect(capturedBody).toMatch(/name="slot"\r?\n\r?\n2\r?\n/);
    } finally {
      // Clean up regardless of whether the assertions above passed.
      await page.goto('/settings/ai');
      const slot2Cleanup = page.locator('div.bg-slate-800').filter({ hasText: 'Provider Slot 2' });
      if (await slot2Cleanup.getByRole('button', { name: 'Remove' }).isVisible().catch(() => false)) {
        await slot2Cleanup.getByRole('button', { name: 'Remove' }).click();
      }
    }
  });
});
