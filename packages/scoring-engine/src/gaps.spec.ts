import { analyzeGaps } from './gaps';
import type { ScoredNode } from './types';

function node(code: string, depth: number, current: number, target: number, children: ScoredNode[] = []): ScoredNode {
  const gap = Math.round((target - current) * 100) / 100;
  return { code, label: code, depth, score: { current, target, gap, itemCount: 1, applicableCount: 1 }, children };
}

describe('analyzeGaps', () => {
  const tree = [
    node('GV', 0, 2, 4, [
      node('GV.RM', 1, 1, 4, [node('GV.RM-01', 2, 1, 4)]),
      node('GV.SC', 1, 4, 4, [node('GV.SC-01', 2, 4, 4)]), // no gap
    ]),
    node('ID', 0, 5, 3, [node('ID.AM', 1, 5, 3, [node('ID.AM-01', 2, 5, 3)])]), // already past target
  ];

  it('flattens every level and sorts by gap descending', () => {
    const gaps = analyzeGaps(tree);
    expect(gaps.map((g) => g.code)).toEqual(['GV.RM', 'GV.RM-01', 'GV']);
  });

  it('drops nodes with zero or negative gap by default', () => {
    const gaps = analyzeGaps(tree);
    expect(gaps.find((g) => g.code === 'GV.SC')).toBeUndefined();
    expect(gaps.find((g) => g.code === 'ID')).toBeUndefined();
  });

  it('filters to one depth when requested', () => {
    const gaps = analyzeGaps(tree, { depth: 2 });
    expect(gaps.map((g) => g.code)).toEqual(['GV.RM-01']);
  });

  it('respects limit after sorting', () => {
    const gaps = analyzeGaps(tree, { limit: 1 });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].code).toBe('GV.RM');
  });

  it('honours a custom minGap threshold', () => {
    const gaps = analyzeGaps(tree, { minGap: 2.5 });
    expect(gaps.map((g) => g.code)).toEqual(['GV.RM', 'GV.RM-01']);

    const stricter = analyzeGaps(tree, { minGap: 3.5 });
    expect(stricter).toEqual([]);
  });
});
