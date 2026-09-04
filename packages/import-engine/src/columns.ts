import { CANONICAL_COLUMNS, type CanonicalColumn, type ColumnMapping } from './types';

// Recognised alternate spellings per column, so "Current Score" auto-maps
// to Current_Maturity per master prompt §14's example — the user can still
// override any of these via `ImportOptions.columnMapping`.
const COLUMN_ALIASES: Record<CanonicalColumn, string[]> = {
  Framework: ['framework name'],
  Function: ['nist function', 'csf function'],
  Category: [],
  Subcategory: ['sub-category', 'sub category'],
  Control_ID: ['control id', 'controlid', 'subcategory code', 'subcategory id', 'control code', 'id'],
  Assessment_Question: ['assessment question', 'question'],
  Current_Maturity: ['current score', 'current maturity level', 'current'],
  Target_Maturity: ['target score', 'target maturity level', 'target'],
  Weight: ['item weight'],
  Risk: ['risk level'],
  Business_Criticality: ['criticality', 'business impact'],
  Evidence: ['evidence link', 'evidence reference'],
  Comments: ['comment', 'notes', 'assessor comments'],
  Recommendation: ['recommendations', 'remediation recommendation'],
  Owner: ['control owner', 'owner name'],
  Due_Date: ['remediation due date', 'target date'],
  Status: ['control status'],
};

function normalize(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

/**
 * Matches a file's actual headers to our canonical columns by exact name
 * or known alias, case/spacing-insensitive. Unmatched canonical columns
 * are simply absent from the returned mapping — the caller decides
 * whether that's fatal (e.g. `Control_ID` missing) or just means that
 * optional field wasn't provided.
 */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalize(header) }));
  const mapping: ColumnMapping = {};

  for (const canonical of CANONICAL_COLUMNS) {
    const candidates = [canonical, ...COLUMN_ALIASES[canonical]].map(normalize);
    const match = normalizedHeaders.find((header) => candidates.includes(header.normalized));
    if (match) {
      mapping[canonical] = match.original;
    }
  }

  return mapping;
}
