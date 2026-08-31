import { persistFrameworkDefinition } from './persist';
import type { FrameworkWriteClient } from './persist';
import type { FrameworkDefinition } from './types';
import { NIST_CSF_2_0 } from './definitions/nist-csf-2-0';

function definition(): FrameworkDefinition {
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
                questions: [
                  {
                    question: 'Are risk management objectives established?',
                    examples: ['Review objectives annually'],
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

describe('persistFrameworkDefinition', () => {
  it('builds a single nested Prisma create scoped to the tenant', async () => {
    const create = jest.fn().mockResolvedValueOnce({
      id: 'framework-1',
      tenantId: 'tenant-a',
      name: 'NIST Cybersecurity Framework',
      slug: 'nist-csf',
      version: '2.0',
      frameWorkType: 'NIST_CSF',
      description: null,
      isActive: true,
      functions: [],
    });
    const client: FrameworkWriteClient = { framework: { create } };

    const tree = await persistFrameworkDefinition(client, 'tenant-a', definition());

    const args = create.mock.calls[0][0];
    expect(args.data.tenantId).toBe('tenant-a');
    expect(args.data.frameWorkType).toBe('NIST_CSF');
    expect(args.data.functions.create[0].categories.create[0].subcategories.create[0].code).toBe(
      'GV.RM-01',
    );
    expect(
      args.data.functions.create[0].categories.create[0].subcategories.create[0]
        .assessmentQuestions.create[0].examples,
    ).toBe(JSON.stringify(['Review objectives annually']));
    expect(tree.slug).toBe('nist-csf');
  });

  it('defaults displayOrder to array index when omitted', async () => {
    const create = jest.fn().mockResolvedValueOnce({
      id: 'framework-1',
      tenantId: 'tenant-a',
      name: 'x',
      slug: 'nist-csf',
      version: '2.0',
      frameWorkType: 'NIST_CSF',
      description: null,
      isActive: true,
      functions: [],
    });
    const client: FrameworkWriteClient = { framework: { create } };

    await persistFrameworkDefinition(client, 'tenant-a', definition());

    const args = create.mock.calls[0][0];
    expect(args.data.functions.create[0].displayOrder).toBe(0);
  });

  it('builds correctly-shaped nested create args for the full NIST CSF 2.0 tree (106 subcategories)', async () => {
    const create = jest.fn().mockResolvedValueOnce({
      id: 'framework-1',
      tenantId: 'tenant-a',
      name: NIST_CSF_2_0.name,
      slug: NIST_CSF_2_0.slug,
      version: NIST_CSF_2_0.version,
      frameWorkType: NIST_CSF_2_0.frameworkType,
      description: NIST_CSF_2_0.description ?? null,
      isActive: true,
      functions: [],
    });
    const client: FrameworkWriteClient = { framework: { create } };

    await persistFrameworkDefinition(client, 'tenant-a', NIST_CSF_2_0);

    const args = create.mock.calls[0][0];
    const subcategoryCreates = args.data.functions.create.flatMap((fn: any) =>
      fn.categories.create.flatMap((cat: any) => cat.subcategories.create),
    );
    expect(subcategoryCreates).toHaveLength(106);
    expect(subcategoryCreates.every((sub: any) => sub.assessmentQuestions.create.length === 1)).toBe(
      true,
    );
    expect(
      subcategoryCreates.every((sub: any) =>
        typeof sub.assessmentQuestions.create[0].examples === 'string' ||
        sub.assessmentQuestions.create[0].examples === null,
      ),
    ).toBe(true);
  });
});
