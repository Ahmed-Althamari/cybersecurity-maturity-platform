// Framework-agnostic type definitions (ADR-006).
//
// Two distinct shapes live here:
//  - "Definition" types describe a framework *before* it exists in the
//    database (used to author/import a framework such as NIST CSF 2.0 or,
//    later, ISO/IEC 27001 or CIS Controls without redesigning the system).
//  - "Node"/"Tree" types describe a framework *after* it has been persisted
//    and hydrated from the database, carrying real IDs.
import { z } from 'zod';

// ============================================================================
// DEFINITION SCHEMAS (authoring / import time)
// ============================================================================

const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is required')
  .max(64, 'code must be 64 characters or fewer');

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is required')
  .max(255, 'name must be 255 characters or fewer');

export const QuestionDefinitionSchema = z.object({
  question: z.string().trim().min(1, 'question text is required'),
  guidance: z.string().trim().optional(),
  examples: z.array(z.string().trim().min(1)).optional(),
  referenceLinks: z.array(z.string().trim().min(1)).optional(),
});

export const SubcategoryDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().optional(),
  displayOrder: z.number().int().min(0).optional(),
  questions: z.array(QuestionDefinitionSchema).optional().default([]),
});

export const CategoryDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().optional(),
  displayOrder: z.number().int().min(0).optional(),
  subcategories: z
    .array(SubcategoryDefinitionSchema)
    .min(1, 'a category must define at least one subcategory'),
});

export const FunctionDefinitionSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: z.string().trim().optional(),
  displayOrder: z.number().int().min(0).optional(),
  categories: z
    .array(CategoryDefinitionSchema)
    .min(1, 'a function must define at least one category'),
});

export const FrameworkDefinitionSchema = z.object({
  name: nameSchema,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase, alphanumeric, hyphen-separated'),
  version: z.string().trim().min(1, 'version is required'),
  frameworkType: z.string().trim().min(1, 'frameworkType is required'),
  description: z.string().trim().optional(),
  functions: z
    .array(FunctionDefinitionSchema)
    .min(1, 'a framework must define at least one function'),
});

export type QuestionDefinition = z.infer<typeof QuestionDefinitionSchema>;
export type SubcategoryDefinition = z.infer<typeof SubcategoryDefinitionSchema>;
export type CategoryDefinition = z.infer<typeof CategoryDefinitionSchema>;
export type FunctionDefinition = z.infer<typeof FunctionDefinitionSchema>;
export type FrameworkDefinition = z.infer<typeof FrameworkDefinitionSchema>;

// ============================================================================
// HYDRATED TREE TYPES (post-persistence, read from the database)
// ============================================================================

export interface QuestionNode {
  id: string;
  question: string;
  guidance: string | null;
  examples: string | null;
  referenceLinks: string | null;
}

export interface SubcategoryNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  questions: QuestionNode[];
}

export interface CategoryNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  subcategories: SubcategoryNode[];
}

export interface FunctionNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  categories: CategoryNode[];
}

export interface FrameworkTree {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  version: string;
  frameworkType: string;
  description: string | null;
  isActive: boolean;
  functions: FunctionNode[];
}
