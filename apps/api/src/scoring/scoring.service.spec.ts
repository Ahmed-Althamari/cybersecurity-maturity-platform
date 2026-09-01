import { ScoringService } from './scoring.service';
import { PrismaService } from '../prisma/prisma.service';

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    currentMaturity: 'DEFINED',
    targetMaturity: 'MANAGED',
    weight: 1,
    question: {
      subcategory: {
        id: 'subcategory-1',
        category: { id: 'category-1', function: { id: 'function-1' } },
      },
    },
    ...overrides,
  };
}

describe('ScoringService', () => {
  let service: ScoringService;
  let prisma: { assessmentItem: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { assessmentItem: { findMany: jest.fn() } };
    service = new ScoringService(prisma as unknown as PrismaService);
  });

  describe('computeAssessmentScore', () => {
    it('maps each item onto its Function/Category/Subcategory and aggregates', async () => {
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        item({ currentMaturity: 'INITIAL', targetMaturity: 'DEFINED' }),
        item({ currentMaturity: 'OPTIMISED', targetMaturity: 'OPTIMISED' }),
      ]);

      const score = await service.computeAssessmentScore('assessment-1');

      expect(prisma.assessmentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assessmentId: 'assessment-1' } }),
      );
      expect(score.functions).toHaveLength(1);
      expect(score.functions[0].functionId).toBe('function-1');
      expect(score.currentScore).toBe(3); // avg(1, 5)
    });

    it('returns an empty, null-scored hierarchy for an assessment with no items', async () => {
      prisma.assessmentItem.findMany.mockResolvedValueOnce([]);

      const score = await service.computeAssessmentScore('assessment-1');

      expect(score.functions).toEqual([]);
      expect(score.currentScore).toBeNull();
    });
  });

  describe('computeGapAnalysis', () => {
    it('pairs the score with a gap list derived from the same data', async () => {
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        item({ currentMaturity: 'INITIAL', targetMaturity: 'OPTIMISED' }),
      ]);

      const { score, gaps } = await service.computeGapAnalysis('assessment-1', { levels: ['function'] });

      expect(score.functions[0].gap).toBe(4);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].id).toBe('function-1');
    });
  });
});
