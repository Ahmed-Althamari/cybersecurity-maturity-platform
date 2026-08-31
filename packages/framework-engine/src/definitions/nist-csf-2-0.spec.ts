import { validateFrameworkDefinition } from '../validator';
import { NIST_CSF_2_0 } from './nist-csf-2-0';
import nistCsf2_0Raw from './nist-csf-2.0.json';

describe('NIST_CSF_2_0', () => {
  it('validates cleanly against the framework-agnostic definition schema', () => {
    const result = validateFrameworkDefinition(nistCsf2_0Raw);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('matches the official NIST CSF 2.0 totals: 6 functions, 22 categories, 106 subcategories', () => {
    expect(NIST_CSF_2_0.functions).toHaveLength(6);

    const categoryCount = NIST_CSF_2_0.functions.reduce((sum, fn) => sum + fn.categories.length, 0);
    expect(categoryCount).toBe(22);

    const subcategoryCount = NIST_CSF_2_0.functions.reduce(
      (sum, fn) => sum + fn.categories.reduce((s, cat) => s + cat.subcategories.length, 0),
      0,
    );
    expect(subcategoryCount).toBe(106);
  });

  it('includes the six canonical function codes in NIST order', () => {
    expect(NIST_CSF_2_0.functions.map((fn) => fn.code)).toEqual([
      'GV',
      'ID',
      'PR',
      'DE',
      'RS',
      'RC',
    ]);
  });

  it('every subcategory code is namespaced under its parent category code', () => {
    for (const fn of NIST_CSF_2_0.functions) {
      for (const category of fn.categories) {
        for (const subcategory of category.subcategories) {
          expect(subcategory.code.startsWith(`${category.code}-`)).toBe(true);
        }
      }
    }
  });

  it('generates exactly one assessment question per subcategory', () => {
    for (const fn of NIST_CSF_2_0.functions) {
      for (const category of fn.categories) {
        for (const subcategory of category.subcategories) {
          expect(subcategory.questions).toHaveLength(1);
        }
      }
    }
  });
});
