import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

/**
 * Assistant Notes (apps/api/src/assistant-notes) — short standing context saved from the AI
 * Assisted settings page, read back by the scheduled digest below when it writes its summary.
 */
test.describe('Assistant Notes', () => {
  test('adds a note, it persists across reload, then removes it', async ({ page }) => {
    const content = `E2E note ${Date.now()}`;

    await page.goto('/settings/ai');
    await expect(page.getByRole('heading', { name: 'Assistant Notes' })).toBeVisible();

    await page.getByPlaceholder('e.g. Board review is the first Monday of the quarter').fill(content);
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText(content)).toBeVisible();

    await page.reload();
    await expect(page.getByText(content)).toBeVisible();

    const row = page.locator('li').filter({ hasText: content });
    await row.getByLabel('Remove note').click();
    await expect(page.getByText(content)).toHaveCount(0);
  });
});

/**
 * The scheduled digest's manual trigger and history (apps/api/src/assistant-digest) — the
 * persisted counterpart to Notifications' live due-date view. Exercised via a real overdue risk
 * (same setup as notifications.spec.ts) rather than seeding a digest row directly, so this proves
 * the digest actually reads live due-date data. No LLM provider is configured for this tenant in
 * the e2e environment, so the summary is the deterministic templated fallback — asserting on it
 * doesn't depend on a real AI call succeeding.
 */
test.describe('Assistant Digest', () => {
  test('generating a digest on demand summarizes the current overdue risks and shows email status', async ({ page }) => {
    const title = `E2E digest risk ${Date.now()}`;
    const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await page.goto('/risks/new');
    await page.locator('#risk-title').fill(title);
    await page.locator('#risk-target-date').fill(overdueDate);
    await page.getByRole('button', { name: 'Create Risk' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const riskUrl = page.url();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'AI Digest' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate Digest Now' }).click();

    // The digest card is the outer bordered container holding both the "AI Digest" heading and
    // the summary text. It also contains a collapsed "earlier digests" history once more than one
    // digest exists for this organisation (accumulating across e2e runs), which repeats the same
    // badge text — `.first()` picks the newest digest's own copy, rendered before that history.
    const digestCard = page.locator('div.bg-slate-800').filter({ hasText: 'AI Digest' });
    await expect(digestCard.getByText(title, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(digestCard.getByText('Templated summary').first()).toBeVisible();
    await expect(digestCard.getByText('Not emailed').first()).toBeVisible();

    await page.goto(riskUrl);
    await page.getByRole('button', { name: 'Delete Risk' }).click();
    await page.waitForURL(/\/risks$/);
  });
});
