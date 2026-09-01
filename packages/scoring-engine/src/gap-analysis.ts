import { RiskLevel } from '@cmmp/shared';
import type { GapAnalysisEntry, OrganisationMaturityScore } from './types';

/** Gap-magnitude thresholds on the 1-5 maturity scale, largest first. */
const GAP_RISK_THRESHOLDS: [minGap: number, risk: RiskLevel][] = [
  [3, RiskLevel.CRITICAL],
  [2, RiskLevel.HIGH],
  [1, RiskLevel.MEDIUM],
  [0, RiskLevel.LOW],
];

function riskLevelForGap(gap: number): RiskLevel {
  for (const [minGap, risk] of GAP_RISK_THRESHOLDS) {
    if (gap >= minGap) {
      return risk;
    }
  }
  return RiskLevel.MINIMAL; // gap <= 0: already at or above target
}

export interface IdentifyGapsOptions {
  /** Only include function/category/subcategory levels named here. Defaults to all three. */
  levels?: GapAnalysisEntry['level'][];
  /** Drop entries with a gap smaller than this (e.g. 0 to hide already-met targets). */
  minGap?: number;
}

/**
 * Flattens a scored hierarchy into gap entries at every level, sorted by
 * gap descending (largest, highest-risk gaps first; entries with no gap —
 * nothing applicable was scored — sort last). Callers typically filter to
 * one `level` for a given view (e.g. category-level for a dashboard's
 * "top gaps" table, function-level for an executive summary).
 */
export function identifyGaps(
  orgScore: OrganisationMaturityScore,
  options: IdentifyGapsOptions = {},
): GapAnalysisEntry[] {
  const levels = new Set(options.levels ?? ['function', 'category', 'subcategory']);
  const entries: GapAnalysisEntry[] = [];

  for (const fn of orgScore.functions) {
    if (levels.has('function')) {
      entries.push(toEntry('function', fn.functionId, fn.currentScore, fn.targetScore, fn.gap));
    }
    for (const category of fn.categories) {
      if (levels.has('category')) {
        entries.push(
          toEntry('category', category.categoryId, category.currentScore, category.targetScore, category.gap),
        );
      }
      if (levels.has('subcategory')) {
        for (const subcategory of category.subcategories) {
          entries.push(
            toEntry(
              'subcategory',
              subcategory.subcategoryId,
              subcategory.currentScore,
              subcategory.targetScore,
              subcategory.gap,
            ),
          );
        }
      }
    }
  }

  const filtered =
    options.minGap === undefined
      ? entries
      : entries.filter((entry) => entry.gap !== null && entry.gap >= options.minGap!);

  return filtered.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
}

function toEntry(
  level: GapAnalysisEntry['level'],
  id: string,
  currentScore: number | null,
  targetScore: number | null,
  gap: number | null,
): GapAnalysisEntry {
  return {
    level,
    id,
    currentScore,
    targetScore,
    gap,
    riskLevel: gap === null ? RiskLevel.MINIMAL : riskLevelForGap(gap),
  };
}
