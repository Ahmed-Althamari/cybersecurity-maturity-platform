import type { ImportResult, ValidatedRow } from './types';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a downloadable CSV of every non-valid row and why it was
 * rejected/flagged/deduplicated — master prompt §14: "Never silently
 * discard bad data. Produce a downloadable error report for rejected
 * records."
 */
export function buildErrorReportCsv(result: ImportResult): string {
  const rows: ValidatedRow[] = [...result.invalid, ...result.warnings, ...result.duplicates];
  const header = ['Row', 'Status', 'Control_ID', 'Issues'];

  const lines = rows.map((row) =>
    [
      String(row.rowNumber),
      row.status,
      row.data.controlId ?? '',
      row.issues.map((issue) => `${issue.column}: ${issue.message}`).join(' | '),
    ]
      .map(csvEscape)
      .join(','),
  );

  return [header.join(','), ...lines].join('\n');
}
