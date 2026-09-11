import { expect, test, type Locator, type Page } from '@playwright/test';

import { authFile } from './global-setup';

const API_URL = process.env.PLAYWRIGHT_API_URL || `http://localhost:${Number(process.env.API_PORT) || 3001}`;

test.use({ storageState: authFile('admin') });

// selectOption's { label } match is an exact string, not a substring/regex — these selects render
// "CODE — full subcategory name", so match by locating the <option> with the code in its text.
async function selectOptionContaining(select: Locator, substring: string): Promise<void> {
  const optionTexts = await select.locator('option').allTextContents();
  const index = optionTexts.findIndex((text) => text.includes(substring));
  if (index === -1) {
    throw new Error(`No <option> containing "${substring}" (options: ${optionTexts.join(', ')})`);
  }
  await select.selectOption({ index });
}

/**
 * The crosswalk needs at least two frameworks loaded for a tenant, and this app has no UI to
 * import one (only `POST /frameworks/import`) — so, like import.spec.ts's draft-assessment
 * fixture, this talks to the real API directly to load a minimal second framework, then drives
 * the rest of the flow through the actual browser UI. Frameworks have no delete endpoint, so each
 * run's fixture is uniquely slugged rather than cleaned up afterward — matching how the app itself
 * treats frameworks as permanent tenant data.
 */
async function importTestFramework(page: Page): Promise<{ id: string; name: string }> {
  const session = await (await page.request.get('/api/auth/session')).json();
  const accessToken: string = session.accessToken;
  const suffix = Date.now();
  const name = `ISO 27001 E2E Fixture ${suffix}`;

  const response = await fetch(`${API_URL}/api/v1/frameworks/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      slug: `iso-27001-e2e-${suffix}`,
      name,
      version: '2022',
      frameworkType: 'ISO_27001',
      functions: [
        {
          code: 'A.5',
          name: 'Organizational Controls',
          categories: [
            {
              code: 'A.5.1',
              name: 'Policies for information security',
              subcategories: [{ code: 'A.5.1.1', name: 'Information security policy' }],
            },
          ],
        },
      ],
    }),
  });
  const framework = await response.json();
  return { id: framework.id, name };
}

test.describe('Cross-framework control mappings', () => {
  test('lets an admin compare two frameworks, add a mapping, and remove it', async ({ page }) => {
    const { name: targetFrameworkName } = await importTestFramework(page);

    await page.goto('/frameworks');
    await expect(page.getByRole('heading', { name: 'Frameworks' })).toBeVisible();
    // exact: true — a plain substring/regex match would also catch a framework card whose own
    // name or description happens to contain this phrase (the description text embeds the
    // literal words "cross-framework mappings"), since a card's whole blurb sits inside its <a>.
    const mappingsLink = page.getByRole('link', { name: 'Cross-framework mappings', exact: true });
    await expect(mappingsLink).toBeVisible();
    await mappingsLink.click();

    await expect(page.getByRole('heading', { name: 'Cross-Framework Mappings' })).toBeVisible();
    // Both selects, not just #target — the picker's default #source is whichever framework
    // sorts first alphabetically, which need not be NIST CSF once other fixtures exist (this
    // spec's own ISO fixture included, since "ISO..." < "NIST..." alphabetically).
    await page.locator('#source').selectOption({ label: 'NIST Cybersecurity Framework 2.0' });
    await page.locator('#target').selectOption({ label: targetFrameworkName });
    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(page.getByText('No mappings yet between these frameworks.')).toBeVisible();

    await page.getByRole('heading', { name: 'Add mapping' }).waitFor();
    // The "Add mapping" panel's selects aren't inside a <form> (the create is a client-side fetch,
    // no page reload) — scope to the panel via its heading instead of relying on form structure.
    const addPanel = page.locator('div').filter({ hasText: /^Add mapping/ }).last();
    await selectOptionContaining(addPanel.locator('select').nth(0), 'GV.OC-01');
    await addPanel.locator('select').nth(1).selectOption('EQUIVALENT');
    await selectOptionContaining(addPanel.locator('select').nth(2), 'A.5.1.1');
    await addPanel.getByRole('button', { name: 'Add mapping' }).click();

    await expect(page.getByText('No mappings yet between these frameworks.')).not.toBeVisible();
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('GV.OC-01');
    await expect(row).toContainText('EQUIVALENT');
    await expect(row).toContainText('A.5.1.1');

    await row.getByLabel('Remove mapping').click();
    await expect(page.getByText('No mappings yet between these frameworks.')).toBeVisible();
  });
});
