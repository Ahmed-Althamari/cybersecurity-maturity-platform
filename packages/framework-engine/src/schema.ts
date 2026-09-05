import { z } from 'zod';

// A code is the short identifier used throughout the hierarchy (e.g. "GV",
// "GV.RM", "GV.RM-01" for NIST CSF; "A.5.1" for ISO 27001; "1.1" for CIS).
// Deliberately permissive about separators/casing so the schema stays
// framework-agnostic rather than baking in one framework's convention.
const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is required')
  .max(64, 'code must be 64 characters or fewer')
  .regex(/^[A-Za-z0-9]+(?:[.\-_][A-Za-z0-9]+)*$/, 'code may only contain letters, digits, and . - _ separators');

const nameSchema = z.string().trim().min(1, 'name is required').max(256, 'name must be 256 characters or fewer');

export const questionDefinitionSchema = z.object({
  question: z.string().trim().min(1, 'question is required'),
  guidance: z.string().trim().min(1).optional(),
  examples: z.array(z.string().trim().min(1)).optional(),
  referenceLinks: z.array(z.string().trim().min(1)).optional(),
});

export const subcategoryDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().min(1).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  questions: z.array(questionDefinitionSchema).optional(),
});

export const categoryDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().min(1).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  subcategories: z.array(subcategoryDefinitionSchema).default([]),
});

export const functionDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().min(1).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  categories: z.array(categoryDefinitionSchema).default([]),
});

export const frameworkDefinitionSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'slug is required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (lowercase letters, digits, hyphens)'),
  name: nameSchema,
  version: z.string().trim().min(1, 'version is required'),
  frameworkType: z.string().trim().min(1, 'frameworkType is required'),
  description: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  functions: z.array(functionDefinitionSchema).min(1, 'a framework must define at least one function'),
});

export type FrameworkDefinitionInput = z.infer<typeof frameworkDefinitionSchema>;
