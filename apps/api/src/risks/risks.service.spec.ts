import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { RisksService, suggestRiskLevel } from './risks.service';

function baseRisk(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'risk-1',
    tenantId: 'tenant-a',
    organisationId: 'org-1',
    title: 'Weak access controls',
    description: null,
    threat: null,
    vulnerability: null,
    assessmentItemId: null,
    likelihood: 3,
    impact: 3,
    inherentRiskScore: 9,
    residualRiskScore: null,
    riskLevel: 'MEDIUM',
    owner: null,
    treatment: 'MONITOR',
    targetDate: null,
    status: 'OPEN',
    initiatives: [],
    ...overrides,
  };
}

describe('suggestRiskLevel', () => {
  it.each([
    [25, 'CRITICAL'],
    [20, 'CRITICAL'],
    [16, 'HIGH'],
    [12, 'HIGH'],
    [9, 'MEDIUM'],
    [6, 'MEDIUM'],
    [4, 'LOW'],
    [3, 'LOW'],
    [2, 'MINIMAL'],
    [1, 'MINIMAL'],
  ])('maps score %i to %s', (score, level) => {
    expect(suggestRiskLevel(score)).toBe(level);
  });
});

describe('RisksService', () => {
  let service: RisksService;
  let prisma: {
    organisation: { findFirst: jest.Mock };
    assessmentItem: { findFirst: jest.Mock };
    risk: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    remediationInitiative: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1', tenantId: 'tenant-a' }) },
      assessmentItem: { findFirst: jest.fn() },
      risk: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      remediationInitiative: { findFirst: jest.fn() },
    };
    service = new RisksService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('computes inherentRiskScore from likelihood x impact and suggests a risk level', async () => {
      prisma.risk.create.mockResolvedValueOnce(baseRisk());

      await service.create('tenant-a', {
        organisationId: 'org-1',
        title: 'Weak access controls',
        likelihood: 4,
        impact: 4,
      } as any);

      const createArgs = prisma.risk.create.mock.calls[0][0];
      expect(createArgs.data.inherentRiskScore).toBe(16);
      expect(createArgs.data.riskLevel).toBe('HIGH');
    });

    it('respects an explicit riskLevel override instead of the suggested one', async () => {
      prisma.risk.create.mockResolvedValueOnce(baseRisk());

      await service.create('tenant-a', {
        organisationId: 'org-1',
        title: 'x',
        likelihood: 1,
        impact: 1,
        riskLevel: 'CRITICAL',
      } as any);

      expect(prisma.risk.create.mock.calls[0][0].data.riskLevel).toBe('CRITICAL');
    });

    it('defaults likelihood/impact to 3 when omitted (matching the schema default)', async () => {
      prisma.risk.create.mockResolvedValueOnce(baseRisk());
      await service.create('tenant-a', { organisationId: 'org-1', title: 'x' } as any);
      expect(prisma.risk.create.mock.calls[0][0].data.inherentRiskScore).toBe(9);
    });

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create('tenant-a', { organisationId: 'org-x', title: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.risk.create).not.toHaveBeenCalled();
    });

    it('rejects an assessmentItemId that does not belong to this tenant', async () => {
      prisma.assessmentItem.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create('tenant-a', {
          organisationId: 'org-1',
          title: 'x',
          assessmentItemId: 'item-from-elsewhere',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.risk.create).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('scopes findAll to the requesting tenant and defaults to score-descending order', async () => {
      prisma.risk.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');
      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', deletedAt: null }),
          orderBy: { inherentRiskScore: 'desc' },
        }),
      );
    });

    it('never returns a risk belonging to another tenant', async () => {
      prisma.risk.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('tenant-b', 'risk-1')).rejects.toThrow(NotFoundException);
      expect(prisma.risk.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }) }),
      );
    });
  });

  describe('update', () => {
    it('recomputes the score and suggested level when likelihood or impact changes', async () => {
      prisma.risk.findFirst.mockResolvedValue(baseRisk({ likelihood: 3, impact: 3 }));

      await service.update('tenant-a', 'risk-1', { impact: 5 } as any);

      expect(prisma.risk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ inherentRiskScore: 15, riskLevel: 'HIGH' }),
        }),
      );
    });

    it('leaves the score untouched when neither likelihood nor impact is in the update', async () => {
      prisma.risk.findFirst.mockResolvedValue(baseRisk());

      await service.update('tenant-a', 'risk-1', { status: 'IN_PROGRESS' } as any);

      const updateArgs = prisma.risk.update.mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty('inherentRiskScore');
      expect(updateArgs.data.status).toBe('IN_PROGRESS');
    });
  });

  describe('initiative linking', () => {
    it('links a remediation initiative that belongs to the tenant', async () => {
      prisma.risk.findFirst.mockResolvedValue(baseRisk());
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce({ id: 'initiative-1' });

      await service.linkInitiative('tenant-a', 'risk-1', 'initiative-1');

      expect(prisma.risk.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { initiatives: { connect: { id: 'initiative-1' } } },
        }),
      );
    });

    it('rejects linking an initiative from another tenant', async () => {
      prisma.risk.findFirst.mockResolvedValue(baseRisk());
      prisma.remediationInitiative.findFirst.mockResolvedValueOnce(null);

      await expect(service.linkInitiative('tenant-a', 'risk-1', 'initiative-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
