import { expect, test, type Page } from '@playwright/test';

import { authFile } from './global-setup';

const API_URL = process.env.PLAYWRIGHT_API_URL || `http://localhost:${Number(process.env.API_PORT) || 3001}`;

test.use({ storageState: authFile('admin') });

/**
 * Same fixture pattern as import.spec.ts's createDraftAssessment — there's no UI to create an
 * assessment (only `POST /assessments`), so this fixture talks to the real API directly. It gets
 * its access token from the browser's own NextAuth session rather than logging in again, since the
 * login endpoint's 5/min throttle is shared across the whole suite.
 */
async function createDraftAssessment(page: Page): Promise<{ id: string; accessToken: string }> {
  const session = await (await page.request.get('/api/auth/session')).json();
  const accessToken: string = session.accessToken;

  const frameworksResponse = await fetch(`${API_URL}/api/v1/frameworks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const frameworks = await frameworksResponse.json();
  const nistFramework = frameworks.find((f: { slug: string }) => f.slug === 'nist-csf');

  const assessmentResponse = await fetch(`${API_URL}/api/v1/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      organisationId: session.organisationId,
      frameworkId: nistFramework.id,
      name: `E2E item details test ${Date.now()}`,
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

test.describe('Assessment item — extended details', () => {
  test('expands a question, records risk/owner/rationale, and persists them across reload', async ({ page }) => {
    const { id, accessToken } = await createDraftAssessment(page);

    try {
      await page.goto(`/assessments/${id}/items`);
      await expect(page.getByText(/questions answered/)).toBeVisible();

      // Collapsed by default — the extended fields shouldn't clutter the primary scoring flow.
      await expect(page.getByText('Risk Level')).toHaveCount(0);
      await page.getByRole('button', { name: 'Details' }).first().click();
      await expect(page.getByText('Risk Level')).toBeVisible();

      await page.locator('select').filter({ has: page.locator('option', { hasText: 'Critical' }) }).first().selectOption('HIGH');
      await expect(page.getByText('Saved').first()).toBeVisible();

      const ownerNameInput = page.locator('input[type="text"]').first();
      await ownerNameInput.fill('Jane Doe');
      await ownerNameInput.blur();

      const rationaleTextarea = page.locator('textarea').first();
      await rationaleTextarea.fill('Rationale recorded during assessment.');
      await rationaleTextarea.blur();
      await expect(page.getByText('Saved').first()).toBeVisible();

      await page.reload();
      await expect(page.getByText(/questions answered/)).toBeVisible();
      await page.getByRole('button', { name: 'Details' }).first().click();

      await expect(page.locator('select').filter({ has: page.locator('option', { hasText: 'Critical' }) }).first()).toHaveValue('HIGH');
      await expect(page.locator('input[type="text"]').first()).toHaveValue('Jane Doe');
      await expect(page.locator('textarea').first()).toHaveValue('Rationale recorded during assessment.');
    } finally {
      await deleteAssessment(id, accessToken);
    }
  });
});
