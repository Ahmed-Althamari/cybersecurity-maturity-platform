import { ControlStatus, MaturityLevel, RiskLevel } from '@cmmp/shared';

export type SpreadsheetFormat = 'csv' | 'xlsx';

/** One raw row as parsed from the sheet: source column header -> raw cell value. */
export interface ParsedRow {
  rowNumber: number; // 1-based, matching what a spreadsheet user would see (header row is row 1)
  cells: Record<string, unknown>;
  /**
   * Present only for a row with at least one formula cell: header -> the
   * formula text (e.g. "=SUM(A1:A3)"), for the same headers `cells` already
   * holds the *computed* result for. Never used as importable data itself --
   * see cellFormulaText()/cellToValue() in parse.ts.
   */
  formulas?: Record<string, string>;
}

/** One worksheet tab's parsed rows, keyed by its real Excel tab name. A CSV has no tabs -- see parseAllSheets(). */
export interface SheetRows {
  sheetName: string;
  rows: ParsedRow[];
}

/** Target fields an assessment-response import row can populate. Mirrors the mutable subset of AssessmentItem. */
export interface MappedAssessmentRow {
  subcategoryCode: string;
  currentMaturity?: MaturityLevel;
  targetMaturity?: MaturityLevel;
  riskLevel?: RiskLevel;
  businessCriticality?: number;
  controlStatus?: ControlStatus;
  rationale?: string;
  evidence?: string;
  assessorComments?: string;
  ownerName?: string;
  ownerEmail?: string;
  remediationDueDate?: Date;
}

/** Maps a target field on MappedAssessmentRow to the source column header that supplies it. */
export type ColumnMapping = Partial<Record<keyof MappedAssessmentRow, string>>;

export type ImportRowStatus = 'VALID' | 'WARNING' | 'ERROR';

export interface ImportRowResult {
  rowNumber: number;
  status: ImportRowStatus;
  /** Human-readable notes: validation failures for ERROR, sanitization/normalization notes for WARNING. */
  messages: string[];
  /** Present when status is VALID or WARNING — absent (nothing to apply) when ERROR. */
  data?: MappedAssessmentRow;
  /** The original, unmodified row — kept for the audit trail (ImportRecord.rawData). */
  raw: Record<string, unknown>;
}
