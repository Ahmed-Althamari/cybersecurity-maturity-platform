import { sanitizeCellValue } from './sanitize';
import type { ColumnMapping, ValidationIssue } from './types';

export interface MappedRow {
  rowNumber: number;
  raw: ColumnMapping;
  sanitizationIssues: ValidationIssue[];
}

/** Applies a column mapping to one raw data row, running every cell through the formula-injection sanitizer. */
export function mapRow(row: string[], headers: string[], mapping: ColumnMapping, rowNumber: number): MappedRow {
  const raw: ColumnMapping = {};
  const sanitizationIssues: ValidationIssue[] = [];

  for (const [canonical, sourceHeader] of Object.entries(mapping)) {
    if (!sourceHeader) continue;
    const columnIndex = headers.indexOf(sourceHeader);
    if (columnIndex === -1) continue;

    const cellValue = (row[columnIndex] ?? '').trim();
    if (cellValue === '') continue;

    const { value, wasSanitized } = sanitizeCellValue(cellValue);
    raw[canonical as keyof ColumnMapping] = value;
    if (wasSanitized) {
      sanitizationIssues.push({
        column: canonical as ValidationIssue['column'],
        message: `Cell value looked like a spreadsheet formula and was neutralised: '${cellValue}'`,
        severity: 'warning',
      });
    }
  }

  return { rowNumber, raw, sanitizationIssues };
}
