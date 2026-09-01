import { MaturityLevel } from '@cmmp/shared';
import { aggregateHierarchy, scoreResponses } from './aggregate';
import type { ScoredResponse } from './types';

function response(overrides: Partial<ScoredResponse> = {}): ScoredResponse {
  return {
    subcategoryId: 'sub-1',
    categoryId: 'cat-1',
    functionId: 'fn-1',
    currentMaturity: MaturityLevel.DEFINED,
    targetMaturity: MaturityLevel.MANAGED,
    ...overrides,
  };
}

describe('scoreResponses', () => {
  it('computes an equal-weight average of current and target scores', () => {
    const score = scoreResponses([
      response({ currentMaturity: MaturityLevel.INITIAL, targetMaturity: MaturityLevel.DEFINED }),
      response({ currentMaturity: MaturityLevel.DEVELOPING, targetMaturity: MaturityLevel.MANAGED }),
    ]);

    expect(score.currentScore).toBe(1.5); // avg(1, 2)
    expect(score.targetScore).toBe(3.5); // avg(3, 4)
    expect(score.gap).toBe(2);
    expect(score.applicableCount).toBe(2);
    expect(score.responseCount).toBe(2);
  });

  it('weighs heavier items more', () => {
    const score = scoreResponses([
      response({ currentMaturity: MaturityLevel.INITIAL, weight: 3 }),
      response({ currentMaturity: MaturityLevel.OPTIMISED, weight: 1 }),
    ]);

    // (1*3 + 5*1) / 4 = 2
    expect(score.currentScore).toBe(2);
  });

  it('excludes NOT_APPLICABLE responses from scoring entirely, on both axes', () => {
    const score = scoreResponses([
      response({ currentMaturity: MaturityLevel.NOT_APPLICABLE, targetMaturity: MaturityLevel.DEFINED }),
    ]);

    expect(score.currentScore).toBeNull();
    expect(score.targetScore).toBeNull(); // not the schema-default DEFINED leaking through
    expect(score.gap).toBeNull();
    expect(score.applicableCount).toBe(0);
    expect(score.responseCount).toBe(1);
  });

  it('returns nulls for an empty response list rather than throwing', () => {
    const score = scoreResponses([]);
    expect(score.currentScore).toBeNull();
    expect(score.targetScore).toBeNull();
    expect(score.responseCount).toBe(0);
  });

  it('never lets an unassessed item (schema defaults) skew the target average', () => {
    // currentMaturity defaults to NOT_APPLICABLE, targetMaturity defaults to DEFINED (3)
    // for a freshly-seeded, never-touched AssessmentItem.
    const untouched = response({
      currentMaturity: MaturityLevel.NOT_APPLICABLE,
      targetMaturity: MaturityLevel.DEFINED,
    });
    const assessed = response({
      currentMaturity: MaturityLevel.OPTIMISED,
      targetMaturity: MaturityLevel.OPTIMISED,
    });

    const score = scoreResponses([untouched, assessed]);
    expect(score.targetScore).toBe(5); // only the assessed item's target counts
  });
});

describe('aggregateHierarchy', () => {
  it('rolls subcategory scores up through category and function to an org-wide score', () => {
    const responses: ScoredResponse[] = [
      response({
        subcategoryId: 'GV.RM-01',
        categoryId: 'GV.RM',
        functionId: 'GV',
        currentMaturity: MaturityLevel.INITIAL,
        targetMaturity: MaturityLevel.DEFINED,
      }),
      response({
        subcategoryId: 'GV.RM-02',
        categoryId: 'GV.RM',
        functionId: 'GV',
        currentMaturity: MaturityLevel.DEVELOPING,
        targetMaturity: MaturityLevel.DEFINED,
      }),
      response({
        subcategoryId: 'ID.AM-01',
        categoryId: 'ID.AM',
        functionId: 'ID',
        currentMaturity: MaturityLevel.OPTIMISED,
        targetMaturity: MaturityLevel.OPTIMISED,
      }),
    ];

    const org = aggregateHierarchy(responses);

    expect(org.functions.map((f) => f.functionId)).toEqual(['GV', 'ID']);
    const gv = org.functions.find((f) => f.functionId === 'GV')!;
    expect(gv.categories).toHaveLength(1);
    expect(gv.categories[0].subcategories).toHaveLength(2);
    expect(gv.currentScore).toBe(1.5); // avg(1, 2)

    const id = org.functions.find((f) => f.functionId === 'ID')!;
    expect(id.currentScore).toBe(5);

    // org-wide is a weighted rollup of function scores, not a flat average
    // of all raw responses, so it lands strictly between the two functions.
    expect(org.currentScore).not.toBeNull();
    expect(org.currentScore!).toBeGreaterThan(1.5);
    expect(org.currentScore!).toBeLessThan(5);
    expect(org.responseCount).toBe(3);
    expect(org.applicableCount).toBe(3);
  });

  it('excludes a fully NOT_APPLICABLE subcategory from its category rollup', () => {
    const responses: ScoredResponse[] = [
      response({
        subcategoryId: 'sub-na',
        categoryId: 'cat-1',
        functionId: 'fn-1',
        currentMaturity: MaturityLevel.NOT_APPLICABLE,
      }),
      response({
        subcategoryId: 'sub-scored',
        categoryId: 'cat-1',
        functionId: 'fn-1',
        currentMaturity: MaturityLevel.OPTIMISED,
        targetMaturity: MaturityLevel.OPTIMISED,
      }),
    ];

    const org = aggregateHierarchy(responses);
    const category = org.functions[0].categories[0];

    expect(category.currentScore).toBe(5); // the N/A subcategory contributes zero weight, not a zero score
    expect(category.applicableCount).toBe(1);
  });

  it('returns an empty hierarchy for no responses', () => {
    const org = aggregateHierarchy([]);
    expect(org.functions).toEqual([]);
    expect(org.currentScore).toBeNull();
  });
});
