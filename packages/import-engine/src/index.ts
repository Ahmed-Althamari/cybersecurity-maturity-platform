// Excel/CSV import engine for assessments.
//
// Parses .xlsx/.csv uploads, auto-maps columns (with manual override),
// validates and sanitises every cell (including formula/CSV-injection
// defense), flags duplicates, and never silently discards a bad row — per
// master prompt §14 and the Excel-security requirements in §40.

export { autoMapColumns } from './columns';
export { buildErrorReportCsv } from './error-report';
export { MAX_FILE_SIZE_BYTES, MAX_ROWS, validateFileSignature, validateFileUpload, type FileUploadMeta } from './file-guard';
export { importFromCsv, importFromSheet, importFromXlsx, type ImportFromXlsxResult } from './import';
export { parseCsv } from './parse-csv';
export { parseXlsx, type ParsedWorkbook } from './parse-xlsx';
export { isFormulaInjection, sanitizeCellValue } from './sanitize';
export {
  CANONICAL_COLUMNS,
  type CanonicalColumn,
  type ColumnMapping,
  type ImportedRowData,
  type ImportOptions,
  type ImportResult,
  type IssueSeverity,
  type RawSheet,
  type RowStatus,
  type ValidatedRow,
  type ValidationIssue,
} from './types';
