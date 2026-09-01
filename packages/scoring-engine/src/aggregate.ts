import { maturityLevelToScore, scoreToMaturityLevel } from './maturity-scale';
import type {
  CategoryScore,
  FunctionScore,
  MaturityScore,
  OrganisationMaturityScore,
  ScoredResponse,
  SubcategoryScore,
} from './types';

interface WeightedEntry {
  current: number | null;
  target: number | null;
  weight: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Weighted average of `current`/`target` across entries, excluding null
 * (not-applicable / unscored) values from their respective averages
 * independently. `appliedWeight` is the weight actually counted toward the
 * current-score average — used by callers as this entry's contribution
 * weight one level up the hierarchy, so a subcategory with more (or more
 * heavily weighted) applicable responses naturally outweighs a thinner one
 * in its category's rollup, and a subcategory with nothing applicable
 * naturally contributes zero.
 */
function weightedAverage(entries: WeightedEntry[]): {
  currentScore: number | null;
  targetScore: number | null;
  appliedWeight: number;
} {
  let currentSum = 0;
  let currentWeight = 0;
  let targetSum = 0;
  let targetWeight = 0;

  for (const entry of entries) {
    if (entry.current !== null) {
      currentSum += entry.current * entry.weight;
      currentWeight += entry.weight;
    }
    if (entry.target !== null) {
      targetSum += entry.target * entry.weight;
      targetWeight += entry.weight;
    }
  }

  return {
    currentScore: currentWeight > 0 ? currentSum / currentWeight : null,
    targetScore: targetWeight > 0 ? targetSum / targetWeight : null,
    appliedWeight: currentWeight,
  };
}

function toMaturityScore(
  entries: WeightedEntry[],
  responseCount: number,
  applicableCount: number,
): MaturityScore {
  const { currentScore, targetScore } = weightedAverage(entries);
  return {
    currentScore: currentScore !== null ? round2(currentScore) : null,
    targetScore: targetScore !== null ? round2(targetScore) : null,
    gap: currentScore !== null && targetScore !== null ? round2(targetScore - currentScore) : null,
    currentLevel: scoreToMaturityLevel(currentScore),
    targetLevel: scoreToMaturityLevel(targetScore),
    responseCount,
    applicableCount,
  };
}

/** Scores a flat list of responses (e.g. every response under one subcategory) with no hierarchy. */
export function scoreResponses(responses: ScoredResponse[]): MaturityScore {
  const entries = responses.map((response) => {
    const current = maturityLevelToScore(response.currentMaturity);
    // Target only counts once an item is actually applicable: with the
    // schema's defaults (currentMaturity=NOT_APPLICABLE, targetMaturity=
    // DEFINED), an item nobody has assessed yet would otherwise leak its
    // default target score into the aggregate even though it hasn't been
    // assessed. NOT_APPLICABLE excludes an item from scoring entirely, on
    // both axes, not just from the current-maturity average.
    const target = current !== null ? maturityLevelToScore(response.targetMaturity) : null;
    return { current, target, weight: response.weight ?? 1 };
  });
  const applicableCount = entries.filter((entry) => entry.current !== null).length;
  return toMaturityScore(entries, responses.length, applicableCount);
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/**
 * Rolls a flat, framework-agnostic list of responses up into the full
 * Function → Category → Subcategory hierarchy, computing a weighted
 * `MaturityScore` at every level. Grouping order follows first-appearance
 * order in `responses` — callers that want a display order (e.g. a
 * framework's own `displayOrder`) should pass responses pre-sorted that
 * way, since this package has no framework metadata of its own to sort by.
 */
export function aggregateHierarchy(responses: ScoredResponse[]): OrganisationMaturityScore {
  const functionScores: FunctionScore[] = [];
  const functionWeightedEntries: WeightedEntry[] = [];
  let totalResponses = 0;
  let totalApplicable = 0;

  for (const [functionId, functionResponses] of groupBy(responses, (r) => r.functionId)) {
    const categoryScores: CategoryScore[] = [];
    const categoryWeightedEntries: WeightedEntry[] = [];

    for (const [categoryId, categoryResponses] of groupBy(functionResponses, (r) => r.categoryId)) {
      const subcategoryScores: SubcategoryScore[] = [];
      const subcategoryWeightedEntries: WeightedEntry[] = [];

      for (const [subcategoryId, subcategoryResponses] of groupBy(
        categoryResponses,
        (r) => r.subcategoryId,
      )) {
        const score = scoreResponses(subcategoryResponses);
        subcategoryScores.push({ subcategoryId, ...score });
        subcategoryWeightedEntries.push({
          current: score.currentScore,
          target: score.targetScore,
          weight: subcategoryResponses.reduce((sum, r) => sum + (r.weight ?? 1), 0),
        });
      }

      const categoryScore = toMaturityScore(
        subcategoryWeightedEntries,
        categoryResponses.length,
        subcategoryScores.reduce((sum, s) => sum + s.applicableCount, 0),
      );
      categoryScores.push({ categoryId, subcategories: subcategoryScores, ...categoryScore });
      categoryWeightedEntries.push({
        current: categoryScore.currentScore,
        target: categoryScore.targetScore,
        weight: subcategoryWeightedEntries.reduce((sum, e) => sum + e.weight, 0),
      });
    }

    const functionScore = toMaturityScore(
      categoryWeightedEntries,
      functionResponses.length,
      categoryScores.reduce((sum, c) => sum + c.applicableCount, 0),
    );
    functionScores.push({ functionId, categories: categoryScores, ...functionScore });
    functionWeightedEntries.push({
      current: functionScore.currentScore,
      target: functionScore.targetScore,
      weight: categoryWeightedEntries.reduce((sum, e) => sum + e.weight, 0),
    });

    totalResponses += functionResponses.length;
    totalApplicable += functionScore.applicableCount;
  }

  const organisationScore = toMaturityScore(functionWeightedEntries, totalResponses, totalApplicable);
  return { functions: functionScores, ...organisationScore };
}
