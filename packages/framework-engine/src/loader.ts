import type { CategoryNode, FrameworkTree, FunctionNode, QuestionNode, SubcategoryNode } from './types';

// The loader is written against a minimal structural client rather than
// `@prisma/client`'s generated `PrismaClient` so that `@cmmp/framework-engine`
// stays a plain, framework-agnostic (and Prisma-agnostic) package per
// ADR-006 — it can be unit tested with a hand-rolled mock and reused if the
// persistence layer ever changes. `PrismaService` from `apps/api` already
// satisfies this shape structurally, no adapter needed.
export interface FrameworkQueryClient {
  framework: {
    findFirst(args: {
      where: {
        tenantId: string;
        slug: string;
        version?: string;
        isActive?: boolean;
        deletedAt?: null;
      };
      orderBy?: { version: 'asc' | 'desc' };
      include: typeof FRAMEWORK_TREE_INCLUDE;
    }): Promise<RawFrameworkRecord | null>;
  };
}

// Shared `include` shape so callers construct queries identical to what this
// loader expects to receive back — keeps the Prisma query and the hydration
// logic below from drifting apart.
export const FRAMEWORK_TREE_INCLUDE = {
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
};

interface RawQuestionRecord {
  id: string;
  question: string;
  guidance: string | null;
  examples: string | null;
  referenceLinks: string | null;
}

interface RawSubcategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  assessmentQuestions: RawQuestionRecord[];
}

interface RawCategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  subcategories: RawSubcategoryRecord[];
}

interface RawFunctionRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  categories: RawCategoryRecord[];
}

export interface RawFrameworkRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  version: string;
  frameWorkType: string;
  description: string | null;
  isActive: boolean;
  functions: RawFunctionRecord[];
}

export interface LoadFrameworkTreeParams {
  tenantId: string;
  slug: string;
  /** Pin to an exact version; omitted = the most recent active version. */
  version?: string;
}

export class FrameworkNotFoundError extends Error {
  constructor(slug: string, tenantId: string) {
    super(`Framework '${slug}' was not found for tenant '${tenantId}'`);
    this.name = 'FrameworkNotFoundError';
  }
}

/**
 * Loads a full Framework → Function → Category → Subcategory → Question
 * hierarchy for a tenant, ordered by each level's `displayOrder`. This is
 * the one place that knows how to turn Prisma's nested-include result into
 * the framework-agnostic `FrameworkTree` shape the rest of the platform
 * (scoring engine, assessment engine, dashboard, UI) consumes — none of
 * those need to know about NIST CSF, ISO 27001, or any other specific
 * framework's structure.
 */
export async function loadFrameworkTree(
  client: FrameworkQueryClient,
  params: LoadFrameworkTreeParams,
): Promise<FrameworkTree> {
  const record = await client.framework.findFirst({
    where: {
      tenantId: params.tenantId,
      slug: params.slug,
      ...(params.version ? { version: params.version } : { isActive: true }),
      deletedAt: null,
    },
    ...(params.version ? {} : { orderBy: { version: 'desc' } }),
    include: FRAMEWORK_TREE_INCLUDE,
  });

  if (!record) {
    throw new FrameworkNotFoundError(params.slug, params.tenantId);
  }

  return hydrateFrameworkTree(record);
}

export function hydrateFrameworkTree(record: RawFrameworkRecord): FrameworkTree {
  return {
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    slug: record.slug,
    version: record.version,
    frameworkType: record.frameWorkType,
    description: record.description,
    isActive: record.isActive,
    functions: record.functions.map(hydrateFunctionNode),
  };
}

function hydrateFunctionNode(fn: RawFunctionRecord): FunctionNode {
  return {
    id: fn.id,
    code: fn.code,
    name: fn.name,
    description: fn.description,
    displayOrder: fn.displayOrder,
    categories: fn.categories.map(hydrateCategoryNode),
  };
}

function hydrateCategoryNode(category: RawCategoryRecord): CategoryNode {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description,
    displayOrder: category.displayOrder,
    subcategories: category.subcategories.map(hydrateSubcategoryNode),
  };
}

function hydrateSubcategoryNode(subcategory: RawSubcategoryRecord): SubcategoryNode {
  return {
    id: subcategory.id,
    code: subcategory.code,
    name: subcategory.name,
    description: subcategory.description,
    displayOrder: subcategory.displayOrder,
    questions: subcategory.assessmentQuestions.map(hydrateQuestionNode),
  };
}

function hydrateQuestionNode(question: RawQuestionRecord): QuestionNode {
  return {
    id: question.id,
    question: question.question,
    guidance: question.guidance,
    examples: question.examples,
    referenceLinks: question.referenceLinks,
  };
}
