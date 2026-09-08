import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

import { authFile } from './global-setup';

const API_URL = process.env.PLAYWRIGHT_API_URL || `http://localhost:${Number(process.env.API_PORT) || 3001}`;

test.use({ storageState: authFile('admin') });

/** Same fixture pattern as import.spec.ts — this app has no UI to create a bare assessment. */
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
      name: `E2E multi-sheet import test ${Date.now()}`,
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

/** A workbook with a decoy cover-sheet tab first and the real assessment data second, matching
 * the kind of multi-tab export a real tool produces. GV.OC-01/GV.OC-02 are real seeded NIST CSF
 * subcategory codes. */
async function buildMultiSheetWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const notes = workbook.addWorksheet('Instructions');
  notes.addRow(['Field', 'Description']);
  notes.addRow(['Owner', 'Jane Doe']);
  notes.addRow(['Last Updated', '2026-09-01']);

  const data = workbook.addWorksheet('Assessment Data');
  data.addRow(['Control_ID', 'Current_Maturity']);
  data.addRow(['GV.OC-01', 'DEVELOPING']);
  data.addRow(['GV.OC-02', 'MANAGED']);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

test.describe('Import wizard — multi-sheet workbook', () => {
  test('lets the user see per-sheet stats and pick the sheet with real data', async ({ page }) => {
    const { id, accessToken } = await createDraftAssessment(page);

    try {
      await page.goto(`/assessments/${id}/import`);
      await expect(page.getByRole('heading', { name: 'Import from Excel/CSV' })).toBeVisible();

      const xlsxBuffer = await buildMultiSheetWorkbook();
      await page.locator('input[type="file"]').setInputFiles({
        name: 'multi-sheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsxBuffer,
      });
      await page.getByRole('button', { name: 'Preview Import' }).click();

      // Both sheets should be offered, with the decoy sheet visibly flagged as
      // recognizing zero columns and the real data sheet showing real row stats.
      // (Sheet names are matched via their checkbox <label for="sheet-...">, not free-text
      // search, since "Assessment Data" is also a substring of the decoy sheet's own warning.)
      await expect(page.getByRole('heading', { name: 'Choose Sheets to Import' })).toBeVisible();
      await expect(page.locator('label[for="sheet-Instructions"]')).toBeVisible();
      await expect(page.locator('label[for="sheet-Assessment\\ Data"]')).toBeVisible();
      await expect(page.getByText('0 columns recognized — probably not assessment data')).toBeVisible();
      await expect(page.getByText(/2 columns mapped · 2 rows/)).toBeVisible();

      // The decoy sheet should be unchecked by default (0 mapped columns); the real one checked.
      await expect(page.locator('#sheet-Instructions')).not.toBeChecked();
      await expect(page.locator('#sheet-Assessment\\ Data')).toBeChecked();

      await page.getByRole('button', { name: 'Import 1 Selected Sheet' }).click();

      await expect(page.getByRole('heading', { name: 'Import Results' })).toBeVisible();
      // Both GV.OC-01 and GV.OC-02 are real seeded subcategory codes, so both import clean.
      await expect(page.locator('p.text-green-500')).toHaveText('2');
    } finally {
      await deleteAssessment(id, accessToken);
    }
  });

  test('imports more than one selected sheet and combines the results', async ({ page }) => {
    const { id, accessToken } = await createDraftAssessment(page);

    try {
      await page.goto(`/assessments/${id}/import`);

      const xlsxBuffer = await buildMultiSheetWorkbook();
      await page.locator('input[type="file"]').setInputFiles({
        name: 'multi-sheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsxBuffer,
      });
      await page.getByRole('button', { name: 'Preview Import' }).click();
      await expect(page.getByRole('heading', { name: 'Choose Sheets to Import' })).toBeVisible();

      // Explicitly include the decoy sheet too (it has no canonical columns, so its 2 rows
      // contribute nothing importable, but the combined result should still reflect them).
      await page.locator('#sheet-Instructions').check();
      await page.getByRole('button', { name: 'Import 2 Selected Sheets' }).click();

      await expect(page.getByRole('heading', { name: 'Import Results' })).toBeVisible();
      await expect(page.getByText('2 sheets combined')).toBeVisible();
      // 2 rows from "Instructions" (both invalid — no Control_ID column at all) + 2 real rows
      // from "Assessment Data" = 4 total; only the 2 real ones actually import.
      // "Total rows" is the first white stat in the grid; "Valid" (the only other white one) is the second.
      await expect(page.locator('p.text-white.text-lg.font-medium').first()).toHaveText('4');
      await expect(page.locator('p.text-green-500')).toHaveText('2');
    } finally {
      await deleteAssessment(id, accessToken);
    }
  });
});
