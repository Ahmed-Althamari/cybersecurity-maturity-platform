import type { MaturityLevel } from '@cmmp/shared';

/** One scored response, keyed to the subcategory it answers. Framework-agnostic — no question/assessment-specific fields. */
export interface ScoredItem {
  subcategoryCode: string;
  currentMaturity: MaturityLevel;
  targetMaturity: MaturityLevel;
  weight: number;
}

/**
 * A weighted-average maturity rollup. `current`/`target` exclude
 * NOT_APPLICABLE items from the denominator — an item marked not
 * applicable shouldn't drag an average toward zero.
 */
export interface MaturityScore {
  current: number;
  target: number;
  gap: number;
  itemCount: number;
  applicableCount: number;
}

/** A scored node in a framework's function → category → subcategory tree. */
export interface ScoredNode {
  code: string;
  label: string;
  depth: number;
  score: MaturityScore;
  children: ScoredNode[];
}

export interface FrameworkScore {
  overall: MaturityScore;
  functions: ScoredNode[];
}

export interface GapEntry {
  code: string;
  label: string;
  depth: number;
  current: number;
  target: number;
  gap: number;
}

export interface TrendPoint {
  version: number;
  current: number | null;
  recordedAt?: Date;
}

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  changeFromPrevious: number | null;
  series: TrendPoint[];
}
