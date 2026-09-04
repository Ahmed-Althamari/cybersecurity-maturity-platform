import { FrameworkValidationError } from './errors';
import { loadFrameworkFromJson, parseFrameworkDefinition } from './loader';

function validFramework() {
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
            subcategories: [
              { code: 'GV.RM-01', name: 'Risk management objectives are established' },
              { code: 'GV.RM-02', name: 'Risk appetite is established' },
            ],
          },
        ],
      },
      {
        code: 'ID',
        name: 'Identify',
        categories: [],
      },
    ],
  };
}

describe('parseFrameworkDefinition', () => {
  it('accepts a well-formed framework and fills in defaults', () => {
    const framework = parseFrameworkDefinition(validFramework());

    expect(framework.slug).toBe('nist-csf-2');
    expect(framework.functions).toHaveLength(2);
    expect(framework.functions[0].categories[0].subcategories).toHaveLength(2);
    expect(framework.functions[1].categories).toEqual([]);
  });

  it('rejects a framework with no functions', () => {
    const input = validFramework();
    input.functions = [];

    expect(() => parseFrameworkDefinition(input)).toThrow(FrameworkValidationError);
  });

  it('rejects an invalid slug', () => {
    const input = validFramework();
    input.slug = 'Not A Slug!';

    try {
      parseFrameworkDefinition(input);
      fail('expected parseFrameworkDefinition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(FrameworkValidationError);
      const validationError = error as FrameworkValidationError;
      expect(validationError.issues.some((issue) => issue.path === 'slug')).toBe(true);
    }
  });

  it('rejects a code with disallowed characters', () => {
    const input = validFramework();
    input.functions[0].code = 'GV$';

    expect(() => parseFrameworkDefinition(input)).toThrow(FrameworkValidationError);
  });

  it('reports every issue in one pass, not just the first', () => {
    const input = validFramework();
    input.slug = 'Bad Slug';
    input.name = '';

    try {
      parseFrameworkDefinition(input);
      fail('expected parseFrameworkDefinition to throw');
    } catch (error) {
      const validationError = error as FrameworkValidationError;
      expect(validationError.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects duplicate function codes', () => {
    const input = validFramework();
    input.functions.push({ code: 'GV', name: 'Govern Again', categories: [] });

    try {
      parseFrameworkDefinition(input);
      fail('expected parseFrameworkDefinition to throw');
    } catch (error) {
      const validationError = error as FrameworkValidationError;
      expect(validationError.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'functions', message: expect.stringContaining('GV') })]),
      );
    }
  });

  it('rejects duplicate category codes within the same function', () => {
    const input = validFramework();
    input.functions[0].categories.push({
      code: 'GV.RM',
      name: 'Risk Management Duplicate',
      subcategories: [],
    });

    expect(() => parseFrameworkDefinition(input)).toThrow(FrameworkValidationError);
  });

  it('rejects duplicate subcategory codes within the same category, but allows the same code across different categories', () => {
    const input = validFramework();
    input.functions[0].categories[0].subcategories.push({
      code: 'GV.RM-01',
      name: 'Duplicate subcategory',
    });
    expect(() => parseFrameworkDefinition(input)).toThrow(FrameworkValidationError);

    const crossCategoryInput = validFramework();
    crossCategoryInput.functions[0].categories.push({
      code: 'GV.SC',
      name: 'Supply Chain',
      subcategories: [{ code: 'GV.RM-01', name: 'Reused code in a different category' }],
    });
    expect(() => parseFrameworkDefinition(crossCategoryInput)).not.toThrow();
  });
});

describe('loadFrameworkFromJson', () => {
  it('parses a JSON string into a validated framework', () => {
    const framework = loadFrameworkFromJson(JSON.stringify(validFramework()));
    expect(framework.functions[0].code).toBe('GV');
  });

  it('throws SyntaxError for malformed JSON', () => {
    expect(() => loadFrameworkFromJson('{not valid json')).toThrow(SyntaxError);
  });
});
