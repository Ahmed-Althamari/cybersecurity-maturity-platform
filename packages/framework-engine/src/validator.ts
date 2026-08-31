import { z } from 'zod';
import { FrameworkDefinitionSchema, type FrameworkDefinition } from './types';

export class FrameworkValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
    this.name = 'FrameworkValidationError';
  }
}

function findDuplicates(codes: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const code of codes) {
    const normalised = code.toUpperCase();
    if (seen.has(normalised)) {
      duplicates.add(code);
    }
    seen.add(normalised);
  }
  return [...duplicates];
}

/**
 * Structural checks beyond what the Zod shape schema can express: code
 * uniqueness is scoped to siblings, not global, so it has to be walked.
 */
export function validateFrameworkStructure(definition: FrameworkDefinition): string[] {
  const issues: string[] = [];

  const functionDuplicates = findDuplicates(definition.functions.map((fn) => fn.code));
  if (functionDuplicates.length > 0) {
    issues.push(`Duplicate function code(s) within framework: ${functionDuplicates.join(', ')}`);
  }

  for (const fn of definition.functions) {
    const categoryDuplicates = findDuplicates(fn.categories.map((cat) => cat.code));
    if (categoryDuplicates.length > 0) {
      issues.push(
        `Duplicate category code(s) within function '${fn.code}': ${categoryDuplicates.join(', ')}`,
      );
    }

    for (const category of fn.categories) {
      const subcategoryDuplicates = findDuplicates(
        category.subcategories.map((sub) => sub.code),
      );
      if (subcategoryDuplicates.length > 0) {
        issues.push(
          `Duplicate subcategory code(s) within category '${category.code}': ${subcategoryDuplicates.join(', ')}`,
        );
      }
    }
  }

  return issues;
}

export interface FrameworkValidationResult {
  valid: boolean;
  data?: FrameworkDefinition;
  issues: string[];
}

/**
 * Validates an arbitrary payload against the framework-agnostic definition
 * shape, then applies structural (cross-field) checks. Used both when a
 * framework is authored/imported (Phase 8: Excel import engine) and when
 * seeding built-in frameworks such as NIST CSF 2.0 (Phase 5).
 */
export function validateFrameworkDefinition(input: unknown): FrameworkValidationResult {
  const parsed = FrameworkDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: formatZodIssues(parsed.error),
    };
  }

  const structuralIssues = validateFrameworkStructure(parsed.data);
  if (structuralIssues.length > 0) {
    return { valid: false, data: parsed.data, issues: structuralIssues };
  }

  return { valid: true, data: parsed.data, issues: [] };
}

/**
 * Same as {@link validateFrameworkDefinition} but throws
 * {@link FrameworkValidationError} on failure, for call sites that prefer
 * exceptions over result objects (e.g. NestJS request handlers, where the
 * error is caught and turned into a 400 response).
 */
export function assertValidFrameworkDefinition(input: unknown): FrameworkDefinition {
  const result = validateFrameworkDefinition(input);
  if (!result.valid || !result.data) {
    throw new FrameworkValidationError('Invalid framework definition', result.issues);
  }
  return result.data;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
