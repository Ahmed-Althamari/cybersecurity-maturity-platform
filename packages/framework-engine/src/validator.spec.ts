import {
  assertValidFrameworkDefinition,
  FrameworkValidationError,
  validateFrameworkDefinition,
} from './validator';

function validDefinition() {
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

describe('validateFrameworkDefinition', () => {
  it('accepts a well-formed framework-agnostic definition', () => {
    const result = validateFrameworkDefinition(validDefinition());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data?.slug).toBe('nist-csf');
  });

  it('rejects a definition missing required shape fields', () => {
    const result = validateFrameworkDefinition({ name: 'Incomplete' });

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects a slug with invalid characters', () => {
    const definition = validDefinition();
    definition.slug = 'Not A Valid Slug!';

    const result = validateFrameworkDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('slug'))).toBe(true);
  });

  it('rejects a framework with no functions', () => {
    const definition = validDefinition();
    definition.functions = [];

    const result = validateFrameworkDefinition(definition);

    expect(result.valid).toBe(false);
  });

  it('rejects duplicate function codes within a framework', () => {
    const definition = validDefinition();
    definition.functions.push({ ...validDefinition().functions[0] });

    const result = validateFrameworkDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('Duplicate function code'))).toBe(true);
  });

  it('rejects duplicate category codes within a function, case-insensitively', () => {
    const definition = validDefinition();
    definition.functions[0].categories.push({
      ...definition.functions[0].categories[0],
      code: 'gv.rm',
    });

    const result = validateFrameworkDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('Duplicate category code'))).toBe(true);
  });

  it('rejects duplicate subcategory codes within a category', () => {
    const definition = validDefinition();
    const category = definition.functions[0].categories[0];
    category.subcategories.push({ ...category.subcategories[0] });

    const result = validateFrameworkDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('Duplicate subcategory code'))).toBe(
      true,
    );
  });
});

describe('assertValidFrameworkDefinition', () => {
  it('returns the parsed definition on success', () => {
    expect(assertValidFrameworkDefinition(validDefinition()).slug).toBe('nist-csf');
  });

  it('throws FrameworkValidationError carrying the issue list on failure', () => {
    try {
      assertValidFrameworkDefinition({ name: 'Incomplete' });
      throw new Error('expected assertValidFrameworkDefinition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(FrameworkValidationError);
      expect((error as FrameworkValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});
