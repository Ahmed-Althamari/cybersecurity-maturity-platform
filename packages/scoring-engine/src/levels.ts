import { MaturityLevel } from '@cmmp/shared';

const SCORE_BY_LEVEL: Record<MaturityLevel, number> = {
  [MaturityLevel.NOT_APPLICABLE]: 0,
  [MaturityLevel.INITIAL]: 1,
  [MaturityLevel.DEVELOPING]: 2,
  [MaturityLevel.DEFINED]: 3,
  [MaturityLevel.MANAGED]: 4,
  [MaturityLevel.OPTIMISED]: 5,
};

const LEVEL_BY_SCORE: MaturityLevel[] = [
  MaturityLevel.NOT_APPLICABLE,
  MaturityLevel.INITIAL,
  MaturityLevel.DEVELOPING,
  MaturityLevel.DEFINED,
  MaturityLevel.MANAGED,
  MaturityLevel.OPTIMISED,
];

export function maturityLevelToScore(level: MaturityLevel): number {
  return SCORE_BY_LEVEL[level];
}

/** Inverse of `maturityLevelToScore` — rounds to the nearest level, clamped to the valid 0-5 range. */
export function scoreToMaturityLevel(score: number): MaturityLevel {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));
  return LEVEL_BY_SCORE[rounded];
}
