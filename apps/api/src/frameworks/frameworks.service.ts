import { buildFrameworkCreateInput, frameworkTreeInclude, Prisma, toFrameworkDefinition, type FrameworkWithTree } from '@cmmp/database';
import { buildFrameworkNavigation, FrameworkValidationError, parseFrameworkDefinition, type FrameworkDefinition } from '@cmmp/framework-engine';
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
        data: buildFrameworkCreateInput(tenantId, definition),
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
