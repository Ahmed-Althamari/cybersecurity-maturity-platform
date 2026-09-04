import { parseFrameworkDefinition, type FrameworkDefinition } from '@cmmp/framework-engine';
import { MaturityLevel } from '@cmmp/shared';

import { scoreFramework } from './framework-score';
import type { ScoredItem } from './types';

function framework(): FrameworkDefinition {
  return parseFrameworkDefinition({
    slug: 'test-framework',
    name: 'Test Framework',
    version: '1.0',
    frameworkType: 'TEST',
    functions: [
      {
        code: 'GV',
        name: 'Govern',
        categories: [
          {
            code: 'GV.RM',
            name: 'Risk Management',
            subcategories: [
              { code: 'GV.RM-01', name: 'Objective one' },
              { code: 'GV.RM-02', name: 'Objective two' },
            ],
          },
          {
            code: 'GV.SC',
            name: 'Supply Chain',
            subcategories: [{ code: 'GV.SC-01', name: 'Objective three' }],
          },
        ],
      },
      {
        code: 'ID',
        name: 'Identify',
        categories: [
          {
            code: 'ID.AM',
            name: 'Asset Management',
            subcategories: [{ code: 'ID.AM-01', name: 'Objective four' }],
          },
        ],
      },
    ],
  });
}

function item(subcategoryCode: string, current: MaturityLevel, target: MaturityLevel, weight = 1): ScoredItem {
  return { subcategoryCode, currentMaturity: current, targetMaturity: target, weight };
}

describe('scoreFramework', () => {
  it('scores every level of the tree from a flat list of items', () => {
    const result = scoreFramework(framework(), [
      item('GV.RM-01', MaturityLevel.INITIAL, MaturityLevel.MANAGED), // 1 -> 4
      item('GV.RM-02', MaturityLevel.DEFINED, MaturityLevel.MANAGED), // 3 -> 4
      item('GV.SC-01', MaturityLevel.MANAGED, MaturityLevel.MANAGED), // 4 -> 4
      item('ID.AM-01', MaturityLevel.OPTIMISED, MaturityLevel.OPTIMISED), // 5 -> 5
    ]);

    const gv = result.functions.find((fn) => fn.code === 'GV')!;
    const gvRm = gv.children.find((c) => c.code === 'GV.RM')!;

    // GV.RM = avg(1,3) = 2
    expect(gvRm.score.current).toBe(2);
    expect(gvRm.children.map((s) => s.score.current)).toEqual([1, 3]);

    // GV overall = avg(1,3,4) = 8/3 = 2.67
    expect(gv.score.current).toBeCloseTo(2.67, 2);

    // ID = 5
    const id = result.functions.find((fn) => fn.code === 'ID')!;
    expect(id.score.current).toBe(5);

    // overall = avg(1,3,4,5) = 3.25
    expect(result.overall.current).toBeCloseTo(3.25, 2);
  });

  it('gives every node a score even when no items answer it', () => {
    const result = scoreFramework(framework(), []);

    expect(result.overall).toEqual({ current: 0, target: 0, gap: 0, itemCount: 0, applicableCount: 0 });
    const gv = result.functions.find((fn) => fn.code === 'GV')!;
    expect(gv.score.applicableCount).toBe(0);
    expect(gv.children).toHaveLength(2);
  });

  it('preserves the tree structure depth-first (function depth 0, category depth 1, subcategory depth 2)', () => {
    const result = scoreFramework(framework(), []);
    const gv = result.functions.find((fn) => fn.code === 'GV')!;

    expect(gv.depth).toBe(0);
    expect(gv.children[0].depth).toBe(1);
    expect(gv.children[0].children[0].depth).toBe(2);
  });
});
