import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import { PinnedInsightsService } from './pinned-insights.service';

type MockModel = Record<string, jest.Mock>;

const TENANT_ID = 'tenant-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

describe('PinnedInsightsService', () => {
  let service: PinnedInsightsService;
  let prisma: { pinnedInsight: MockModel; organisation: MockModel };

  beforeEach(() => {
    prisma = {
      pinnedInsight: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      organisation: { findFirst: jest.fn() },
    };
    service = new PinnedInsightsService(prisma as unknown as PrismaService);
  });

  describe('findAllForOrganisation', () => {
    it('scopes to the tenant and organisation, newest first', async () => {
      prisma.pinnedInsight.findMany.mockResolvedValue([{ id: 'insight-1' }]);

      const result = await service.findAllForOrganisation(TENANT_ID, ORG_ID);

      expect(result).toEqual([{ id: 'insight-1' }]);
      expect(prisma.pinnedInsight.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, organisationId: ORG_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('throws NotFoundException when the organisation does not belong to this tenant', async () => {
      prisma.organisation.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, { organisationId: ORG_ID, title: 'Sales', imageBase64: 'abc' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.pinnedInsight.create).not.toHaveBeenCalled();
    });

    it('creates a pinned insight scoped to the tenant, with the creating user recorded', async () => {
      prisma.organisation.findFirst.mockResolvedValue({ id: ORG_ID });
      prisma.pinnedInsight.create.mockResolvedValue({ id: 'insight-1' });

      const result = await service.create(TENANT_ID, USER_ID, {
        organisationId: ORG_ID,
        title: 'Sales vs Costs',
        imageBase64: 'base64data',
        chartData: JSON.stringify({ categories: ['Jan'], series: [{ name: 'Sales', values: [100] }] }),
        sourceFileName: 'q1.xlsx',
      });

      expect(result).toEqual({ id: 'insight-1' });
      expect(prisma.pinnedInsight.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          organisationId: ORG_ID,
          title: 'Sales vs Costs',
          imageBase64: 'base64data',
          chartData: JSON.stringify({ categories: ['Jan'], series: [{ name: 'Sales', values: [100] }] }),
          sourceFileName: 'q1.xlsx',
          createdById: USER_ID,
        },
      });
    });

    it('allows chartData/sourceFileName to be omitted (an AutoViz/PandasAI chart has no known data)', async () => {
      prisma.organisation.findFirst.mockResolvedValue({ id: ORG_ID });
      prisma.pinnedInsight.create.mockResolvedValue({ id: 'insight-1' });

      await service.create(TENANT_ID, USER_ID, { organisationId: ORG_ID, title: 'Generated chart', imageBase64: 'base64data' });

      expect(prisma.pinnedInsight.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          organisationId: ORG_ID,
          title: 'Generated chart',
          imageBase64: 'base64data',
          chartData: undefined,
          sourceFileName: undefined,
          createdById: USER_ID,
        },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing matched the tenant-scoped delete', async () => {
      prisma.pinnedInsight.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(TENANT_ID, 'insight-1')).rejects.toThrow(NotFoundException);
    });

    it('succeeds when a row was deleted', async () => {
      prisma.pinnedInsight.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove(TENANT_ID, 'insight-1')).resolves.toBeUndefined();
      expect(prisma.pinnedInsight.deleteMany).toHaveBeenCalledWith({ where: { id: 'insight-1', tenantId: TENANT_ID } });
    });
  });
});
