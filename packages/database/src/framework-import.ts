import type { CategoryDefinition, FrameworkDefinition, FunctionDefinition, SubcategoryDefinition } from '@cmmp/framework-engine';

import { Prisma } from '@prisma/client';

/**
 * Shared Prisma <-> `@cmmp/framework-engine` mapping, used by both the API's
 * `FrameworksService` and the seed script so there is one place that knows
 * how a `FrameworkDefinition` is persisted and read back.
 */
export const frameworkTreeInclude = {
  functions: {
    orderBy: { displayOrder: 'asc' as const },
    include: {
      categories: {
        orderBy: { displayOrder: 'asc' as const },
        include: {
          subcategories: {
            orderBy: { displayOrder: 'asc' as const },
            include: {
              assessmentQuestions: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.FrameworkInclude;

export type FrameworkWithTree = Prisma.FrameworkGetPayload<{ include: typeof frameworkTreeInclude }>;

/** Maps the nested Prisma read model onto the framework-engine's generic `FrameworkDefinition` shape. */
export function toFrameworkDefinition(framework: FrameworkWithTree): FrameworkDefinition {
  return {
    slug: framework.slug,
    name: framework.name,
    version: framework.version,
    frameworkType: framework.frameWorkType,
    description: framework.description ?? undefined,
    isActive: framework.isActive,
    functions: framework.functions.map(
      (fn): FunctionDefinition => ({
        code: fn.code,
        name: fn.name,
        description: fn.description ?? undefined,
        displayOrder: fn.displayOrder,
        categories: fn.categories.map(
          (category): CategoryDefinition => ({
            code: category.code,
            name: category.name,
            description: category.description ?? undefined,
            displayOrder: category.displayOrder,
            subcategories: category.subcategories.map(
              (subcategory): SubcategoryDefinition => ({
                code: subcategory.code,
                name: subcategory.name,
                description: subcategory.description ?? undefined,
                displayOrder: subcategory.displayOrder,
              }),
            ),
          }),
        ),
      }),
    ),
  };
}

/**
 * Builds the nested Prisma create input for persisting a validated
 * `FrameworkDefinition` (and its whole function/category/subcategory/
 * question tree) as one transaction.
 */
export function buildFrameworkCreateInput(tenantId: string, definition: FrameworkDefinition): Prisma.FrameworkUncheckedCreateInput {
  return {
    tenantId,
    name: definition.name,
    slug: definition.slug,
    version: definition.version,
    frameWorkType: definition.frameworkType,
    description: definition.description,
    isActive: definition.isActive ?? true,
    functions: {
      create: definition.functions.map((fn) => ({
        code: fn.code,
        name: fn.name,
        description: fn.description,
        displayOrder: fn.displayOrder ?? 0,
        categories: {
          create: fn.categories.map((category) => ({
            code: category.code,
            name: category.name,
            description: category.description,
            displayOrder: category.displayOrder ?? 0,
            subcategories: {
              create: category.subcategories.map((subcategory) => ({
                code: subcategory.code,
                name: subcategory.name,
                description: subcategory.description,
                displayOrder: subcategory.displayOrder ?? 0,
                assessmentQuestions: {
                  create: (subcategory.questions ?? []).map((question) => ({
                    question: question.question,
                    guidance: question.guidance,
                    examples: question.examples ? JSON.stringify(question.examples) : undefined,
                    referenceLinks: question.referenceLinks ? JSON.stringify(question.referenceLinks) : undefined,
                  })),
                },
              })),
            },
          })),
        },
      })),
    },
  };
}
