import { parseFrameworkDefinition } from '@cmmp/framework-engine';

import { buildFrameworkCreateInput, toFrameworkDefinition, type FrameworkWithTree } from './framework-import';

import nistCsf from '../prisma/fixtures/nist-csf-2.0.json';

describe('buildFrameworkCreateInput', () => {
  it('maps a validated definition onto a tenant-scoped nested Prisma create', () => {
    const definition = parseFrameworkDefinition({
      slug: 'nist-csf',
      name: 'NIST Cybersecurity Framework 2.0',
      version: '2.0',
      frameworkType: 'NIST_CSF',
      functions: [
        {
          code: 'GV',
          name: 'Govern',
          categories: [
            {
              code: 'GV.RM',
              name: 'Risk Management Strategy',
              subcategories: [
                {
                  code: 'GV.RM-01',
                  name: 'Risk management objectives are established',
                  questions: [{ question: 'Are risk management objectives established?' }],
                },
              ],
            },
          ],
        },
      ],
    });

    const input = buildFrameworkCreateInput('tenant-a', definition);

    expect(input.tenantId).toBe('tenant-a');
    expect(input.slug).toBe('nist-csf');
    const created = input.functions?.create as Array<Record<string, unknown>>;
    expect(created[0].code).toBe('GV');
    const categories = (created[0].categories as { create: Array<Record<string, unknown>> }).create;
    const subcategories = (categories[0].subcategories as { create: Array<Record<string, unknown>> }).create;
    expect(subcategories[0].code).toBe('GV.RM-01');
    const questions = (subcategories[0].assessmentQuestions as { create: Array<Record<string, unknown>> }).create;
    expect(questions[0].question).toBe('Are risk management objectives established?');
  });

  it('accepts the real NIST CSF 2.0 fixture used by the seed script', () => {
    const definition = parseFrameworkDefinition(nistCsf);
    const input = buildFrameworkCreateInput('tenant-a', definition);

    expect(input.slug).toBe('nist-csf');
    expect((input.functions?.create as unknown[]).length).toBe(6);
  });
});

describe('toFrameworkDefinition', () => {
  it('maps a Prisma read model back onto the engine shape', () => {
    const framework = {
      slug: 'nist-csf',
      name: 'NIST Cybersecurity Framework 2.0',
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
              name: 'Risk Management Strategy',
              description: null,
              displayOrder: 0,
              subcategories: [
                {
                  code: 'GV.RM-01',
                  name: 'Risk management objectives are established',
                  description: null,
                  displayOrder: 0,
                  assessmentQuestions: [],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as FrameworkWithTree;

    const definition = toFrameworkDefinition(framework);

    expect(definition.slug).toBe('nist-csf');
    expect(definition.functions[0].categories[0].subcategories[0].code).toBe('GV.RM-01');
  });
});
