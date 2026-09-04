import { ZodError } from 'zod';

import { FrameworkValidationError, type FrameworkValidationIssue } from './errors';
import { frameworkDefinitionSchema } from './schema';
import type { FrameworkDefinition } from './types';

function zodErrorToIssues(error: ZodError): FrameworkValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function findDuplicateCodes(items: { code: string }[], path: string): FrameworkValidationIssue[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    seen.set(item.code, (seen.get(item.code) ?? 0) + 1);
  }

  const issues: FrameworkValidationIssue[] = [];
  for (const [code, count] of seen) {
    if (count > 1) {
      issues.push({ path, message: `duplicate code "${code}" (${count} occurrences)` });
    }
  }
  return issues;
}

/** Structural invariants zod's shape validation can't express: sibling codes must be unique at every level. */
function validateHierarchy(framework: FrameworkDefinition): FrameworkValidationIssue[] {
  const issues: FrameworkValidationIssue[] = [];

  issues.push(...findDuplicateCodes(framework.functions, 'functions'));

  for (const fn of framework.functions) {
    issues.push(...findDuplicateCodes(fn.categories, `functions[${fn.code}].categories`));

    for (const category of fn.categories) {
      issues.push(
        ...findDuplicateCodes(category.subcategories, `functions[${fn.code}].categories[${category.code}].subcategories`),
      );
    }
  }

  return issues;
}

/**
 * Validates and normalises a raw framework definition (parsed JSON, a
 * hand-built object, or a shape assembled from database rows) into a
 * `FrameworkDefinition`. Throws `FrameworkValidationError` with every issue
 * found, not just the first, so a bad import can be fixed in one pass.
 */
export function parseFrameworkDefinition(input: unknown): FrameworkDefinition {
  const result = frameworkDefinitionSchema.safeParse(input);
  if (!result.success) {
    throw new FrameworkValidationError(zodErrorToIssues(result.error));
  }

  const framework = result.data as FrameworkDefinition;
  const hierarchyIssues = validateHierarchy(framework);
  if (hierarchyIssues.length > 0) {
    throw new FrameworkValidationError(hierarchyIssues);
  }

  return framework;
}

/** Convenience wrapper for loading a definition from a JSON string. Throws `SyntaxError` on malformed JSON. */
export function loadFrameworkFromJson(json: string): FrameworkDefinition {
  return parseFrameworkDefinition(JSON.parse(json));
}
