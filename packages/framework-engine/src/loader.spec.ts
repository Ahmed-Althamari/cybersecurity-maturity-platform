import { FrameworkNotFoundError, hydrateFrameworkTree, loadFrameworkTree } from './loader';
import type { FrameworkQueryClient, RawFrameworkRecord } from './loader';

function rawFrameworkRecord(): RawFrameworkRecord {
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

describe('hydrateFrameworkTree', () => {
  it('maps the Prisma-shaped record onto the framework-agnostic tree', () => {
    const tree = hydrateFrameworkTree(rawFrameworkRecord());

    expect(tree.frameworkType).toBe('NIST_CSF');
    expect(tree.functions).toHaveLength(1);
    expect(tree.functions[0].categories[0].subcategories[0].questions[0].question).toBe(
      'Are risk management objectives established?',
    );
  });
});

describe('loadFrameworkTree', () => {
  it('queries by tenant, slug, and active version, then hydrates the result', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(rawFrameworkRecord());
    const client: FrameworkQueryClient = { framework: { findFirst } };

    const tree = await loadFrameworkTree(client, { tenantId: 'tenant-a', slug: 'nist-csf' });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          slug: 'nist-csf',
          isActive: true,
          deletedAt: null,
        }),
      }),
    );
    expect(tree.slug).toBe('nist-csf');
  });

  it('pins to an explicit version when one is provided', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(rawFrameworkRecord());
    const client: FrameworkQueryClient = { framework: { findFirst } };

    await loadFrameworkTree(client, { tenantId: 'tenant-a', slug: 'nist-csf', version: '1.1' });

    const args = findFirst.mock.calls[0][0];
    expect(args.where.version).toBe('1.1');
    expect(args.where.isActive).toBeUndefined();
  });

  it('throws FrameworkNotFoundError when no matching framework exists', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(null);
    const client: FrameworkQueryClient = { framework: { findFirst } };

    await expect(
      loadFrameworkTree(client, { tenantId: 'tenant-a', slug: 'missing' }),
    ).rejects.toThrow(FrameworkNotFoundError);
  });
});
