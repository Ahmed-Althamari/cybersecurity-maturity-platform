import type { ControlStatus, MaturityLevel, RiskLevel } from '@cmmp/shared';

/** Canonical column names, per master prompt §14's expected-columns list. */
export const CANONICAL_COLUMNS = [
  'Framework',
  'Function',
  'Category',
  'Subcategory',
  'Control_ID',
  'Assessment_Question',
  'Current_Maturity',
  'Target_Maturity',
  'Weight',
  'Risk',
  'Business_Criticality',
  'Evidence',
  'Comments',
  'Recommendation',
  'Owner',
  'Due_Date',
  'Status',
] as const;

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

/** Canonical column -> the source file's actual header for that column (or undefined if unmapped). */
export type ColumnMapping = Partial<Record<CanonicalColumn, string>>;

/** A parsed sheet, independent of whether it came from .xlsx or .csv. */
export interface RawSheet {
  headers: string[];
  rows: string[][];
}

export type IssueSeverity = 'warning' | 'error';

export interface ValidationIssue {
  column: CanonicalColumn | 'file';
  message: string;
  severity: IssueSeverity;
}

/** The parsed, typed fields extracted from one row once mapping + validation have run. */
export interface ImportedRowData {
  controlId?: string;
  framework?: string;
  function?: string;
  category?: string;
  subcategory?: string;
  question?: string;
  currentMaturity?: MaturityLevel;
  targetMaturity?: MaturityLevel;
  weight?: number;
  riskLevel?: RiskLevel;
  businessCriticality?: number;
  evidence?: string;
  comments?: string;
  recommendation?: string;
  owner?: string;
  dueDate?: string;
  controlStatus?: ControlStatus;
}

export type RowStatus = 'valid' | 'warning' | 'invalid' | 'duplicate';

export interface ValidatedRow {
  /** 1-based row number in the source file (header is row 1), for error reporting. */
  rowNumber: number;
  status: RowStatus;
  issues: ValidationIssue[];
  data: ImportedRowData;
  /** The raw, mapped-but-unvalidated cell text, keyed by canonical column. */
  raw: ColumnMapping;
}

export interface ImportResult {
  totalRows: number;
  columnMapping: ColumnMapping;
  unmappedColumns: CanonicalColumn[];
  valid: ValidatedRow[];
  warnings: ValidatedRow[];
  invalid: ValidatedRow[];
  duplicates: ValidatedRow[];
}

export interface ImportOptions {
  /** Overrides auto-detected column mapping; merged on top of it (an explicit `undefined` clears an auto-detected column). */
  columnMapping?: ColumnMapping;
}
