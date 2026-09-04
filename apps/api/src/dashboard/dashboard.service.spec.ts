import { NotFoundException } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

import { DashboardService } from './dashboard.service';

type MockModel = Record<string, jest.Mock>;

const scoredResults = {
  assessmentId: 'a1',
  status: 'SUBMITTED',
  completionPercentage: 80,
  overall: { current: 2.5, target: 4, gap: 1.5, itemCount: 2, applicableCount: 2 },
  functions: [
    { code: 'GV', label: 'Govern', depth: 0, score: { current: 2, target: 4, gap: 2, itemCount: 1, applicableCount: 1 }, children: [] },
    { code: 'ID', label: 'Identify', depth: 0, score: { current: 3, target: 4, gap: 1, itemCount: 1, applicableCount: 1 }, children: [] },
  ],
};

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    organisation: MockModel;
    assessment: MockModel;
    assessmentItem: MockModel;
    assessmentTemplate: MockModel;
    assessmentQuestion: MockModel;
    assessmentHistory: MockModel;
    risk: MockModel;
    remediationInitiative: MockModel;
  };
  let assessmentsService: { getResults: jest.Mock };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      assessment: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      assessmentItem: { count: jest.fn(), findMany: jest.fn() },
      assessmentTemplate: { findUnique: jest.fn() },
      assessmentQuestion: { findMany: jest.fn() },
      assessmentHistory: { findMany: jest.fn() },
      risk: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
      remediationInitiative: { count: jest.fn(), findMany: jest.fn() },
    };
    assessmentsService = { getResults: jest.fn() };

    service = new DashboardService(prisma as unknown as PrismaService, assessmentsService as unknown as AssessmentsService);
  });

  describe('resolveAssessment (via getMaturityOverview)', () => {
    it('404s when the organisation does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(service.getMaturityOverview('tenant-a', 'org-a')).rejects.toThrow(NotFoundException);
    });

    it('prefers the latest SUBMITTED assessment when none is specified', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.count.mockResolvedValueOnce(0);
      prisma.risk.count.mockResolvedValueOnce(0);
      prisma.remediationInitiative.count.mockResolvedValueOnce(0);

      await service.getMaturityOverview('tenant-a', 'org-a');

      expect(prisma.assessment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'SUBMITTED' }) }),
      );
    });

    it('404s an explicit assessmentId that does not belong to the organisation', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce(null);

      await expect(service.getMaturityOverview('tenant-a', 'org-a', 'foreign-assessment')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMaturityOverview', () => {
    it('assembles the overview from scoring results plus risk/remediation counts', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.count.mockResolvedValueOnce(3);
      prisma.risk.count.mockResolvedValueOnce(2);
      prisma.remediationInitiative.count.mockResolvedValueOnce(4);

      const overview = await service.getMaturityOverview('tenant-a', 'org-a');

      expect(overview).toEqual({
        assessmentId: 'a1',
        assessmentIds: ['a1'],
        combined: false,
        overallMaturity: 2.5,
        targetMaturity: 4,
        maturityGap: 1.5,
        completionPercentage: 80,
        criticalGaps: 3,
        highRiskFindings: 2,
        openRemediationActions: 4,
      });
    });
  });

  describe('getMaturityOverview — multi-assessment rollup', () => {
    const assessmentB = {
      ...scoredResults,
      assessmentId: 'a2',
      completionPercentage: 40,
      overall: { current: 4, target: 5, gap: 1, itemCount: 1, applicableCount: 1 },
    };

    it('combines every SUBMITTED/APPROVED assessment for the org, weighted by applicableCount, when more than one exists', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findMany.mockResolvedValueOnce([
        { id: 'a1', templateId: 'template-1', status: 'SUBMITTED' },
        { id: 'a2', templateId: 'template-1', status: 'APPROVED' },
      ]);
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults).mockResolvedValueOnce(assessmentB);
      prisma.assessmentItem.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      prisma.risk.count.mockResolvedValueOnce(0);
      prisma.remediationInitiative.count.mockResolvedValueOnce(0);

      const overview = await service.getMaturityOverview('tenant-a', 'org-a');

      expect(overview.combined).toBe(true);
      expect(overview.assessmentIds).toEqual(['a1', 'a2']);
      expect(overview.assessmentId).toBe('a1');
      // weighted average of current (2.5, weight 2) and (4, weight 1): (2.5*2 + 4*1) / 3 = 3
      expect(overview.overallMaturity).toBe(3);
      // criticalGaps summed across both assessments, not just the first
      expect(overview.criticalGaps).toBe(3);
      // never combines DRAFT/IN_PROGRESS/ARCHIVED assessments into the rollup
      expect(prisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { in: ['SUBMITTED', 'APPROVED'] } }) }),
      );
    });

    it('picks the most substantive assessment as "primary" (for the detail-view drill-down), not just the first one returned', async () => {
      // a1 is listed FIRST by the DB query but has fewer applicable items than a2 — the primary
      // pick must look at substance, not array position, or a near-empty assessment could "win"
      // over a mostly-complete one just because it sorted first.
      const tinyAssessment = { ...scoredResults, overall: { current: 5, target: 5, gap: 0, itemCount: 1, applicableCount: 1 } };
      const substantialAssessment = { ...assessmentB, overall: { current: 2.5, target: 4, gap: 1.5, itemCount: 100, applicableCount: 100 } };

      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findMany.mockResolvedValueOnce([
        { id: 'tiny', templateId: 'template-1', status: 'SUBMITTED' },
        { id: 'substantial', templateId: 'template-1', status: 'SUBMITTED' },
      ]);
      assessmentsService.getResults.mockResolvedValueOnce(tinyAssessment).mockResolvedValueOnce(substantialAssessment);
      prisma.assessmentItem.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.risk.count.mockResolvedValueOnce(0);
      prisma.remediationInitiative.count.mockResolvedValueOnce(0);

      const overview = await service.getMaturityOverview('tenant-a', 'org-a');

      expect(overview.assessmentId).toBe('substantial');
    });

    it('falls back to the single-assessment behavior when only one active assessment exists', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findMany.mockResolvedValueOnce([{ id: 'a1', templateId: 'template-1', status: 'SUBMITTED' }]);
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.count.mockResolvedValueOnce(3);
      prisma.risk.count.mockResolvedValueOnce(2);
      prisma.remediationInitiative.count.mockResolvedValueOnce(4);

      const overview = await service.getMaturityOverview('tenant-a', 'org-a');

      expect(overview.combined).toBe(false);
      expect(overview.assessmentIds).toEqual(['a1']);
      expect(overview.overallMaturity).toBe(2.5);
      // single-active-assessment case never falls through to resolveAssessment's own DB call
      expect(prisma.assessment.findFirst).not.toHaveBeenCalled();
    });

    it('an explicit assessmentId always wins over the rollup, even when multiple active assessments exist', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.count.mockResolvedValueOnce(1);
      prisma.risk.count.mockResolvedValueOnce(0);
      prisma.remediationInitiative.count.mockResolvedValueOnce(0);

      const overview = await service.getMaturityOverview('tenant-a', 'org-a', 'a1');

      expect(overview.combined).toBe(false);
      expect(overview.assessmentIds).toEqual(['a1']);
      // an explicit assessmentId never even queries for other active assessments
      expect(prisma.assessment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFunctionMaturity', () => {
    it('computes per-function completion from real question totals, and highRiskGaps from flagged items', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { riskLevel: 'HIGH', question: { subcategory: { category: { function: { code: 'GV' } } } } },
      ]);
      prisma.assessmentTemplate.findUnique.mockResolvedValueOnce({ frameworkId: 'fw-a' });
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([
        { subcategory: { category: { function: { code: 'GV' } } } },
        { subcategory: { category: { function: { code: 'GV' } } } },
        { subcategory: { category: { function: { code: 'ID' } } } },
      ]);

      const result = await service.getFunctionMaturity('tenant-a', 'org-a');

      const gv = result.find((fn) => fn.code === 'GV')!;
      expect(gv.highRiskGaps).toBe(1);
      expect(gv.completionPercentage).toBe(50); // 1 answered / 2 total questions
      expect(gv.trend).toBeUndefined();

      const id = result.find((fn) => fn.code === 'ID')!;
      expect(id.completionPercentage).toBe(100); // 1 answered / 1 total question
    });

    it('computes trend only when an explicit compareToAssessmentId is given', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' }).mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst
        .mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' })
        .mockResolvedValueOnce({ id: 'a0', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults).mockResolvedValueOnce({
        ...scoredResults,
        functions: [{ ...scoredResults.functions[0], score: { ...scoredResults.functions[0].score, current: 1 } }],
      });
      prisma.assessmentItem.findMany.mockResolvedValueOnce([]);
      prisma.assessmentTemplate.findUnique.mockResolvedValueOnce({ frameworkId: 'fw-a' });
      prisma.assessmentQuestion.findMany.mockResolvedValueOnce([]);

      const result = await service.getFunctionMaturity('tenant-a', 'org-a', 'a1', 'a0');

      const gv = result.find((fn) => fn.code === 'GV')!;
      expect(gv.trend).toBe(1); // current 2 vs previous 1
    });
  });

  describe('getGapAnalysis', () => {
    it('returns function-level gaps sorted descending, with the worst risk level and affected-control count', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValueOnce(scoredResults);
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { riskLevel: 'MEDIUM', question: { subcategory: { category: { function: { code: 'GV' } } } } },
        { riskLevel: 'CRITICAL', question: { subcategory: { category: { function: { code: 'GV' } } } } },
        { riskLevel: 'LOW', question: { subcategory: { category: { function: { code: 'ID' } } } } },
      ]);

      const gaps = await service.getGapAnalysis('tenant-a', 'org-a', undefined, 10);

      expect(gaps.map((g) => g.functionCode)).toEqual(['GV', 'ID']); // GV gap=2 > ID gap=1
      expect(gaps[0].riskLevel).toBe('CRITICAL');
      expect(gaps[0].affectedControls).toBe(2);
    });
  });

  describe('getRiskSummary', () => {
    it('aggregates counts by risk level and returns the top risks by inherent score', async () => {
      prisma.risk.groupBy.mockResolvedValueOnce([
        { riskLevel: 'CRITICAL', _count: { _all: 2 } },
        { riskLevel: 'HIGH', _count: { _all: 3 } },
      ]);
      prisma.risk.findMany.mockResolvedValueOnce([{ id: 'r1' }]);

      const summary = await service.getRiskSummary('tenant-a', 'org-a', 5);

      expect(summary.countByLevel.CRITICAL).toBe(2);
      expect(summary.countByLevel.HIGH).toBe(3);
      expect(summary.countByLevel.LOW).toBe(0);
      expect(summary.totalOpen).toBe(5);
      expect(summary.topRisks).toEqual([{ id: 'r1' }]);
    });
  });

  describe('getRoadmapStatus', () => {
    it('buckets initiatives by timeline and flags overdue ones', async () => {
      const now = Date.now();
      const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

      prisma.remediationInitiative.findMany.mockResolvedValueOnce([
        { status: 'IN_PROGRESS', targetCompletionDate: days(-10) }, // overdue
        { status: 'PLANNED', targetCompletionDate: days(60) }, // ~2mo -> immediate
        { status: 'PLANNED', targetCompletionDate: days(150) }, // ~5mo -> short term
        { status: 'PLANNED', targetCompletionDate: days(300) }, // ~10mo -> medium term
        { status: 'PLANNED', targetCompletionDate: days(600) }, // ~20mo -> strategic
        { status: 'COMPLETED', targetCompletionDate: null }, // unscheduled, not overdue (completed)
      ]);

      const status = await service.getRoadmapStatus('tenant-a', 'org-a');

      expect(status.overdueCount).toBe(1);
      // The overdue item is also "immediate" by timeline (it's in the past, which is <= 3 months out).
      expect(status.buckets.IMMEDIATE).toHaveLength(2);
      expect(status.buckets.SHORT_TERM).toHaveLength(1);
      expect(status.buckets.MEDIUM_TERM).toHaveLength(1);
      expect(status.buckets.STRATEGIC).toHaveLength(1);
      expect(status.buckets.UNSCHEDULED).toHaveLength(1);
      expect(status.countByStatus.PLANNED).toBe(4);
    });
  });

  describe('getExecutiveSummary', () => {
    it('composes maturity, gaps, risks, roadmap, and real trend history in one response', async () => {
      prisma.organisation.findFirst.mockResolvedValue({ id: 'org-a' });
      prisma.assessment.findFirst.mockResolvedValue({ id: 'a1', templateId: 'template-1' });
      assessmentsService.getResults.mockResolvedValue(scoredResults);
      prisma.assessmentItem.count.mockResolvedValue(1);
      prisma.risk.count.mockResolvedValue(1);
      prisma.remediationInitiative.count.mockResolvedValue(1);
      prisma.assessmentItem.findMany.mockResolvedValue([]);
      prisma.risk.groupBy.mockResolvedValue([]);
      prisma.risk.findMany.mockResolvedValue([]);
      prisma.remediationInitiative.findMany.mockResolvedValue([]);
      prisma.assessmentHistory.findMany.mockResolvedValue([{ assessmentId: 'a1', version: 1, currentMaturity: 2.5, targetMaturity: 4 }]);

      const summary = await service.getExecutiveSummary('tenant-a', 'org-a');

      expect(summary.enterpriseMaturity).toBe(2.5);
      expect(summary.maturityTrend).toHaveLength(1);
      expect(summary.overdueHighRiskActions).toBe(1);
    });
  });
});
