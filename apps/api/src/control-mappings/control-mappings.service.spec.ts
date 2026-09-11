import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

import { ControlMappingsService } from './control-mappings.service';

type MockModel = Record<string, jest.Mock>;

const TENANT_ID = 'tenant-1';

function frameworkTree(id: string, name: string, subcats: { id: string; code: string; name: string }[]) {
  return {
    id,
    name,
    functions: [
      {
        code: 'GV',
        name: 'Govern',
        categories: [
          {
            code: 'GV.RM',
            name: 'Risk Management',
            subcategories: subcats,
          },
        ],
      },
    ],
  };
}

describe('ControlMappingsService', () => {
  let service: ControlMappingsService;
  let prisma: { framework: MockModel; controlMapping: MockModel; subcategory: MockModel };

  beforeEach(() => {
    prisma = {
      framework: { findFirst: jest.fn() },
      controlMapping: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      subcategory: { findFirst: jest.fn() },
    };
    service = new ControlMappingsService(prisma as unknown as PrismaService);
  });

  describe('getFrameworkSubcategories', () => {
    it('flattens the tree into a flat subcategory list with parent codes/names', async () => {
      prisma.framework.findFirst.mockResolvedValue(
        frameworkTree('fwk-1', 'NIST CSF', [{ id: 'sub-1', code: 'GV.RM-01', name: 'Objective one' }]),
      );

      const result = await service.getFrameworkSubcategories(TENANT_ID, 'fwk-1');

      expect(result).toEqual({
        id: 'fwk-1',
        name: 'NIST CSF',
        subcategories: [
          {
            id: 'sub-1',
            code: 'GV.RM-01',
            name: 'Objective one',
            categoryCode: 'GV.RM',
            categoryName: 'Risk Management',
            functionCode: 'GV',
            functionName: 'Govern',
          },
        ],
      });
    });

    it('throws NotFoundException for a framework outside the tenant', async () => {
      prisma.framework.findFirst.mockResolvedValue(null);
      await expect(service.getFrameworkSubcategories(TENANT_ID, 'fwk-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBetweenFrameworks', () => {
    it('returns both frameworks plus mappings matching either direction', async () => {
      prisma.framework.findFirst
        .mockResolvedValueOnce(frameworkTree('fwk-1', 'NIST CSF', [{ id: 'sub-1', code: 'GV.RM-01', name: 'A' }]))
        .mockResolvedValueOnce(frameworkTree('fwk-2', 'ISO 27001', [{ id: 'sub-2', code: 'A.5.1', name: 'B' }]));
      prisma.controlMapping.findMany.mockResolvedValue([
        { id: 'map-1', sourceSubcategoryId: 'sub-1', targetSubcategoryId: 'sub-2', relationship: 'EQUIVALENT' },
      ]);

      const result = await service.findBetweenFrameworks(TENANT_ID, 'fwk-1', 'fwk-2');

      expect(result.sourceFramework.id).toBe('fwk-1');
      expect(result.targetFramework.id).toBe('fwk-2');
      expect(result.mappings).toHaveLength(1);
      const whereArg = prisma.controlMapping.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toEqual([
        { sourceSubcategoryId: { in: ['sub-1'] }, targetSubcategoryId: { in: ['sub-2'] } },
        { sourceSubcategoryId: { in: ['sub-2'] }, targetSubcategoryId: { in: ['sub-1'] } },
      ]);
    });
  });

  describe('create', () => {
    it('rejects mapping a subcategory to itself', async () => {
      await expect(service.create(TENANT_ID, 'user-1', { sourceSubcategoryId: 'sub-1', targetSubcategoryId: 'sub-1', relationship: 'EQUIVALENT' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when either subcategory does not belong to the tenant', async () => {
      prisma.subcategory.findFirst.mockResolvedValueOnce({ id: 'sub-1' }).mockResolvedValueOnce(null);
      await expect(
        service.create(TENANT_ID, 'user-1', { sourceSubcategoryId: 'sub-1', targetSubcategoryId: 'sub-2', relationship: 'EQUIVALENT' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a mapping when both subcategories belong to the tenant', async () => {
      prisma.subcategory.findFirst.mockResolvedValue({ id: 'sub-x' });
      prisma.controlMapping.create.mockResolvedValue({ id: 'map-1' });

      const result = await service.create(TENANT_ID, 'user-1', {
        sourceSubcategoryId: 'sub-1',
        targetSubcategoryId: 'sub-2',
        relationship: 'PARTIAL',
        notes: 'close but not exact',
      });

      expect(result).toEqual({ id: 'map-1' });
      expect(prisma.controlMapping.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          sourceSubcategoryId: 'sub-1',
          targetSubcategoryId: 'sub-2',
          relationship: 'PARTIAL',
          notes: 'close but not exact',
          createdById: 'user-1',
        },
      });
    });

    it('throws ConflictException when the mapping already exists', async () => {
      prisma.subcategory.findFirst.mockResolvedValue({ id: 'sub-x' });
      const { Prisma } = jest.requireActual('@cmmp/database');
      prisma.controlMapping.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(
        service.create(TENANT_ID, 'user-1', { sourceSubcategoryId: 'sub-1', targetSubcategoryId: 'sub-2', relationship: 'EQUIVALENT' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing matched the tenant-scoped delete', async () => {
      prisma.controlMapping.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(TENANT_ID, 'map-1')).rejects.toThrow(NotFoundException);
    });

    it('succeeds when a row was deleted', async () => {
      prisma.controlMapping.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove(TENANT_ID, 'map-1')).resolves.toBeUndefined();
    });
  });
});
