import { Prisma } from '@cmmp/database';
import {
  buildFrameworkNavigation,
  FrameworkValidationError,
  parseFrameworkDefinition,
  type CategoryDefinition,
  type FrameworkDefinition,
  type FunctionDefinition,
  type SubcategoryDefinition,
} from '@cmmp/framework-engine';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const frameworkSummarySelect = {
  id: true,
  name: true,
  slug: true,
  version: true,
  frameWorkType: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const frameworkTreeInclude = {
  functions: {
    orderBy: { displayOrder: 'asc' as const },
    include: {
      categories: {
        orderBy: { displayOrder: 'asc' as const },
        include: {
          subcategories: {
            orderBy: { displayOrder: 'asc' as const },
          },
        },
      },
    },
  },
};

type FrameworkWithTree = Prisma.FrameworkGetPayload<{ include: typeof frameworkTreeInclude }>;

/** Maps the nested Prisma read model onto the framework-engine's generic `FrameworkDefinition` shape. */
function toFrameworkDefinition(framework: FrameworkWithTree): FrameworkDefinition {
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

@Injectable()
export class FrameworksService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.framework.findMany({
      where: { tenantId, deletedAt: null },
      select: frameworkSummarySelect,
      orderBy: { name: 'asc' },
    });
  }

  private async findWithTree(id: string, tenantId: string): Promise<FrameworkWithTree> {
    const framework = await this.prisma.framework.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: frameworkTreeInclude,
    });
    if (!framework) {
      throw new NotFoundException('Framework not found');
    }
    return framework;
  }

  async findOne(id: string, tenantId: string) {
    return this.findWithTree(id, tenantId);
  }

  async getNavigation(id: string, tenantId: string) {
    const framework = await this.findWithTree(id, tenantId);
    return buildFrameworkNavigation(toFrameworkDefinition(framework));
  }

  /**
   * Loads a framework definition (validated by `@cmmp/framework-engine`)
   * and persists the whole function/category/subcategory tree in one
   * transaction. This is how a new framework — NIST CSF, ISO 27001, a
   * custom one — gets onto the platform without a code change.
   */
  async importDefinition(tenantId: string, rawDefinition: unknown) {
    let definition: FrameworkDefinition;
    try {
      definition = parseFrameworkDefinition(rawDefinition);
    } catch (error) {
      if (error instanceof FrameworkValidationError) {
        throw new BadRequestException({ message: 'Invalid framework definition', issues: error.issues });
      }
      throw error;
    }

    try {
      return await this.prisma.framework.create({
        data: {
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
        },
        select: frameworkSummarySelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A framework with this slug and version already exists for this tenant');
      }
      throw error;
    }
  }
}
