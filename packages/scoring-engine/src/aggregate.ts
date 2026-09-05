import { MaturityLevel } from '@cmmp/shared';

import { maturityLevelToScore } from './levels';
import type { MaturityScore, ScoredItem } from './types';

const EMPTY_SCORE: MaturityScore = { current: 0, target: 0, gap: 0, itemCount: 0, applicableCount: 0 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Weighted-average rollup of a flat list of items. An item whose
 * `currentMaturity` is NOT_APPLICABLE is excluded from both averages
 * entirely (its target doesn't matter either) rather than scored as 0 —
 * a control marked not-applicable shouldn't drag the average down.
 */
export function scoreItems(items: ScoredItem[]): MaturityScore {
  if (items.length === 0) {
    return { ...EMPTY_SCORE };
  }

  const applicable = items.filter((item) => item.currentMaturity !== MaturityLevel.NOT_APPLICABLE);
  if (applicable.length === 0) {
    return { ...EMPTY_SCORE, itemCount: items.length };
  }

  const totalWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return { ...EMPTY_SCORE, itemCount: items.length, applicableCount: applicable.length };
  }

  const currentSum = applicable.reduce((sum, item) => sum + maturityLevelToScore(item.currentMaturity) * item.weight, 0);
  const targetSum = applicable.reduce((sum, item) => sum + maturityLevelToScore(item.targetMaturity) * item.weight, 0);

  const current = round2(currentSum / totalWeight);
  const target = round2(targetSum / totalWeight);

  return {
    current,
    target,
    gap: round2(target - current),
    itemCount: items.length,
    applicableCount: applicable.length,
  };
}

/** Combines already-computed rollups (e.g. per-assessment scores into an organisation-wide one) as a weighted average. */
export function combineScores(scores: { score: MaturityScore; weight: number }[]): MaturityScore {
  const withApplicableItems = scores.filter((entry) => entry.score.applicableCount > 0 && entry.weight > 0);
  if (withApplicableItems.length === 0) {
    return {
      ...EMPTY_SCORE,
      itemCount: scores.reduce((sum, entry) => sum + entry.score.itemCount, 0),
    };
  }

  const totalWeight = withApplicableItems.reduce((sum, entry) => sum + entry.weight, 0);
  const currentSum = withApplicableItems.reduce((sum, entry) => sum + entry.score.current * entry.weight, 0);
  const targetSum = withApplicableItems.reduce((sum, entry) => sum + entry.score.target * entry.weight, 0);

  const current = round2(currentSum / totalWeight);
  const target = round2(targetSum / totalWeight);

  return {
    current,
    target,
    gap: round2(target - current),
    itemCount: scores.reduce((sum, entry) => sum + entry.score.itemCount, 0),
    applicableCount: scores.reduce((sum, entry) => sum + entry.score.applicableCount, 0),
  };
}
