import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { FrameworkService } from './framework.service';

function validDefinitionPayload() {
  return {
    name: 'NIST Cybersecurity Framework',
    slug: 'nist-csf',
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
            subcategories: [
              {
                code: 'GV.RM-01',
                name: 'Risk management objectives',
                questions: [{ question: 'Are risk management objectives established?' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function rawFrameworkRecord() {
  return {
    id: 'framework-1',
    tenantId: 'tenant-a',
    name: 'NIST Cybersecurity Framework',
    slug: 'nist-csf',
    version: '2.0',
    frameWorkType: 'NIST_CSF',
    description: null,
    isActive: true,
    functions: [
      {
        id: 'function-1',
        code: 'GV',
        name: 'Govern',
        description: null,
        displayOrder: 0,
        categories: [
          {
            id: 'category-1',
            code: 'GV.RM',
            name: 'Risk Management',
            description: null,
            displayOrder: 0,
            subcategories: [
              {
                id: 'subcategory-1',
                code: 'GV.RM-01',
                name: 'Risk management objectives',
                description: null,
                displayOrder: 0,
                assessmentQuestions: [
                  {
                    id: 'question-1',
                    question: 'Are risk management objectives established?',
                    guidance: null,
                    examples: null,
                    referenceLinks: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('FrameworkService', () => {
  let service: FrameworkService;
  let prisma: { framework: any };

  beforeEach(() => {
    prisma = {
      framework: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new FrameworkService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('scopes the query to the requesting tenant and excludes soft-deleted rows', async () => {
      prisma.framework.findMany.mockResolvedValueOnce([]);
      await service.findAll('tenant-a');

      expect(prisma.framework.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a', deletedAt: null } }),
      );
    });
  });

  describe('getTree', () => {
    it('returns a hydrated tree scoped to the tenant', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce(rawFrameworkRecord());

      const tree = await service.getTree('tenant-a', 'nist-csf');

      expect(prisma.framework.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a', slug: 'nist-csf' }),
        }),
      );
      expect(tree.slug).toBe('nist-csf');
      expect(tree.functions[0].code).toBe('GV');
    });

    it('translates a missing framework into a NotFoundException', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce(null);

      await expect(service.getTree('tenant-a', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('never returns a framework belonging to another tenant', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce(null);

      await expect(service.getTree('tenant-b', 'nist-csf')).rejects.toThrow(NotFoundException);
      expect(prisma.framework.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }) }),
      );
    });
  });

  describe('getComponentDescriptor', () => {
    it('builds a dynamic UI descriptor from the loaded tree', async () => {
      prisma.framework.findFirst.mockResolvedValueOnce(rawFrameworkRecord());

      const descriptor = await service.getComponentDescriptor('tenant-a', 'nist-csf');

      expect(descriptor.totals.functionCount).toBe(1);
      expect(descriptor.functions[0]).toMatchObject({ code: 'GV', categoryCount: 1 });
    });
  });

  describe('validateDefinition', () => {
    it('reports valid for a well-formed definition without persisting anything', () => {
      const result = service.validateDefinition(validDefinitionPayload());
      expect(result.valid).toBe(true);
      expect(prisma.framework.create).not.toHaveBeenCalled();
    });

    it('reports issues for a malformed definition', () => {
      const result = service.validateDefinition({ name: 'Incomplete' });
      expect(result.valid).toBe(false);
      expect((result as { issues: string[] }).issues.length).toBeGreaterThan(0);
    });
  });

  describe('create', () => {
    it('rejects an invalid definition with a BadRequestException before touching the database', async () => {
      await expect(service.create('tenant-a', { name: 'Incomplete' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.framework.create).not.toHaveBeenCalled();
    });

    it('persists a nested create scoped to the tenant and returns the hydrated tree', async () => {
      prisma.framework.create.mockResolvedValueOnce(rawFrameworkRecord());

      const tree = await service.create('tenant-a', validDefinitionPayload());

      const createArgs = prisma.framework.create.mock.calls[0][0];
      expect(createArgs.data.tenantId).toBe('tenant-a');
      expect(createArgs.data.frameWorkType).toBe('NIST_CSF');
      expect(tree.slug).toBe('nist-csf');
    });

    it('translates a unique constraint violation into a ConflictException', async () => {
      prisma.framework.create.mockRejectedValueOnce({ code: 'P2002' });

      await expect(service.create('tenant-a', validDefinitionPayload())).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
