import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { computeWeightedProgress, plannedPercentAt, StrategicInitiativesService, toMonthKey } from './strategic-initiatives.service';

type MockModel = Record<string, jest.Mock>;

describe('toMonthKey', () => {
  it('normalises a YYYY-MM string to the first of that month at UTC midnight', () => {
    expect(toMonthKey('2026-03').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('normalises a full date string to the first of its month', () => {
    expect(toMonthKey('2026-03-17').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('plannedPercentAt', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const target = new Date('2026-05-01T00:00:00.000Z');

  it('returns null when either date is missing', () => {
    expect(plannedPercentAt(null, target, new Date())).toBeNull();
    expect(plannedPercentAt(start, null, new Date())).toBeNull();
  });

  it('returns 0 at or before the start date', () => {
    expect(plannedPercentAt(start, target, start)).toBe(0);
  });

  it('returns 100 at or after the target date', () => {
    expect(plannedPercentAt(start, target, target)).toBe(100);
  });

  it('interpolates linearly at the midpoint', () => {
    const midpoint = new Date('2026-03-02T00:00:00.000Z');
    expect(plannedPercentAt(start, target, midpoint)).toBeCloseTo(50, 0);
  });
});

describe('computeWeightedProgress', () => {
  it('reports 0 for an empty list', () => {
    expect(computeWeightedProgress([])).toBe(0);
  });

  it('degrades to a plain average when every weight is 1', () => {
    expect(computeWeightedProgress([{ percentComplete: 40, weight: 1 }, { percentComplete: 60, weight: 1 }])).toBe(50);
  });

  it('weights the average toward the heavier initiative', () => {
    expect(computeWeightedProgress([{ percentComplete: 0, weight: 1 }, { percentComplete: 100, weight: 3 }])).toBe(75);
  });
});

describe('StrategicInitiativesService', () => {
  let service: StrategicInitiativesService;
  let prisma: {
    organisation: MockModel;
    risk: MockModel;
    strategicInitiative: MockModel;
    strategicMilestone: MockModel;
    strategicInitiativeProgress: MockModel;
  };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      risk: { count: jest.fn(), findFirst: jest.fn() },
      strategicInitiative: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      strategicMilestone: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
      strategicInitiativeProgress: { upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };
    service = new StrategicInitiativesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const dto = { organisationId: 'org-a', title: 'Enterprise Vulnerability Management Programme' };

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(service.create('tenant-a', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects riskIds that do not all belong to this organisation', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.count.mockResolvedValueOnce(1);

      await expect(service.create('tenant-a', { ...dto, riskIds: ['risk-1', 'risk-2'] })).rejects.toThrow(BadRequestException);
    });

    it('generates a sequential code and defaults status to NOT_STARTED', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.strategicInitiative.count.mockResolvedValueOnce(4);
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce(null);
      prisma.strategicInitiative.create.mockResolvedValueOnce({ id: 'init-1' });

      await service.create('tenant-a', dto);

      const createArgs = prisma.strategicInitiative.create.mock.calls[0][0];
      expect(createArgs.data.code).toBe('INIT-005');
      expect(createArgs.data.status).toBe('NOT_STARTED');
      expect(createArgs.data.priority).toBe(3);
      expect(createArgs.data.weight).toBe(1);
      expect(createArgs.data.risks).toBeUndefined();
    });

    it('connects validated riskIds', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.count.mockResolvedValueOnce(2);
      prisma.strategicInitiative.count.mockResolvedValueOnce(0);
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce(null);
      prisma.strategicInitiative.create.mockResolvedValueOnce({ id: 'init-1' });

      await service.create('tenant-a', { ...dto, riskIds: ['risk-1', 'risk-2'] });

      const createArgs = prisma.strategicInitiative.create.mock.calls[0][0];
      expect(createArgs.data.risks).toEqual({ connect: [{ id: 'risk-1' }, { id: 'risk-2' }] });
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.strategicInitiative.count.mockResolvedValue(0);
    });

    it('scopes to tenant and organisation', async () => {
      prisma.strategicInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', {});

      expect(prisma.strategicInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', organisationId: 'org-a', deletedAt: null }) }),
      );
    });

    it('filters to initiatives with at least one linked risk', async () => {
      prisma.strategicInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', { linked: 'true' });

      expect(prisma.strategicInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ risks: { some: {} } }) }),
      );
    });

    it('filters to initiatives with no linked risk', async () => {
      prisma.strategicInitiative.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', { linked: 'false' });

      expect(prisma.strategicInitiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ risks: { none: {} } }) }),
      );
    });

    it('paginates using page/pageSize and reports totalPages', async () => {
      prisma.strategicInitiative.findMany.mockResolvedValueOnce([]);
      prisma.strategicInitiative.count.mockResolvedValueOnce(45);

      const result = await service.findAll('tenant-a', 'org-a', { page: 2, pageSize: 20 });

      expect(prisma.strategicInitiative.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
      expect(result).toEqual({ data: [], total: 45, page: 2, pageSize: 20, totalPages: 3 });
    });
  });

  describe('findOne', () => {
    it('404s an initiative from another tenant', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('init-1', 'tenant-b')).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkRisk / unlinkRisk', () => {
    it('404s a risk that does not belong to the initiative organisation', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.risk.findFirst.mockResolvedValueOnce(null);

      await expect(service.linkRisk('init-1', 'tenant-a', 'risk-foreign')).rejects.toThrow(NotFoundException);
    });

    it('connects a validated risk', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1' });
      prisma.strategicInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.linkRisk('init-1', 'tenant-a', 'risk-1');

      expect(prisma.strategicInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: { risks: { connect: { id: 'risk-1' } } } }),
      );
    });

    it('disconnects a risk', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a' });
      prisma.strategicInitiative.update.mockResolvedValueOnce({ id: 'init-1' });

      await service.unlinkRisk('init-1', 'tenant-a', 'risk-1');

      expect(prisma.strategicInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: { risks: { disconnect: { id: 'risk-1' } } } }),
      );
    });
  });

  describe('recordProgress', () => {
    it('upserts the monthly entry and refreshes percentComplete from the latest month', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1', organisationId: 'org-a', milestones: [] });
      prisma.strategicInitiativeProgress.upsert.mockResolvedValueOnce({});
      prisma.strategicInitiativeProgress.findFirst.mockResolvedValueOnce({ percentComplete: 55 });
      prisma.strategicInitiative.update.mockResolvedValueOnce({ id: 'init-1', percentComplete: 55 });

      await service.recordProgress('init-1', 'tenant-a', { month: '2026-02', percentComplete: 55 });

      expect(prisma.strategicInitiativeProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { initiativeId_month: { initiativeId: 'init-1', month: new Date('2026-02-01T00:00:00.000Z') } },
        }),
      );
      expect(prisma.strategicInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: { percentComplete: 55 } }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes', async () => {
      prisma.strategicInitiative.findFirst.mockResolvedValueOnce({ id: 'init-1' });
      prisma.strategicInitiative.update.mockResolvedValueOnce({});

      await service.remove('init-1', 'tenant-a');

      expect(prisma.strategicInitiative.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'init-1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });
});
