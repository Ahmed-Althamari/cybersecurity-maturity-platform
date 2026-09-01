import { AuditAction } from '@cmmp/shared';

import { PrismaService } from '../prisma/prisma.service';

import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditEvent: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  describe('log', () => {
    it('writes an audit event with the given fields', async () => {
      await service.log({
        tenantId: 'tenant-a',
        userId: 'user-1',
        action: AuditAction.CREATE,
        resource: 'Risks',
        resourceId: 'risk-1',
        newValue: { title: 'x' },
      });

      expect(prisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-a',
            userId: 'user-1',
            action: 'CREATE',
            resource: 'Risks',
            resourceId: 'risk-1',
            newValue: JSON.stringify({ title: 'x' }),
          }),
        }),
      );
    });

    it('truncates an oversized newValue rather than storing it unbounded', async () => {
      const huge = { blob: 'x'.repeat(10_000) };
      await service.log({
        tenantId: 'tenant-a',
        userId: 'user-1',
        action: AuditAction.CREATE,
        resource: 'Frameworks',
        newValue: huge,
      });

      const stored = prisma.auditEvent.create.mock.calls[0][0].data.newValue;
      expect(stored.length).toBeLessThan(JSON.stringify(huge).length);
      expect(stored.endsWith('…(truncated)')).toBe(true);
    });

    it('never throws when the write itself fails -- audit logging cannot break the request', async () => {
      prisma.auditEvent.create.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.log({ tenantId: 'tenant-a', userId: 'user-1', action: AuditAction.DELETE, resource: 'Risks' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('scopes to the tenant and applies default pagination', async () => {
      await service.findAll('tenant-a');
      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a' }),
          skip: 0,
          take: 50,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('caps an oversized pageSize at 200', async () => {
      await service.findAll('tenant-a', { pageSize: 10_000, page: 2 });
      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200, skip: 200 }),
      );
    });
  });

  describe('getSummary', () => {
    it('zero-fills every AuditAction even when no events exist for it', async () => {
      prisma.auditEvent.groupBy.mockImplementation(({ by }: { by: string[] }) =>
        by[0] === 'action' ? [{ action: 'LOGIN', _count: { action: 3 } }] : [],
      );

      const summary = await service.getSummary('tenant-a');

      expect(summary.byAction.LOGIN).toBe(3);
      expect(summary.byAction.DELETE).toBe(0);
      expect(Object.keys(summary.byAction)).toEqual(Object.values(AuditAction));
    });
  });
});
