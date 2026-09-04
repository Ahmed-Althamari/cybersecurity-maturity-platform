import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { RisksService } from './risks.service';

type MockModel = Record<string, jest.Mock>;

describe('RisksService', () => {
  let service: RisksService;
  let prisma: { organisation: MockModel; assessmentItem: MockModel; risk: MockModel };

  beforeEach(() => {
    prisma = {
      organisation: { findFirst: jest.fn() },
      assessmentItem: { findFirst: jest.fn() },
      risk: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    service = new RisksService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const dto = { organisationId: 'org-a', title: 'Unpatched EOL server', likelihood: 4, impact: 5 };

    it('rejects an organisation that does not belong to the tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      await expect(service.create('tenant-a', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an assessmentItemId that does not belong to this org/tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.assessmentItem.findFirst.mockResolvedValueOnce(null);

      await expect(service.create('tenant-a', { ...dto, assessmentItemId: 'item-foreign' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('computes inherentRiskScore and riskLevel server-side from likelihood x impact', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.create.mockResolvedValueOnce({ id: 'risk-1' });

      await service.create('tenant-a', dto); // 4 x 5 = 20 -> CRITICAL

      const createArgs = prisma.risk.create.mock.calls[0][0];
      expect(createArgs.data.inherentRiskScore).toBe(20);
      expect(createArgs.data.riskLevel).toBe('CRITICAL');
      expect(createArgs.data.tenantId).toBe('tenant-a');
    });

    it.each([
      [1, 1, 'MINIMAL'],
      [2, 2, 'LOW'],
      [2, 3, 'MEDIUM'],
      [3, 4, 'HIGH'],
      [5, 5, 'CRITICAL'],
    ])('bands likelihood %i x impact %i as %s', async (likelihood, impact, expected) => {
      prisma.organisation.findFirst.mockResolvedValueOnce({ id: 'org-a' });
      prisma.risk.create.mockResolvedValueOnce({ id: 'risk-1' });

      await service.create('tenant-a', { ...dto, likelihood, impact });

      expect(prisma.risk.create.mock.calls[0][0].data.riskLevel).toBe(expected);
    });
  });

  describe('findAll', () => {
    it('scopes to tenant and organisation, and validates riskLevel', async () => {
      prisma.risk.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', { riskLevel: 'HIGH' });

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', organisationId: 'org-a', riskLevel: 'HIGH' }),
        }),
      );
    });

    it('rejects an invalid riskLevel filter', async () => {
      await expect(service.findAll('tenant-a', 'org-a', { riskLevel: 'SUPER_BAD' })).rejects.toThrow(BadRequestException);
    });

    it('sorts by inherentRiskScore when sort=priority', async () => {
      prisma.risk.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', 'org-a', { sort: 'priority' });

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: expect.arrayContaining([{ inherentRiskScore: 'desc' }]) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s a risk from another tenant', async () => {
      prisma.risk.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('risk-1', 'tenant-b')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('recomputes inherentRiskScore and riskLevel when likelihood/impact change', async () => {
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1', likelihood: 2, impact: 2, inherentRiskScore: 4 });
      prisma.risk.update.mockResolvedValueOnce({ id: 'risk-1' });

      await service.update('risk-1', 'tenant-a', { impact: 5 }); // likelihood stays 2 -> 2*5=10 -> MEDIUM

      const updateArgs = prisma.risk.update.mock.calls[0][0];
      expect(updateArgs.data.inherentRiskScore).toBe(10);
      expect(updateArgs.data.riskLevel).toBe('MEDIUM');
    });

    it('leaves the score untouched when neither likelihood nor impact changes', async () => {
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1', likelihood: 2, impact: 2, inherentRiskScore: 4 });
      prisma.risk.update.mockResolvedValueOnce({ id: 'risk-1' });

      await service.update('risk-1', 'tenant-a', { status: 'CLOSED' });

      const updateArgs = prisma.risk.update.mock.calls[0][0];
      expect(updateArgs.data.inherentRiskScore).toBe(4);
      expect(updateArgs.data.riskLevel).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes', async () => {
      prisma.risk.findFirst.mockResolvedValueOnce({ id: 'risk-1' });
      prisma.risk.update.mockResolvedValueOnce({});

      await service.remove('risk-1', 'tenant-a');

      expect(prisma.risk.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'risk-1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
    });
  });
});
