import { buildFrameworkNavigation } from './navigation';
import type { FrameworkDefinition } from './types';

function framework(): FrameworkDefinition {
  return {
    slug: 'nist-csf-2',
    name: 'NIST Cybersecurity Framework',
    version: '2.0',
    frameworkType: 'NIST_CSF',
    functions: [
      {
        code: 'ID',
        name: 'Identify',
        displayOrder: 1,
        categories: [],
      },
      {
        code: 'GV',
        name: 'Govern',
        displayOrder: 0,
        categories: [
          {
            code: 'GV.RM',
            name: 'Risk Management',
            subcategories: [
              { code: 'GV.RM-01', name: 'Risk objectives are established' },
              { code: 'GV.RM-02', name: 'Risk appetite is established' },
            ],
          },
        ],
      },
    ],
  };
}

describe('buildFrameworkNavigation', () => {
  it('orders siblings by displayOrder, falling back to code', () => {
    const nav = buildFrameworkNavigation(framework());

    expect(nav.map((node) => node.code)).toEqual(['GV', 'ID']);
  });

  it('builds a nested tree with stable, unique ids/paths per node', () => {
    const [govern] = buildFrameworkNavigation(framework());

    expect(govern.path).toBe('nist-csf-2/GV');
    expect(govern.depth).toBe(0);
    expect(govern.children).toHaveLength(1);

    const [riskManagement] = govern.children;
    expect(riskManagement.path).toBe('nist-csf-2/GV/GV.RM');
    expect(riskManagement.depth).toBe(1);
    expect(riskManagement.children.map((node) => node.code)).toEqual(['GV.RM-01', 'GV.RM-02']);
    expect(riskManagement.children[0].depth).toBe(2);
    expect(riskManagement.children[0].path).toBe('nist-csf-2/GV/GV.RM/GV.RM-01');
  });

  it('produces no framework-specific structure: an unrelated framework shape walks the same way', () => {
    const isoLike: FrameworkDefinition = {
      slug: 'iso-27001',
      name: 'ISO/IEC 27001',
      version: '2022',
      frameworkType: 'ISO_27001',
      functions: [
        {
          code: 'A.5',
          name: 'Organizational controls',
          categories: [
            {
              code: 'A.5.1',
              name: 'Policies for information security',
              subcategories: [],
            },
          ],
        },
      ],
    };

    const nav = buildFrameworkNavigation(isoLike);
    expect(nav[0].children[0].children).toEqual([]);
    expect(nav[0].label).toBe('Organizational controls');
  });
});
