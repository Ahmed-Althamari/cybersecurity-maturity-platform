import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CreatePinnedInsightDto } from './dto/create-pinned-insight.dto';

/**
 * Charts a user explicitly chose to "pin" from the Data Analysis page onto the tenant's shared
 * dashboard (apps/web/pages/dashboard.tsx) — never created as a side effect of running an
 * analysis, only ever by this explicit write.
 */
@Injectable()
export class PinnedInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForOrganisation(tenantId: string, organisationId: string) {
    return this.prisma.pinnedInsight.findMany({
      where: { tenantId, organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreatePinnedInsightDto) {
    const organisation = await this.prisma.organisation.findFirst({ where: { id: dto.organisationId, tenantId } });
    if (!organisation) {
      throw new NotFoundException('Organisation not found for this tenant');
    }

    return this.prisma.pinnedInsight.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        title: dto.title,
        imageBase64: dto.imageBase64,
        chartData: dto.chartData,
        sourceFileName: dto.sourceFileName,
        createdById: userId,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.pinnedInsight.deleteMany({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Pinned insight not found');
    }
  }
}
