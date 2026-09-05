import { expect, test, type Page } from '@playwright/test';

import { authFile } from './global-setup';

const API_URL = process.env.PLAYWRIGHT_API_URL || `http://localhost:${Number(process.env.API_PORT) || 3001}`;

test.use({ storageState: authFile('admin') });

/**
 * The import wizard's preview/mapping-review step needs a DRAFT/IN_PROGRESS assessment, and this
 * app has no UI to create one (only `POST /assessments`) — so this fixture talks to the real API
 * directly, the same way apps/api's own e2e specs create their fixtures, then drives the rest of
 * the flow through the actual browser UI. It gets its access token from NextAuth's own
 * `/api/auth/session` endpoint (which `page.request` calls with the browser context's existing
 * session cookie) rather than logging in again — the login endpoint's real 5/min throttle is
 * shared across every spec in this suite, and global-setup + auth.spec.ts already spend all 5.
 */
async function createDraftAssessment(page: Page): Promise<{ id: string; accessToken: string }> {
  const session = await (await page.request.get('/api/auth/session')).json();
  const accessToken: string = session.accessToken;

  const frameworksResponse = await fetch(`${API_URL}/api/v1/frameworks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const frameworks = await frameworksResponse.json();

  const assessmentResponse = await fetch(`${API_URL}/api/v1/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      organisationId: session.organisationId,
      frameworkId: frameworks[0].id,
      name: `E2E import test ${Date.now()}`,
    }),
  });
  const assessment = await assessmentResponse.json();
  return { id: assessment.id, accessToken };
}

async function deleteAssessment(id: string, accessToken: string): Promise<void> {
  await fetch(`${API_URL}/api/v1/assessments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

test.describe('Import wizard', () => {
  test('previews a mapping, lets it be confirmed, and imports the matching row', async ({ page }) => {
    const { id, accessToken } = await createDraftAssessment(page);

    try {
      await page.goto(`/assessments/${id}/import`);
      await expect(page.getByRole('heading', { name: 'Import from Excel/CSV' })).toBeVisible();

      const csv = ['Control_ID,Current_Maturity', 'GV.OC-01,DEVELOPING', 'GV.UNKNOWN-99,DEVELOPING'].join('\n');
      await page.locator('input[type="file"]').setInputFiles({
        name: 'assessment.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf-8'),
      });
      await page.getByRole('button', { name: 'Preview Import' }).click();

      await expect(page.getByRole('heading', { name: 'Review Column Mapping' })).toBeVisible();
      // Both Control_ID and Current_Maturity match by exact canonical name, so auto-mapping alone
      // resolves them — the mapping-review table should show that pairing already selected.
      await expect(page.locator('#mapping-Control_ID')).toHaveValue('Control_ID');
      await expect(page.locator('#mapping-Current_Maturity')).toHaveValue('Current_Maturity');
      await expect(page.getByText(/2 rows found/)).toBeVisible();

      await page.getByRole('button', { name: 'Confirm & Import' }).click();

      await expect(page.getByRole('heading', { name: 'Import Results' })).toBeVisible();
      // The "Imported" KPI value is the only one styled text-green-500 in this component.
      await expect(page.locator('p.text-green-500')).toHaveText('1');
    } finally {
      await deleteAssessment(id, accessToken);
    }
  });
});
