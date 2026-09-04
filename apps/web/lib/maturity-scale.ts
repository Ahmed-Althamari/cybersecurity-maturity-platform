// Color scale for maturity scores and risk levels, on this app's dark
// slate surface. Values are the dataviz skill's validated dark-mode status
// palette (fixed, never themed) and categorical slots 1/2 (blue/orange)
// for two-series current-vs-target comparisons — never color alone: every
// use here pairs the color with a visible number or label.

export const STATUS_COLORS = {
  critical: '#e66767',
  serious: '#ec835a',
  warning: '#fab219',
  good: '#0ca30c',
} as const;

export const SERIES_COLORS = {
  current: '#3987e5', // categorical slot 1 (blue)
  target: '#d95926', // categorical slot 2 (orange)
} as const;

const RISK_LEVEL_COLORS: Record<string, string> = {
  CRITICAL: STATUS_COLORS.critical,
  HIGH: STATUS_COLORS.serious,
  MEDIUM: STATUS_COLORS.warning,
  LOW: SERIES_COLORS.current,
  MINIMAL: '#64748b', // slate-500 — deliberately muted, not a status color
};

export function riskLevelColor(riskLevel: string): string {
  return RISK_LEVEL_COLORS[riskLevel] ?? RISK_LEVEL_COLORS.MINIMAL;
}

export interface MaturityBand {
  label: string;
  color: string;
}

/** Buckets a 0-5 maturity score into a status band. Always show the numeric score alongside this — the color is not the only signal. */
export function maturityBand(score: number): MaturityBand {
  if (score < 1.5) return { label: 'Critical', color: STATUS_COLORS.critical };
  if (score < 2.5) return { label: 'Serious', color: STATUS_COLORS.serious };
  if (score < 3.5) return { label: 'Warning', color: STATUS_COLORS.warning };
  return { label: 'Good', color: STATUS_COLORS.good };
}
