import { NotFoundException } from '@nestjs/common';
import { InitiativesService } from './initiatives.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { ScoringService } from '../scoring/scoring.service';

function baseInitiative(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'initiative-1',
    tenantId: 'tenant-a',
    organisationId: 'org-1',
    title: 'Formalize risk management',
    status: 'PLANNED',
    priority: 3,
    targetCompletionDate: null,
    risks: [],
    ...overrides,
  };
}

describe('InitiativesService', () => {
  let service: InitiativesService;
  let prisma: {
    organisation: { findFirst: jest.Mock };
    remediationInitiative: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    risk: { findFirst: jest.Mock };
    assessmentItem: { findMany: jest.Mock };
  };
  let assessmentsService: { findOne: jest.Mock };
  let scoringService: { computeGapAnalysis: jest.Mock };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1', tenantId: 'tenant-a' }) },
      remediationInitiative: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      risk: { findFirst: jest.fn() },
      assessmentItem: { findMany: jest.fn() },
    };
    assessmentsService = {
      findOne: jest.fn().mockResolvedValue({ organisationId: 'org-1', name: 'Q3 Assessment' }),
    };
    scoringService = { computeGapAnalysis: jest.fn() };

    service = new InitiativesService(
      prisma as unknown as PrismaService,
      assessmentsService as unknown as AssessmentsService,
      scoringService as unknown as ScoringService,
    );
  });

  describe('create', () => {
    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create('tenant-a', { organisationId: 'org-x', title: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.remediationInitiative.create).not.toHaveBeenCalled();
    });

    it('creates the initiative scoped to the tenant', async () => {
      prisma.remediationInitiative.create.mockResolvedValueOnce(baseInitiative());
      await service.create('tenant-a', { organisationId: 'org-1', title: 'x' } as any);
      expect(prisma.remediationInitiative.create.mock.calls[0][0].data.tenantId).toBe('tenant-a');
    });
  });

  describe('tenant isolation', () => {
    it('scopes findAll to the tenant and defaults to priority-ascending order', async () => {
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');
      expect(prisma.remediationInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', deletedAt: null }),
          orderBy: { priority: 'asc' },
        }),
      );
    });

    it('never returns an initiative from another tenant', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('tenant-b', 'initiative-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('risk linking', () => {
    it('links a risk that belongs to the tenant', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValue(baseInitiative());
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1' });

      await service.linkRisk('tenant-a', 'initiative-1', 'risk-1');

      expect(prisma.remediationInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { risks: { connect: { id: 'risk-1' } } } }),
      );
    });

    it('rejects linking a risk from another tenant', async () => {
      prisma.remediationInitiative.findFirst.mockResolvedValue(baseInitiative());
      prisma.risk.findFirst.mockResolvedValueOnce(null);
      await expect(service.linkRisk('tenant-a', 'initiative-1', 'risk-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTimeline', () => {
    function daysFromNow(days: number) {
      return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    it('buckets initiatives by how far out their target completion date is', async () => {
      prisma.remediationInitiative.findMany.mockResolvedValueOnce([
        baseInitiative({ id: 'soon', targetCompletionDate: daysFromNow(30) }),
        baseInitiative({ id: 'mid', targetCompletionDate: daysFromNow(150) }),
        baseInitiative({ id: 'far', targetCompletionDate: daysFromNow(300) }),
        baseInitiative({ id: 'very-far', targetCompletionDate: daysFromNow(500) }),
        baseInitiative({ id: 'unscheduled', targetCompletionDate: null }),
        baseInitiative({ id: 'done', status: 'COMPLETED', targetCompletionDate: daysFromNow(10) }),
      ]);

      const timeline = await service.getTimeline('tenant-a');

      expect(timeline.next3Months.map((i: any) => i.id)).toEqual(['soon']);
      expect(timeline.next6Months.map((i: any) => i.id)).toEqual(['mid']);
      expect(timeline.next12Months.map((i: any) => i.id)).toEqual(['far']);
      expect(timeline.beyondOrUnscheduled.map((i: any) => i.id)).toEqual([
        'very-far',
        'unscheduled',
        'done',
      ]);
    });
  });

  describe('generateFromGaps', () => {
    it('creates one initiative per eligible gap with priority/complexity/dates derived from it', async () => {
      scoringService.computeGapAnalysis.mockResolvedValueOnce({
        score: {},
        gaps: [
          { level: 'function', id: 'fn-gv', currentScore: 1, targetScore: 4, gap: 3, riskLevel: 'CRITICAL' },
          { level: 'function', id: 'fn-id', currentScore: 3, targetScore: 4, gap: 1, riskLevel: 'LOW' },
        ],
      });
      prisma.assessmentItem.findMany.mockResolvedValueOnce([
        { question: { subcategory: { category: { function: { id: 'fn-gv', name: 'Govern' } } } } },
        { question: { subcategory: { category: { function: { id: 'fn-id', name: 'Identify' } } } } },
      ]);
      prisma.remediationInitiative.create
        .mockResolvedValueOnce(baseInitiative({ id: 'gen-1' }))
        .mockResolvedValueOnce(baseInitiative({ id: 'gen-2' }));

      const created = await service.generateFromGaps('tenant-a', 'assessment-1');

      expect(created).toHaveLength(2);
      const [gvCall, idCall] = prisma.remediationInitiative.create.mock.calls.map((c) => c[0].data);
      expect(gvCall.title).toBe('Improve Govern maturity');
      expect(gvCall.priority).toBe(1); // CRITICAL
      expect(gvCall.complexity).toBe(4); // gap >= 3
      expect(gvCall.currentMaturity).toBe('INITIAL');
      expect(gvCall.targetMaturity).toBe('MANAGED');

      expect(idCall.title).toBe('Improve Identify maturity');
      expect(idCall.priority).toBe(4); // LOW
      expect(idCall.complexity).toBe(2); // gap >= 1
    });

    it('excludes gaps below the minGap threshold', async () => {
      scoringService.computeGapAnalysis.mockResolvedValueOnce({
        score: {},
        gaps: [{ level: 'function', id: 'fn-gv', currentScore: 3, targetScore: 3.2, gap: 0.2, riskLevel: 'MINIMAL' }],
      });
      prisma.assessmentItem.findMany.mockResolvedValueOnce([]);

      const created = await service.generateFromGaps('tenant-a', 'assessment-1', 0.5);

      expect(created).toHaveLength(0);
      expect(prisma.remediationInitiative.create).not.toHaveBeenCalled();
    });
  });
});
