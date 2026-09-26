// Shared display helpers for the Strategic Plan pages/components — kept separate from
// lib/maturity-scale.ts since this is a different domain (initiative status, not maturity/risk).

export const STRATEGIC_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: '#64748b', // slate-500 — muted, matches maturity-scale's MINIMAL treatment
  IN_PROGRESS: '#3987e5', // SERIES_COLORS.current
  ON_HOLD: '#fab219', // STATUS_COLORS.warning
  COMPLETED: '#0ca30c', // STATUS_COLORS.good
  CANCELLED: '#e66767', // STATUS_COLORS.critical
};

export function strategicStatusColor(status: string): string {
  return STRATEGIC_STATUS_COLORS[status] ?? STRATEGIC_STATUS_COLORS.NOT_STARTED;
}

export function strategicStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function isInitiativeOverdue(status: string, targetDate: string | null): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED' && !!targetDate && new Date(targetDate) < new Date();
}
