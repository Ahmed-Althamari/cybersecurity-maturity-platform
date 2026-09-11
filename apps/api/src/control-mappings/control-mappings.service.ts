import { frameworkTreeInclude, Prisma } from '@cmmp/database';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CreateControlMappingDto } from './dto/create-control-mapping.dto';

export interface FrameworkSubcategorySummary {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  functionCode: string;
  functionName: string;
}

export interface FrameworkCrosswalkSide {
  id: string;
  name: string;
  subcategories: FrameworkSubcategorySummary[];
}

/**
 * Lets a tenant build its own crosswalk between two frameworks it has loaded (e.g. NIST CSF to
 * ISO 27001) — mapping one subcategory to another with a relationship type. Deliberately
 * independent of which is "source" vs "target": that's just whichever side the user picked first
 * when creating the mapping, not an ordering the frameworks themselves impose.
 */
@Injectable()
export class ControlMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFrameworkSubcategories(tenantId: string, frameworkId: string): Promise<FrameworkCrosswalkSide> {
    const framework = await this.prisma.framework.findFirst({
      where: { id: frameworkId, tenantId, deletedAt: null },
      include: frameworkTreeInclude,
    });
    if (!framework) {
      throw new NotFoundException('Framework not found');
    }

    const subcategories = framework.functions.flatMap((fn) =>
      fn.categories.flatMap((category) =>
        category.subcategories.map((subcategory) => ({
          id: subcategory.id,
          code: subcategory.code,
          name: subcategory.name,
          categoryCode: category.code,
          categoryName: category.name,
          functionCode: fn.code,
          functionName: fn.name,
        })),
      ),
    );

    return { id: framework.id, name: framework.name, subcategories };
  }

  /**
   * Both frameworks' full subcategory lists (for rendering the crosswalk grid) plus every
   * mapping between them, in either direction — a mapping created with this pair's subcategories
   * on either side of `sourceSubcategoryId`/`targetSubcategoryId` still shows up here.
   */
  async findBetweenFrameworks(tenantId: string, sourceFrameworkId: string, targetFrameworkId: string) {
    const [sourceFramework, targetFramework] = await Promise.all([
      this.getFrameworkSubcategories(tenantId, sourceFrameworkId),
      this.getFrameworkSubcategories(tenantId, targetFrameworkId),
    ]);

    const sourceIds = sourceFramework.subcategories.map((s) => s.id);
    const targetIds = targetFramework.subcategories.map((s) => s.id);

    const mappings = await this.prisma.controlMapping.findMany({
      where: {
        tenantId,
        OR: [
          { sourceSubcategoryId: { in: sourceIds }, targetSubcategoryId: { in: targetIds } },
          { sourceSubcategoryId: { in: targetIds }, targetSubcategoryId: { in: sourceIds } },
        ],
      },
    });

    return { sourceFramework, targetFramework, mappings };
  }

  async create(tenantId: string, userId: string, dto: CreateControlMappingDto) {
    if (dto.sourceSubcategoryId === dto.targetSubcategoryId) {
      throw new BadRequestException('sourceSubcategoryId and targetSubcategoryId must be different');
    }

    const [source, target] = await Promise.all([
      this.findSubcategoryForTenant(tenantId, dto.sourceSubcategoryId),
      this.findSubcategoryForTenant(tenantId, dto.targetSubcategoryId),
    ]);
    if (!source || !target) {
      throw new NotFoundException('sourceSubcategoryId or targetSubcategoryId not found for this tenant');
    }

    try {
      return await this.prisma.controlMapping.create({
        data: {
          tenantId,
          sourceSubcategoryId: dto.sourceSubcategoryId,
          targetSubcategoryId: dto.targetSubcategoryId,
          relationship: dto.relationship,
          notes: dto.notes,
          createdById: userId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A mapping between these two subcategories already exists');
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.controlMapping.deleteMany({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Control mapping not found');
    }
  }

  private async findSubcategoryForTenant(tenantId: string, subcategoryId: string) {
    return this.prisma.subcategory.findFirst({
      where: { id: subcategoryId, category: { function: { framework: { tenantId } } } },
    });
  }
}
