// CSV/Excel formula injection (CWE-1236, aka "CSV injection"): a cell value
// that starts with one of these characters is interpreted as a formula (or
// a formula-adjacent directive) by Excel, Google Sheets, and LibreOffice
// Calc when the sheet — or data later re-exported from it — is opened.
// Untrusted spreadsheet input imported here can end up back in a
// spreadsheet later (an evidence/rationale field re-exported for a report),
// so it's sanitized on the way in rather than trusted as inert text.
// See: https://owasp.org/www-community/attacks/CSV_Injection
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

export interface SanitizeResult {
  value: string;
  sanitized: boolean;
}

/**
 * Neutralizes a leading formula-trigger character by prefixing the value
 * with a single quote — the same mitigation Excel itself uses for
 * "force text" — rather than stripping it, so the original content is
 * still visible/recoverable, just inert. No-op for values that don't start
 * with a trigger character.
 */
export function sanitizeFormulaInjection(value: string): SanitizeResult {
  if (value.length === 0 || !FORMULA_TRIGGER_CHARS.has(value[0])) {
    return { value, sanitized: false };
  }
  return { value: `'${value}`, sanitized: true };
}
