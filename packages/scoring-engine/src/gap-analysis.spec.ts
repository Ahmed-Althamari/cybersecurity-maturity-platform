import { RiskLevel } from '@cmmp/shared';
import { identifyGaps } from './gap-analysis';
import type { OrganisationMaturityScore } from './types';

function score(currentScore: number | null, targetScore: number | null, gap: number | null) {
  return {
    currentScore,
    targetScore,
    gap,
    currentLevel: null,
    targetLevel: null,
    responseCount: 1,
    applicableCount: gap === null ? 0 : 1,
  };
}

function orgScore(): OrganisationMaturityScore {
  return {
    ...score(2, 4, 2),
    functions: [
      {
        functionId: 'fn-critical',
        ...score(1, 5, 4), // gap 4 -> CRITICAL
        categories: [
          {
            categoryId: 'cat-medium',
            ...score(2, 3, 1), // gap 1 -> MEDIUM
            subcategories: [
              { subcategoryId: 'sub-low', ...score(3, 3.5, 0.5) }, // gap 0.5 -> LOW
            ],
          },
        ],
      },
      {
        functionId: 'fn-minimal',
        ...score(5, 4, -1), // already above target -> MINIMAL
        categories: [],
      },
      {
        functionId: 'fn-unscored',
        ...score(null, null, null), // nothing applicable
        categories: [],
      },
    ],
  };
}

describe('identifyGaps', () => {
  it('assigns risk levels by gap magnitude', () => {
    const gaps = identifyGaps(orgScore(), { levels: ['function'] });
    const byId = Object.fromEntries(gaps.map((g) => [g.id, g.riskLevel]));

    expect(byId['fn-critical']).toBe(RiskLevel.CRITICAL);
    expect(byId['fn-minimal']).toBe(RiskLevel.MINIMAL);
    expect(byId['fn-unscored']).toBe(RiskLevel.MINIMAL);
  });

  it('sorts largest gap first, with unscored (null-gap) entries last', () => {
    const gaps = identifyGaps(orgScore(), { levels: ['function'] });
    expect(gaps.map((g) => g.id)).toEqual(['fn-critical', 'fn-minimal', 'fn-unscored']);
  });

  it('filters to the requested levels only', () => {
    const gaps = identifyGaps(orgScore(), { levels: ['subcategory'] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].id).toBe('sub-low');
    expect(gaps[0].riskLevel).toBe(RiskLevel.LOW);
  });

  it('includes function, category, and subcategory levels by default', () => {
    const gaps = identifyGaps(orgScore());
    expect(gaps.map((g) => g.level).sort()).toEqual(['category', 'function', 'function', 'function', 'subcategory']);
  });

  it('applies a minGap filter', () => {
    const gaps = identifyGaps(orgScore(), { levels: ['function'], minGap: 2 });
    expect(gaps.map((g) => g.id)).toEqual(['fn-critical']);
  });
});
