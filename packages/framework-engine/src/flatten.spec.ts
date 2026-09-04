import { flattenFramework } from './flatten';
import { parseFrameworkDefinition } from './loader';

describe('flattenFramework', () => {
  it('indexes every level of the hierarchy by code', () => {
    const framework = parseFrameworkDefinition({
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
    });

    const flattened = flattenFramework(framework);

    expect(flattened.functionsByCode.get('GV')?.name).toBe('Govern');
    expect(flattened.categoriesByCode.get('GV.RM')?.name).toBe('Risk Management');
    expect(flattened.subcategoriesByCode.get('GV.RM-01')?.name).toBe('Risk objectives are established');
    expect(flattened.subcategoriesByCode.get('does-not-exist')).toBeUndefined();
  });
});
