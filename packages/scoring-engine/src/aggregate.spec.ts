import { MaturityLevel } from '@cmmp/shared';

import { combineScores, scoreItems } from './aggregate';
import type { ScoredItem } from './types';

function item(overrides: Partial<ScoredItem> = {}): ScoredItem {
  return {
    subcategoryCode: 'GV.RM-01',
    currentMaturity: MaturityLevel.DEVELOPING,
    targetMaturity: MaturityLevel.MANAGED,
    weight: 1,
    ...overrides,
  };
}

describe('scoreItems', () => {
  it('returns all-zero for an empty list', () => {
    expect(scoreItems([])).toEqual({ current: 0, target: 0, gap: 0, itemCount: 0, applicableCount: 0 });
  });

  it('computes a simple unweighted average', () => {
    const score = scoreItems([
      item({ currentMaturity: MaturityLevel.INITIAL, targetMaturity: MaturityLevel.DEFINED }),
      item({ currentMaturity: MaturityLevel.DEFINED, targetMaturity: MaturityLevel.DEFINED }),
    ]);

    expect(score.current).toBe(2); // (1 + 3) / 2
    expect(score.target).toBe(3);
    expect(score.gap).toBe(1);
    expect(score.itemCount).toBe(2);
    expect(score.applicableCount).toBe(2);
  });

  it('weights items proportionally', () => {
    const score = scoreItems([
      item({ currentMaturity: MaturityLevel.INITIAL, weight: 3 }), // score 1
      item({ currentMaturity: MaturityLevel.OPTIMISED, weight: 1 }), // score 5
    ]);

    // (1*3 + 5*1) / 4 = 2
    expect(score.current).toBe(2);
  });

  it('excludes NOT_APPLICABLE items from the average entirely, not as a zero', () => {
    const score = scoreItems([
      item({ currentMaturity: MaturityLevel.NOT_APPLICABLE, targetMaturity: MaturityLevel.MANAGED }),
      item({ currentMaturity: MaturityLevel.MANAGED, targetMaturity: MaturityLevel.MANAGED }),
    ]);

    expect(score.current).toBe(4); // not dragged toward 0 by the N/A item
    expect(score.itemCount).toBe(2);
    expect(score.applicableCount).toBe(1);
  });

  it('returns zero scores (but a nonzero itemCount) when every item is NOT_APPLICABLE', () => {
    const score = scoreItems([item({ currentMaturity: MaturityLevel.NOT_APPLICABLE })]);

    expect(score).toEqual({ current: 0, target: 0, gap: 0, itemCount: 1, applicableCount: 0 });
  });

  it('reports a negative gap when current already exceeds target', () => {
    const score = scoreItems([item({ currentMaturity: MaturityLevel.OPTIMISED, targetMaturity: MaturityLevel.INITIAL })]);

    expect(score.gap).toBe(-4);
  });
});

describe('combineScores', () => {
  it('weight-averages already-computed scores', () => {
    const a = scoreItems([item({ currentMaturity: MaturityLevel.INITIAL, weight: 1 })]); // current 1
    const b = scoreItems([item({ currentMaturity: MaturityLevel.OPTIMISED, weight: 1 })]); // current 5

    const combined = combineScores([
      { score: a, weight: 1 },
      { score: b, weight: 1 },
    ]);

    expect(combined.current).toBe(3);
  });

  it('ignores entries with no applicable items', () => {
    const empty = scoreItems([item({ currentMaturity: MaturityLevel.NOT_APPLICABLE })]);
    const real = scoreItems([item({ currentMaturity: MaturityLevel.MANAGED })]);

    const combined = combineScores([
      { score: empty, weight: 5 },
      { score: real, weight: 1 },
    ]);

    expect(combined.current).toBe(4);
  });

  it('returns zero when nothing has applicable items', () => {
    const empty = scoreItems([]);
    expect(combineScores([{ score: empty, weight: 1 }]).current).toBe(0);
  });
});
