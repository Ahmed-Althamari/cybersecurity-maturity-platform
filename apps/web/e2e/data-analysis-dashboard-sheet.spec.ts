import path from 'path';

import { expect, test } from '@playwright/test';

import { authFile } from './global-setup';

test.use({ storageState: authFile('admin') });

// A real .xlsx with a "RawData" table sheet and a "Dashboard" sheet containing a native Excel
// bar chart ("Quarterly Revenue": Q1/200, Q2/250, Q3/300) — generated via openpyxl, since
// exceljs (used elsewhere in this suite) has no API for writing native chart objects, only for
// reading/writing plain cell data. Committed as a binary fixture rather than built in-test.
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'multi-sheet-with-dashboard.xlsx');

/**
 * The sheet picker + embedded-chart extraction added to Data Analysis: a multi-sheet upload
 * shows each sheet's type (data table vs. dashboard sheet) before analyzing, and a dashboard
 * sheet's own chart is extracted with its real plotted data (not just a picture) — proven here
 * by reading the actual numbers back out of the "View underlying data" table, then pinning the
 * chart to the shared dashboard and confirming it shows there with the same data.
 */
test.describe('Data Analysis — dashboard sheet extraction and pinning', () => {
  test('shows the sheet picker, extracts a real chart, pins it, and it appears on the dashboard', async ({ page }) => {
    await page.goto('/data-analysis');
    await page.locator('#file-input').setInputFiles(FIXTURE_PATH);
    await page.getByRole('button', { name: 'Analyze' }).click();

    await expect(page.getByRole('heading', { name: 'Choose a sheet to analyze' })).toBeVisible();
    // Each sheet-picker row is its own <label>, scoped to just that sheet's name and badge.
    const rawDataRow = page.locator('label').filter({ hasText: 'RawData' });
    await expect(rawDataRow).toContainText('Data table');
    const dashboardRow = page.locator('label').filter({ hasText: 'Dashboard' });
    await expect(dashboardRow).toContainText('Dashboard sheet');

    await expect(page.getByRole('heading', { name: 'Charts already in this workbook' })).toBeVisible();
    // The innermost div containing the chart's title is the card itself — filtering on the title
    // alone (rather than a button's label, which changes text as the test interacts with it)
    // keeps this locator valid across the "view data" and "pin" state changes below.
    const chartCard = page.locator('div').filter({ hasText: 'Quarterly Revenue' }).last();
    await expect(chartCard).toBeVisible();

    await chartCard.getByRole('button', { name: 'View underlying data' }).click();
    await expect(chartCard.locator('table')).toContainText('Q1');
    await expect(chartCard.locator('table')).toContainText('200');
    await expect(chartCard.locator('table')).toContainText('300');

    await chartCard.getByRole('button', { name: 'Pin to Dashboard' }).click();
    await expect(chartCard.getByText('Pinned to Dashboard')).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Pinned Insights' })).toBeVisible();
    // Scoped by the card's own class, not `.last()` on a text filter — the card has a nested
    // header div that also contains the title text, so a plain "innermost div with this text"
    // filter would resolve to that header instead of the full card.
    const pinnedCard = page.locator('div.bg-slate-800.rounded-lg').filter({ hasText: 'Quarterly Revenue' });
    await expect(pinnedCard).toBeVisible();

    await pinnedCard.getByRole('button', { name: 'View underlying data' }).click();
    await expect(pinnedCard.locator('table')).toContainText('Q2');
    await expect(pinnedCard.locator('table')).toContainText('250');

    // Clean up — remove the pinned insight so this test leaves no shared dashboard state behind.
    await pinnedCard.getByLabel('Remove pinned insight').click();
    await expect(page.getByText('Quarterly Revenue')).toHaveCount(0);
  });

  test('analyzing a chosen table sheet runs the analysis scoped to just that sheet', async ({ page }) => {
    await page.goto('/data-analysis');
    await page.locator('#file-input').setInputFiles(FIXTURE_PATH);
    await page.getByRole('button', { name: 'Analyze' }).click();

    await expect(page.getByRole('heading', { name: 'Choose a sheet to analyze' })).toBeVisible();
    await page.getByRole('button', { name: /Analyze "RawData"/ }).click();

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
    // RawData has 6 data rows, 2 columns — the whole workbook (RawData + Dashboard + its own
    // rows) would be a different count, confirming the sheet scoping actually took effect.
    await expect(page.getByText('6 rows, 2 columns.')).toBeVisible();
  });
});

test.describe('Data Analysis — Add to Risk Register', () => {
  test('pre-fills the risk creation form from an AI answer, for the user to review before saving', async ({ page }) => {
    await page.goto('/data-analysis');
    await page.getByText('AI-Powered').click();

    await page.route('**/api/v1/data-analysis/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'ai',
          rowCount: 3,
          columnCount: 2,
          columns: [],
          charts: [],
          answer: 'Three vendor contracts renew within 30 days with no owner assigned.',
          table: null,
          error: null,
        }),
      });
    });

    await page.locator('#file-input').setInputFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('vendor,renewal_days\nAcme,10\nBeta,20\nGamma,5\n'),
    });
    await page.getByRole('button', { name: 'Analyze' }).click();

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(page.getByText('Three vendor contracts renew within 30 days')).toBeVisible();

    await page.getByRole('button', { name: 'Add to Risk Register' }).click();

    await expect(page).toHaveURL(/\/risks\/new/);
    await expect(page.locator('#risk-title')).toHaveValue(/Finding from Data Analysis/);
    await expect(page.locator('#risk-description')).toHaveValue('Three vendor contracts renew within 30 days with no owner assigned.');
  });
});
