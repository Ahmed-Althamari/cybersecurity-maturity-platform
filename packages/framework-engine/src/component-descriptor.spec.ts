import { buildFrameworkComponentDescriptor } from './component-descriptor';
import type { FrameworkTree } from './types';

function frameworkTree(functionCount: number): FrameworkTree {
  return {
    id: 'framework-1',
    tenantId: 'tenant-a',
    name: 'NIST Cybersecurity Framework',
    slug: 'nist-csf',
    version: '2.0',
    frameworkType: 'NIST_CSF',
    description: null,
    isActive: true,
    functions: Array.from({ length: functionCount }, (_, i) => ({
      id: `function-${i}`,
      code: `FN${i}`,
      name: `Function ${i}`,
      description: null,
      displayOrder: i,
      categories: [
        {
          id: `category-${i}`,
          code: `FN${i}.CAT`,
          name: `Category ${i}`,
          description: null,
          displayOrder: 0,
          subcategories: [
            {
              id: `subcategory-${i}-a`,
              code: `FN${i}.CAT-01`,
              name: 'Sub A',
              description: null,
              displayOrder: 0,
              questions: [
                { id: `q-${i}-1`, question: 'Q1', guidance: null, examples: null, referenceLinks: null },
                { id: `q-${i}-2`, question: 'Q2', guidance: null, examples: null, referenceLinks: null },
              ],
            },
            {
              id: `subcategory-${i}-b`,
              code: `FN${i}.CAT-02`,
              name: 'Sub B',
              description: null,
              displayOrder: 1,
              questions: [],
            },
          ],
        },
      ],
    })),
  };
}

describe('buildFrameworkComponentDescriptor', () => {
  it('summarises counts and totals for a framework tree', () => {
    const descriptor = buildFrameworkComponentDescriptor(frameworkTree(2));

    expect(descriptor.functions).toHaveLength(2);
    expect(descriptor.functions[0]).toMatchObject({
      code: 'FN0',
      categoryCount: 1,
      subcategoryCount: 2,
      questionCount: 2,
    });
    expect(descriptor.totals).toEqual({
      functionCount: 2,
      categoryCount: 2,
      subcategoryCount: 4,
      questionCount: 4,
    });
  });

  it('assigns a color to every function and cycles the palette instead of repeating framework-specific assumptions', () => {
    const descriptor = buildFrameworkComponentDescriptor(frameworkTree(8));

    expect(descriptor.functions.every((fn) => typeof fn.color === 'string')).toBe(true);
    expect(descriptor.functions[0].color).toBe(descriptor.functions[6].color);
  });

  it('does not hard-code a fixed function count (works for frameworks with != 6 functions)', () => {
    const descriptor = buildFrameworkComponentDescriptor(frameworkTree(3));
    expect(descriptor.totals.functionCount).toBe(3);
  });
});
