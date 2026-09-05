import { autoMapColumns } from './columns';
import { markDuplicates } from './duplicates';
import { mapRow } from './map-row';
import { parseCsv } from './parse-csv';
import { parseXlsx } from './parse-xlsx';
import { CANONICAL_COLUMNS, type CanonicalColumn, type ImportOptions, type ImportResult, type RawSheet } from './types';
import { validateRow } from './validate-row';

/**
 * Runs the full pipeline (auto-map columns, sanitise + validate every
 * cell, flag duplicates) over an already-parsed sheet. `parseCsv`/
 * `parseXlsx` are kept separate so this can also be driven by a caller
 * that already has a `RawSheet` from elsewhere (e.g. a UI preview step).
 */
export function importFromSheet(sheet: RawSheet, options: ImportOptions = {}): ImportResult {
  const autoMapping = autoMapColumns(sheet.headers);
  const columnMapping = { ...autoMapping, ...options.columnMapping };

  const unmappedColumns = CANONICAL_COLUMNS.filter((column) => !columnMapping[column]);

  const validated = sheet.rows.map((row, index) => {
    // rowNumber is 1-based with the header as row 1, so the first data row is row 2.
    const mapped = mapRow(row, sheet.headers, columnMapping, index + 2);
    return validateRow(mapped);
  });

  const withDuplicates = markDuplicates(validated);

  return {
    totalRows: withDuplicates.length,
    columnMapping,
    unmappedColumns,
    valid: withDuplicates.filter((row) => row.status === 'valid'),
    warnings: withDuplicates.filter((row) => row.status === 'warning'),
    invalid: withDuplicates.filter((row) => row.status === 'invalid'),
    duplicates: withDuplicates.filter((row) => row.status === 'duplicate'),
  };
}

export function importFromCsv(content: string, options?: ImportOptions): ImportResult {
  return importFromSheet(parseCsv(content), options);
}

export interface ImportFromXlsxResult {
  sheetNames: string[];
  result: ImportResult;
}

export async function importFromXlsx(buffer: Buffer, worksheetName?: string, options?: ImportOptions): Promise<ImportFromXlsxResult> {
  const { sheetNames, sheet } = await parseXlsx(buffer, worksheetName);
  return { sheetNames, result: importFromSheet(sheet, options) };
}

export type { CanonicalColumn };
