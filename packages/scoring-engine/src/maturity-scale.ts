import { MaturityLevel } from '@cmmp/shared';

// Numeric scale backing the platform's default maturity model (seeded in
// prisma/seed.ts as "CMMP Standard 0-5"): NOT_APPLICABLE is not scored at
// all — it is excluded from aggregation rather than treated as a 0 — the
// five assessable levels run 1 (Initial) through 5 (Optimised).
//
// ADR-007 calls for *configurable* maturity scoring (reading numeric level
// values from the `MaturityModel`/`MaturityModelLevel` tables instead of a
// fixed map). `AssessmentItem.currentMaturity`/`targetMaturity` are typed
// against the fixed `MaturityLevel` Postgres enum, not a foreign key into
// `MaturityModelLevel`, so nothing today actually varies this scale per
// tenant — this map is the one true scale until that schema link exists.
export const MATURITY_LEVEL_SCORES: Record<Exclude<MaturityLevel, MaturityLevel.NOT_APPLICABLE>, number> = {
  [MaturityLevel.INITIAL]: 1,
  [MaturityLevel.DEVELOPING]: 2,
  [MaturityLevel.DEFINED]: 3,
  [MaturityLevel.MANAGED]: 4,
  [MaturityLevel.OPTIMISED]: 5,
};

export const MIN_MATURITY_SCORE = 1;
export const MAX_MATURITY_SCORE = 5;

/** Returns the numeric score for a maturity level, or `null` if it's not applicable (excluded from scoring). */
export function maturityLevelToScore(level: MaturityLevel): number | null {
  if (level === MaturityLevel.NOT_APPLICABLE) {
    return null;
  }
  return MATURITY_LEVEL_SCORES[level];
}

/** Rounds a 1-5 score to its nearest maturity level label, for display. `null` in, `null` out. */
export function scoreToMaturityLevel(score: number | null): MaturityLevel | null {
  if (score === null) {
    return null;
  }
  const clamped = Math.min(MAX_MATURITY_SCORE, Math.max(MIN_MATURITY_SCORE, score));
  const rounded = Math.round(clamped);
  const entry = Object.entries(MATURITY_LEVEL_SCORES).find(([, value]) => value === rounded);
  return (entry?.[0] as MaturityLevel) ?? MaturityLevel.INITIAL;
}
