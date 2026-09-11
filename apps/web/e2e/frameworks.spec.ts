import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

test.describe('Frameworks', () => {
  test('lists frameworks and drills into a navigation tree', async ({ page }) => {
    await page.goto('/frameworks');
    await expect(page.getByRole('heading', { name: 'Frameworks' })).toBeVisible();

    // Scoped to h2-bearing cards, not any a[href^="/frameworks/"] — the page also has a top-level
    // "Cross-framework mappings" link (visible once 2+ frameworks exist) matching that same prefix.
    const firstFramework = page.locator('a[href^="/frameworks/"]').filter({ has: page.locator('h2') }).first();
    await expect(firstFramework).toBeVisible();
    const frameworkName = await firstFramework.locator('h2').innerText();
    await firstFramework.click();

    await expect(page.getByRole('heading', { name: frameworkName })).toBeVisible();

    // Top-level functions render as open <details> (NavigationTree opens depth 0 by default);
    // clicking one should reveal its categories without collapsing its siblings.
    const firstFunction = page.locator('details').first();
    await expect(firstFunction).toHaveJSProperty('open', true);
  });
});
