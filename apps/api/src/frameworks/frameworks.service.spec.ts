import { Prisma } from '@cmmp/database';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { FrameworksService } from './frameworks.service';

type MockModel = Record<string, jest.Mock>;

function validDefinition() {
  return {
    slug: 'nist-csf-2',
    name: 'NIST Cybersecurity Framework',
    version: '2.0',
    frameworkType: 'NIST_CSF',
    functions: [
      {
        code: 'GV',
        name: 'Govern',
        categories: [
          {
            code: 'GV.RM',
            name: 'Risk Management',
            subcategories: [{ code: 'GV.RM-01', name: 'Risk objectives are established' }],
          },
        ],
      },
    ],
  };
}

describe('FrameworksService', () => {
  let service: FrameworksService;
  let prisma: { framework: MockModel };

  beforeEach(() => {
    prisma = {
      framework: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new FrameworksService(prisma as unknown as PrismaService);
  });

  describe('tenant isolation', () => {
    it('scopes findAll to the requesting tenant only', async () => {
      prisma.framework.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');

      expect(prisma.framework.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a', deletedAt: null } }),
      );
    });

    it('scopes findOne lookups to the requesting tenant and 404s otherwise', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne('framework-in-tenant-a', 'tenant-b')).rejects.toThrow(NotFoundException);

      expect(prisma.framework.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'framework-in-tenant-a', tenantId: 'tenant-b', deletedAt: null },
        }),
      );
    });
  });

  describe('getNavigation', () => {
    it('builds a navigation tree from the persisted framework hierarchy', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce({
        slug: 'nist-csf-2',
        name: 'NIST Cybersecurity Framework',
        version: '2.0',
        frameWorkType: 'NIST_CSF',
        description: null,
        isActive: true,
        functions: [
          {
            code: 'GV',
            name: 'Govern',
            description: null,
            displayOrder: 0,
            categories: [
              {
                code: 'GV.RM',
                name: 'Risk Management',
                description: null,
                displayOrder: 0,
                subcategories: [
                  { code: 'GV.RM-01', name: 'Risk objectives are established', description: null, displayOrder: 0 },
                ],
              },
            ],
          },
        ],
      });

      const navigation = await service.getNavigation('framework-a', 'tenant-a');

      expect(navigation).toHaveLength(1);
      expect(navigation[0].code).toBe('GV');
      expect(navigation[0].children[0].children[0].code).toBe('GV.RM-01');
    });
  });

  describe('importDefinition', () => {
    it('rejects an invalid definition without touching the database', async () => {
      await expect(service.importDefinition('tenant-a', { name: 'Missing required fields' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.framework.create).not.toHaveBeenCalled();
    });

    it('persists a valid definition as a nested create scoped to the tenant', async () => {
      prisma.framework.create.mockResolvedValueOnce({ id: 'new-framework' });

      await service.importDefinition('tenant-a', validDefinition());

      const createArgs = prisma.framework.create.mock.calls[0][0];
      expect(createArgs.data.tenantId).toBe('tenant-a');
      expect(createArgs.data.slug).toBe('nist-csf-2');
      expect(createArgs.data.functions.create[0].categories.create[0].subcategories.create[0].code).toBe('GV.RM-01');
    });

    it('maps a duplicate slug/version conflict to ConflictException', async () => {
      prisma.framework.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.importDefinition('tenant-a', validDefinition())).rejects.toThrow(ConflictException);
    });
  });
});
