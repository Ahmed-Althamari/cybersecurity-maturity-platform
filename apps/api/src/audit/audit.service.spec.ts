import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AuditService } from './audit.service';

type MockModel = Record<string, jest.Mock>;

describe('AuditService', () => {
  let service: AuditService;
  let prisma: { auditEvent: MockModel };

  beforeEach(() => {
    prisma = { auditEvent: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() } };
    prisma.auditEvent.count.mockResolvedValue(0);
    service = new AuditService(prisma as unknown as PrismaService);
  });

  describe('record', () => {
    const input = { tenantId: 'tenant-a', userId: 'user-a', action: 'CREATE' as const, resource: 'Risk' };

    it('writes an AuditEvent row', async () => {
      prisma.auditEvent.create.mockResolvedValueOnce({ id: 'event-1' });
      await service.record(input);
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({ data: input });
    });

    it('swallows a write failure rather than throwing', async () => {
      prisma.auditEvent.create.mockRejectedValueOnce(new Error('db down'));
      await expect(service.record(input)).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('scopes to tenant and applies filters', async () => {
      prisma.auditEvent.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', { action: 'DELETE', resource: 'Risk', userId: 'user-a' });

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', action: 'DELETE', resource: 'Risk', userId: 'user-a' }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('defaults to a limit of 50 and offset of 0', async () => {
      prisma.auditEvent.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', {});

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
    });

    it('builds a createdAt range filter from from/to', async () => {
      prisma.auditEvent.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a', { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

      const whereArg = prisma.auditEvent.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-02-01T00:00:00.000Z') });
    });

    it('returns both the page of rows and the total matching count', async () => {
      const rows = [{ id: 'event-1' }];
      prisma.auditEvent.findMany.mockResolvedValueOnce(rows);
      prisma.auditEvent.count.mockResolvedValueOnce(42);

      const result = await service.findAll('tenant-a', {});

      expect(result).toEqual({ data: rows, total: 42 });
      expect(prisma.auditEvent.count).toHaveBeenCalledWith({ where: expect.objectContaining({ tenantId: 'tenant-a' }) });
    });
  });

  describe('findOne', () => {
    it('404s an audit event from another tenant', async () => {
      prisma.auditEvent.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('event-1', 'tenant-b')).rejects.toThrow(NotFoundException);
    });
  });
});
