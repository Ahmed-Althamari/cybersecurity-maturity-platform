import { BadRequestException, NotFoundException } from '@nestjs/common';

import { FrameworkService } from '../framework/framework.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

import { AssessmentsService } from './assessments.service';

function frameworkTree() {
  return {
    id: 'framework-1',
    tenantId: 'tenant-a',
    name: 'NIST Cybersecurity Framework',
    slug: 'nist-csf',
    version: '2.0',
    frameworkType: 'NIST_CSF',
    description: null,
    isActive: true,
    functions: [
      {
        id: 'function-1',
        code: 'GV',
        name: 'Govern',
        description: null,
        displayOrder: 0,
        categories: [
          {
            id: 'category-1',
            code: 'GV.RM',
            name: 'Risk Management',
            description: null,
            displayOrder: 0,
            subcategories: [
              {
                id: 'subcategory-1',
                code: 'GV.RM-01',
                name: 'Risk objectives',
                description: null,
                displayOrder: 0,
                questions: [
                  { id: 'question-1', question: 'Q1?', guidance: null, examples: null, referenceLinks: null },
                ],
              },
              {
                id: 'subcategory-2',
                code: 'GV.RM-02',
                name: 'Risk appetite',
                description: null,
                displayOrder: 1,
                questions: [
                  { id: 'question-2', question: 'Q2?', guidance: null, examples: null, referenceLinks: null },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function baseAssessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assessment-1',
    tenantId: 'tenant-a',
    organisationId: 'org-1',
    name: 'Q1 Assessment',
    description: null,
    status: 'DRAFT',
    assessmentDate: new Date('2026-01-01'),
    completionPercentage: 0,
    currentMaturity: null,
    targetMaturity: null,
    maturityGap: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [],
    ...overrides,
  };
}

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let prisma: {
    organisation: any;
    assessment: any;
    assessmentItem: any;
    assessmentHistory: any;
    $transaction: any;
  };
  let frameworkService: { getTree: jest.Mock };
  let scoringService: { computeAssessmentScore: jest.Mock; computeGapAnalysis: jest.Mock };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      assessment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      assessmentItem: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      assessmentHistory: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    frameworkService = { getTree: jest.fn() };
    scoringService = {
      computeAssessmentScore: jest.fn().mockResolvedValue({
        currentScore: null,
        targetScore: null,
        gap: null,
        currentLevel: null,
        targetLevel: null,
        responseCount: 0,
        applicableCount: 0,
        functions: [],
      }),
      computeGapAnalysis: jest.fn(),
    };

    service = new AssessmentsService(
      prisma as unknown as PrismaService,
      frameworkService as unknown as FrameworkService,
      scoringService as unknown as ScoringService,
    );
  });

  describe('create', () => {
    it('seeds one AssessmentItem per question in the loaded framework tree', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-1', tenantId: 'tenant-a' });
      frameworkService.getTree.mockResolvedValueOnce(frameworkTree());
      prisma.assessment.create.mockResolvedValueOnce(baseAssessment());
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment());

      await service.create('tenant-a', 'user-1', {
        organisationId: 'org-1',
        frameworkSlug: 'nist-csf',
        name: 'Q1 Assessment',
        assessmentDate: new Date('2026-01-01'),
      } as any);

      expect(frameworkService.getTree).toHaveBeenCalledWith('tenant-a', 'nist-csf', undefined);
      const createManyArgs = prisma.assessmentItem.createMany.mock.calls[0][0];
      expect(createManyArgs.data).toEqual([
        { assessmentId: 'assessment-1', questionId: 'question-1' },
        { assessmentId: 'assessment-1', questionId: 'question-2' },
      ]);
      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1, status: 'DRAFT' }) }),
      );
    });

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.create('tenant-a', 'user-1', {
          organisationId: 'org-from-other-tenant',
          frameworkSlug: 'nist-csf',
          name: 'x',
          assessmentDate: new Date(),
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(frameworkService.getTree).not.toHaveBeenCalled();
    });

    it('rejects a framework with no assessment questions', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-1', tenantId: 'tenant-a' });
      frameworkService.getTree.mockResolvedValueOnce({ ...frameworkTree(), functions: [] });

      await expect(
        service.create('tenant-a', 'user-1', {
          organisationId: 'org-1',
          frameworkSlug: 'empty-framework',
          name: 'x',
          assessmentDate: new Date(),
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.assessment.create).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('scopes findAll to the requesting tenant', async () => {
      prisma.assessment.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');

      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-a', organisationId: undefined, deletedAt: null },
        }),
      );
    });

    it('never returns an assessment belonging to another tenant', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('tenant-b', 'assessment-1')).rejects.toThrow(NotFoundException);
      expect(prisma.assessment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }) }),
      );
    });
  });

  describe('editing guard', () => {
    it.each(['SUBMITTED', 'APPROVED', 'ARCHIVED'])(
      'rejects updates while status is %s',
      async (status) => {
        prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status }));
        await expect(
          service.update('tenant-a', 'user-1', 'assessment-1', { name: 'renamed' }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('allows updates while DRAFT or IN_PROGRESS', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'IN_PROGRESS' }));
      await service.update('tenant-a', 'user-1', 'assessment-1', { name: 'renamed' });
      expect(prisma.assessment.update).toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('updates the item, auto-transitions DRAFT to IN_PROGRESS, and recalculates completion', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'DRAFT' }));
      prisma.assessmentItem.findFirst.mockResolvedValueOnce({ id: 'item-1', assessmentId: 'assessment-1' });
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce({ version: 1 });
      prisma.assessmentItem.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await service.updateItem('tenant-a', 'user-1', 'assessment-1', 'item-1', {
        controlStatus: 'IN_PROGRESS',
      } as any);

      expect(prisma.assessmentItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' } }),
      );
      expect(prisma.assessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 2, status: 'IN_PROGRESS' }) }),
      );
      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ completionPercentage: 50 }) }),
      );
    });

    it('rejects an item that does not belong to the assessment', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'IN_PROGRESS' }));
      prisma.assessmentItem.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateItem('tenant-a', 'user-1', 'assessment-1', 'wrong-item', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('persists the recomputed maturity score alongside completion', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'IN_PROGRESS' }));
      prisma.assessmentItem.findFirst.mockResolvedValueOnce({ id: 'item-1', assessmentId: 'assessment-1' });
      prisma.assessmentItem.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      scoringService.computeAssessmentScore.mockResolvedValueOnce({
        currentScore: 2.5,
        targetScore: 4,
        gap: 1.5,
        currentLevel: null,
        targetLevel: null,
        responseCount: 2,
        applicableCount: 2,
        functions: [],
      });

      await service.updateItem('tenant-a', 'user-1', 'assessment-1', 'item-1', {
        currentMaturity: 'DEVELOPING',
      } as any);

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentMaturity: 2.5, targetMaturity: 4, maturityGap: 1.5 }),
        }),
      );
    });
  });

  describe('workflow transitions', () => {
    it('rejects submit when the assessment is not 100% complete', async () => {
      prisma.assessment.findFirst.mockResolvedValue(
        baseAssessment({ status: 'IN_PROGRESS', completionPercentage: 80 }),
      );

      await expect(service.submit('tenant-a', 'user-1', 'assessment-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('submits a fully-completed IN_PROGRESS assessment', async () => {
      prisma.assessment.findFirst.mockResolvedValue(
        baseAssessment({ status: 'IN_PROGRESS', completionPercentage: 100 }),
      );
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce({ version: 1 });

      await service.submit('tenant-a', 'user-1', 'assessment-1');

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
      );
    });

    it('rejects an illegal transition (e.g. archived -> anything)', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'ARCHIVED' }));

      await expect(service.reopen('tenant-a', 'user-1', 'assessment-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approves a submitted assessment', async () => {
      prisma.assessment.findFirst.mockResolvedValue(baseAssessment({ status: 'SUBMITTED' }));
      prisma.assessmentHistory.findFirst.mockResolvedValueOnce({ version: 2 });

      await service.approve('tenant-a', 'user-1', 'assessment-1');

      expect(prisma.assessment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
      );
    });
  });

  describe('getHistory', () => {
    it('returns history ordered by version', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment());
      prisma.assessmentHistory.findMany.mockResolvedValueOnce([{ version: 1 }, { version: 2 }]);

      const history = await service.getHistory('tenant-a', 'assessment-1');

      expect(prisma.assessmentHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { version: 'asc' } }),
      );
      expect(history).toHaveLength(2);
    });
  });

  describe('getScores', () => {
    it('verifies tenant ownership before delegating to ScoringService', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(baseAssessment());
      scoringService.computeGapAnalysis.mockResolvedValueOnce({ score: {}, gaps: [] });

      const result = await service.getScores('tenant-a', 'assessment-1', { levels: ['function'] });

      expect(scoringService.computeGapAnalysis).toHaveBeenCalledWith('assessment-1', {
        levels: ['function'],
      });
      expect(result).toEqual({ score: {}, gaps: [] });
    });

    it('never computes scores for an assessment belonging to another tenant', async () => {
      prisma.assessment.findFirst.mockResolvedValueOnce(null);

      await expect(service.getScores('tenant-b', 'assessment-1')).rejects.toThrow(NotFoundException);
      expect(scoringService.computeGapAnalysis).not.toHaveBeenCalled();
    });
  });
});
