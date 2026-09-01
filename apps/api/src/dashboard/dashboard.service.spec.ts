import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { ScoringService } from '../scoring/scoring.service';

function scoreTree() {
  return {
    currentScore: 2.5,
    targetScore: 4,
    gap: 1.5,
    currentLevel: null,
    targetLevel: null,
    responseCount: 2,
    applicableCount: 2,
    functions: [
      {
        functionId: 'fn-gv',
        currentScore: 2,
        targetScore: 4,
        gap: 2,
        currentLevel: null,
        targetLevel: null,
        responseCount: 1,
        applicableCount: 1,
        categories: [
          {
            categoryId: 'cat-rm',
            currentScore: 2,
            targetScore: 4,
            gap: 2,
            currentLevel: null,
            targetLevel: null,
            responseCount: 1,
            applicableCount: 1,
            subcategories: [
              {
                subcategoryId: 'sub-rm-01',
                currentScore: 2,
                targetScore: 4,
                gap: 2,
                currentLevel: null,
                targetLevel: null,
                responseCount: 1,
                applicableCount: 1,
              },
            ],
          },
        ],
      },
      {
        functionId: 'fn-id',
        currentScore: 3,
        targetScore: 4,
        gap: 1,
        currentLevel: null,
        targetLevel: null,
        responseCount: 1,
        applicableCount: 1,
        categories: [],
      },
    ],
  };
}

function functionMetadataRows() {
  return [
    {
      question: {
        subcategory: {
          category: { function: { id: 'fn-gv', code: 'GV', name: 'Govern', displayOrder: 0 } },
        },
      },
    },
    {
      question: {
        subcategory: {
          category: { function: { id: 'fn-id', code: 'ID', name: 'Identify', displayOrder: 1 } },
        },
      },
    },
  ];
}

function completionRows() {
  return [
    { controlStatus: 'COMPLETED', question: { subcategory: { category: { functionId: 'fn-gv' } } } },
    { controlStatus: 'NOT_STARTED', question: { subcategory: { category: { functionId: 'fn-id' } } } },
  ];
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    assessmentItem: { findMany: jest.Mock };
    risk: { findMany: jest.Mock };
    remediationInitiative: { findMany: jest.Mock };
  };
  let assessmentsService: { findOne: jest.Mock };
  let scoringService: { computeGapAnalysis: jest.Mock };

  beforeEach(() => {
    prisma = {
      assessmentItem: { findMany: jest.fn() },
      risk: { findMany: jest.fn().mockResolvedValue([]) },
      remediationInitiative: { findMany: jest.fn().mockResolvedValue([]) },
    };
    assessmentsService = {
      findOne: jest.fn().mockResolvedValue({ id: 'assessment-1', completionPercentage: 80 }),
    };
    scoringService = {
      computeGapAnalysis: jest.fn().mockResolvedValue({
        score: scoreTree(),
        gaps: [
          { level: 'subcategory', id: 'sub-rm-01', currentScore: 2, targetScore: 4, gap: 2, riskLevel: 'HIGH' },
        ],
      }),
    };

    service = new DashboardService(
      prisma as unknown as PrismaService,
      assessmentsService as unknown as AssessmentsService,
      scoringService as unknown as ScoringService,
    );
  });

  describe('getMaturityOverview', () => {
    it('combines the org-wide score, completion, and open risk/remediation counts', async () => {
      prisma.risk.findMany.mockResolvedValueOnce([
        { id: 'r1', title: 'x', riskLevel: 'CRITICAL', status: 'OPEN', likelihood: 4, impact: 4 },
        { id: 'r2', title: 'y', riskLevel: 'HIGH', status: 'CLOSED', likelihood: 3, impact: 3 },
      ]);
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([
        { id: 'i1', title: 'z', priority: 1, complexity: 1, currentMaturity: 'INITIAL', targetMaturity: 'DEFINED', status: 'PLANNED' },
      ]);

      const overview = await service.getMaturityOverview('tenant-a', 'assessment-1');

      expect(overview.overallMaturity).toBe(2.5);
      expect(overview.completionPercentage).toBe(80);
      expect(overview.criticalGaps).toBe(0); // the one gap fixture is HIGH, not CRITICAL
      expect(overview.highRiskFindings).toBe(1); // only the OPEN critical risk counts, not the CLOSED high one
      expect(overview.openRemediationActions).toBe(1);
    });

    it('scopes risk and remediation queries to the requesting tenant and this assessment', async () => {
      await service.getMaturityOverview('tenant-a', 'assessment-1');

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', assessmentItem: { assessmentId: 'assessment-1' } }),
        }),
      );
    });
  });

  describe('getFunctionMaturity', () => {
    it('enriches each function score with its code/name/displayOrder and completion percentage', async () => {
      prisma.assessmentItem.findMany
        .mockResolvedValueOnce(functionMetadataRows())
        .mockResolvedValueOnce(completionRows());

      const functions = await service.getFunctionMaturity('tenant-a', 'assessment-1');

      expect(functions).toEqual([
        expect.objectContaining({ code: 'GV', name: 'Govern', currentMaturity: 2, completionPercentage: 100 }),
        expect.objectContaining({ code: 'ID', name: 'Identify', currentMaturity: 3, completionPercentage: 0 }),
      ]);
      // sorted by displayOrder, and displayOrder itself is not leaked into the response shape
      expect(functions[0]).not.toHaveProperty('displayOrder');
    });

    it('attributes a high/critical subcategory gap to the function that owns it', async () => {
      prisma.assessmentItem.findMany
        .mockResolvedValueOnce(functionMetadataRows())
        .mockResolvedValueOnce(completionRows());

      const functions = await service.getFunctionMaturity('tenant-a', 'assessment-1');
      const gv = functions.find((f) => f.code === 'GV')!;
      const id = functions.find((f) => f.code === 'ID')!;

      expect(gv.highRiskGaps).toBe(1); // sub-rm-01 belongs to fn-gv and is a HIGH gap
      expect(id.highRiskGaps).toBe(0);
    });
  });

  describe('getGapAnalysis', () => {
    it('maps function-level gaps to the shared GapAnalysis shape with an affectedControls count', async () => {
      scoringService.computeGapAnalysis.mockResolvedValueOnce({
        score: scoreTree(),
        gaps: [{ level: 'function', id: 'fn-gv', currentScore: 2, targetScore: 4, gap: 2, riskLevel: 'HIGH' }],
      });
      prisma.assessmentItem.findMany.mockResolvedValueOnce(functionMetadataRows());

      const [entry] = await service.getGapAnalysis('tenant-a', 'assessment-1');

      expect(entry).toEqual({
        functionCode: 'GV',
        functionName: 'Govern',
        currentMaturity: 2,
        targetMaturity: 4,
        gap: 2,
        riskLevel: 'HIGH',
        affectedControls: 1, // sub-rm-01 under fn-gv has gap > 0
      });
    });
  });

  describe('getRoadmapStatus', () => {
    it('sorts upcoming (non-completed) initiatives by nearest due date', async () => {
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([
        { id: 'later', title: 'later', priority: 1, complexity: 1, currentMaturity: 'INITIAL', targetMaturity: 'DEFINED', status: 'PLANNED', targetCompletionDate: new Date('2027-01-01') },
        { id: 'sooner', title: 'sooner', priority: 1, complexity: 1, currentMaturity: 'INITIAL', targetMaturity: 'DEFINED', status: 'IN_PROGRESS', targetCompletionDate: new Date('2026-06-01') },
        { id: 'done', title: 'done', priority: 1, complexity: 1, currentMaturity: 'DEFINED', targetMaturity: 'DEFINED', status: 'COMPLETED', targetCompletionDate: new Date('2026-01-01') },
      ]);

      const status = await service.getRoadmapStatus('tenant-a', 'assessment-1');

      expect(status.totalInitiatives).toBe(3);
      expect(status.upcoming.map((i) => i.id)).toEqual(['sooner', 'later']);
      expect(status.byStatus).toEqual({ PLANNED: 1, IN_PROGRESS: 1, COMPLETED: 1 });
    });
  });

  describe('getExecutiveDashboard', () => {
    it('assembles every section into one payload', async () => {
      prisma.assessmentItem.findMany.mockResolvedValue(functionMetadataRows());

      const dashboard = await service.getExecutiveDashboard('tenant-a', 'assessment-1');

      expect(dashboard).toHaveProperty('maturityOverview');
      expect(dashboard).toHaveProperty('functionMaturity');
      expect(dashboard).toHaveProperty('topGaps');
      expect(dashboard).toHaveProperty('riskSummary');
      expect(dashboard).toHaveProperty('roadmapStatus');
    });
  });
});
