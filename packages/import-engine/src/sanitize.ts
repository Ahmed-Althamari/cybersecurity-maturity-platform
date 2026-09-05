// Formula/CSV injection defense (master prompt §40: "Reject or sanitise
// spreadsheet cells beginning with dangerous formula characters").
//
// A cell like `=cmd|'/c calc'!A1` or `-2+3+cmd|'/c calc'!A1` gets
// interpreted as a live formula the moment it's opened in Excel or
// re-exported to CSV and reopened — the classic CSV-injection attack. We
// neutralise it here, at import time, so it can never be stored or
// re-exported as an executable formula.

const FORMULA_PREFIX_CHARS = ['=', '+', '-', '@'];
const CONTROL_CHAR_PREFIXES = ['\t', '\r', '\n'];

function looksLikePlainNumber(value: string): boolean {
  return /^[+-]?\d+(\.\d+)?$/.test(value.trim());
}

/** True if `value` would be interpreted as a formula by a spreadsheet application, rather than as plain data. */
export function isFormulaInjection(value: string): boolean {
  if (!value) return false;
  if (CONTROL_CHAR_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;

  const firstChar = value.trimStart().charAt(0);
  if (!FORMULA_PREFIX_CHARS.includes(firstChar)) return false;

  // A plain negative/positive number (e.g. weight "-1") isn't an injection attempt.
  return !looksLikePlainNumber(value);
}

/**
 * Defuses a formula-looking cell by prefixing it with a single quote — the
 * standard way to force a spreadsheet application to treat a value as text
 * — and reports whether it did so. Values that aren't formula-like pass
 * through unchanged.
 */
export function sanitizeCellValue(value: string): { value: string; wasSanitized: boolean } {
  if (isFormulaInjection(value)) {
    return { value: `'${value}`, wasSanitized: true };
  }
  return { value, wasSanitized: false };
}
