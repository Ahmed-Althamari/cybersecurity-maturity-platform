import type { RiskLevel as PrismaRiskLevel } from '@cmmp/database';
import { RiskLevelSchema } from '@cmmp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';

/** Validates a query-string risk level against `@cmmp/shared`'s zod schema (same members as Prisma's own enum) before it reaches the `where` clause. */
function parseRiskLevelFilter(riskLevel: string | undefined): PrismaRiskLevel | undefined {
  if (riskLevel === undefined) return undefined;
  const parsed = RiskLevelSchema.safeParse(riskLevel);
  if (!parsed.success) {
    throw new BadRequestException(`Invalid riskLevel '${riskLevel}'`);
  }
  return parsed.data as PrismaRiskLevel;
}

const riskDetailInclude = {
  assessmentItem: {
    include: { question: { include: { subcategory: { select: { code: true, name: true } } } } },
  },
  initiatives: { where: { deletedAt: null } },
  recommendations: true,
};

/**
 * Master prompt §20's roadmap priority formula ("Risk × Gap × Business
 * Criticality × Weight") is deliberately *not* hard-coded there — this is
 * the risk-side analogue: a 5x5 likelihood×impact matrix banded into
 * `RiskLevel`, kept as one clearly-named function so it can be swapped
 * for a configurable formula later without hunting through the service.
 */
function riskLevelFromScore(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL' {
  if (score >= 20) return 'CRITICAL';
  if (score >= 12) return 'HIGH';
  if (score >= 6) return 'MEDIUM';
  if (score >= 3) return 'LOW';
  return 'MINIMAL';
}

@Injectable()
export class RisksService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRiskDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (dto.assessmentItemId) {
      const item = await this.prisma.assessmentItem.findFirst({
        where: { id: dto.assessmentItemId, assessment: { tenantId, organisationId: dto.organisationId } },
      });
      if (!item) {
        throw new NotFoundException("Assessment item not found for this organisation");
      }
    }

    const inherentRiskScore = dto.likelihood * dto.impact;

    return this.prisma.risk.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        title: dto.title,
        description: dto.description,
        threat: dto.threat,
        vulnerability: dto.vulnerability,
        assessmentItemId: dto.assessmentItemId,
        likelihood: dto.likelihood,
        impact: dto.impact,
        inherentRiskScore,
        riskLevel: riskLevelFromScore(inherentRiskScore),
        owner: dto.owner,
        treatment: dto.treatment,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
    });
  }

  async findAll(
    tenantId: string,
    organisationId: string,
    options: { status?: string; riskLevel?: string; sort?: 'priority' | 'recent' } = {},
  ) {
    return this.prisma.risk.findMany({
      where: { tenantId, organisationId, deletedAt: null, status: options.status, riskLevel: parseRiskLevelFilter(options.riskLevel) },
      orderBy:
        options.sort === 'priority'
          ? [{ inherentRiskScore: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }],
    });
  }

  async findOne(id: string, tenantId: string) {
    const risk = await this.prisma.risk.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: riskDetailInclude,
    });
    if (!risk) {
      throw new NotFoundException('Risk not found');
    }
    return risk;
  }

  async update(id: string, tenantId: string, dto: UpdateRiskDto) {
    const existing = await this.findOne(id, tenantId);

    const likelihood = dto.likelihood ?? existing.likelihood;
    const impact = dto.impact ?? existing.impact;
    const scoreChanged = dto.likelihood !== undefined || dto.impact !== undefined;
    const inherentRiskScore = scoreChanged ? likelihood * impact : existing.inherentRiskScore;

    return this.prisma.risk.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        threat: dto.threat,
        vulnerability: dto.vulnerability,
        likelihood: dto.likelihood,
        impact: dto.impact,
        inherentRiskScore,
        riskLevel: scoreChanged && inherentRiskScore !== null ? riskLevelFromScore(inherentRiskScore) : undefined,
        residualRiskScore: dto.residualRiskScore,
        owner: dto.owner,
        treatment: dto.treatment,
        status: dto.status,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.risk.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Risk deleted successfully' };
  }
}
