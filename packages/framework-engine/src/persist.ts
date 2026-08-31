import { FRAMEWORK_TREE_INCLUDE, hydrateFrameworkTree } from './loader';
import type { RawFrameworkRecord } from './loader';
import type { FrameworkDefinition, FrameworkTree } from './types';

// Same structural-client approach as `FrameworkQueryClient` in loader.ts:
// a minimal shape rather than a hard `@prisma/client` dependency, so this
// helper is reusable from both the NestJS API and the standalone Prisma
// seed script without either needing to know about the other.
export interface FrameworkWriteClient {
  framework: {
    create(args: {
      data: Record<string, unknown>;
      include: typeof FRAMEWORK_TREE_INCLUDE;
    }): Promise<RawFrameworkRecord>;
  };
}

/**
 * Persists a validated `FrameworkDefinition` as a Framework and its full
 * nested Function/Category/Subcategory/Question hierarchy in a single
 * Prisma nested-create, then hydrates the result back into a `FrameworkTree`.
 * The single source of truth for "how a definition becomes DB rows" —
 * both `FrameworkService.create` (apps/api) and `prisma/seed.ts` call this
 * rather than duplicating the nested-create shape.
 */
export async function persistFrameworkDefinition(
  client: FrameworkWriteClient,
  tenantId: string,
  definition: FrameworkDefinition,
): Promise<FrameworkTree> {
  const record = await client.framework.create({
    data: {
      tenantId,
      name: definition.name,
      slug: definition.slug,
      version: definition.version,
      frameWorkType: definition.frameworkType,
      description: definition.description,
      functions: {
        create: definition.functions.map((fn, fnIndex) => ({
          code: fn.code,
          name: fn.name,
          description: fn.description,
          displayOrder: fn.displayOrder ?? fnIndex,
          categories: {
            create: fn.categories.map((category, categoryIndex) => ({
              code: category.code,
              name: category.name,
              description: category.description,
              displayOrder: category.displayOrder ?? categoryIndex,
              subcategories: {
                create: category.subcategories.map((subcategory, subcategoryIndex) => ({
                  code: subcategory.code,
                  name: subcategory.name,
                  description: subcategory.description,
                  displayOrder: subcategory.displayOrder ?? subcategoryIndex,
                  assessmentQuestions: {
                    create: (subcategory.questions ?? []).map((question) => ({
                      question: question.question,
                      guidance: question.guidance,
                      examples: question.examples ? JSON.stringify(question.examples) : null,
                      referenceLinks: question.referenceLinks
                        ? JSON.stringify(question.referenceLinks)
                        : null,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
    include: FRAMEWORK_TREE_INCLUDE,
  });

  return hydrateFrameworkTree(record);
}
