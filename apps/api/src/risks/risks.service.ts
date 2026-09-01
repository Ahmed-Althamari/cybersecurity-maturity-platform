import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RiskLevel } from '@cmmp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';

const DEFAULT_LIKELIHOOD = 3;
const DEFAULT_IMPACT = 3;

// Score = likelihood x impact, both 1-5, so max 25. Thresholds chosen so the
// five RiskLevel bands are roughly even across that range.
const SCORE_THRESHOLDS: [minScore: number, level: RiskLevel][] = [
  [20, RiskLevel.CRITICAL],
  [12, RiskLevel.HIGH],
  [6, RiskLevel.MEDIUM],
  [3, RiskLevel.LOW],
];

/** Auto-derives a risk level from likelihood x impact when the caller doesn't specify one -- the "risk prioritization" half of the register. */
export function suggestRiskLevel(score: number): RiskLevel {
  for (const [minScore, level] of SCORE_THRESHOLDS) {
    if (score >= minScore) {
      return level;
    }
  }
  return RiskLevel.MINIMAL;
}

const riskInclude = {
  assessmentItem: {
    select: {
      id: true,
      assessmentId: true,
      question: {
        select: {
          question: true,
          subcategory: { select: { code: true, name: true } },
        },
      },
    },
  },
  initiatives: {
    select: { id: true, title: true, status: true, targetCompletionDate: true },
  },
};

export interface FindAllRisksFilters {
  organisationId?: string;
  riskLevel?: RiskLevel;
  status?: string;
  assessmentItemId?: string;
  sortBy?: 'score' | 'createdAt';
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
      await this.requireOwnAssessmentItem(tenantId, dto.assessmentItemId);
    }

    const likelihood = dto.likelihood ?? DEFAULT_LIKELIHOOD;
    const impact = dto.impact ?? DEFAULT_IMPACT;
    const inherentRiskScore = likelihood * impact;

    const risk = await this.prisma.risk.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        title: dto.title,
        description: dto.description,
        threat: dto.threat,
        vulnerability: dto.vulnerability,
        assessmentItemId: dto.assessmentItemId,
        likelihood,
        impact,
        inherentRiskScore,
        riskLevel: dto.riskLevel ?? suggestRiskLevel(inherentRiskScore),
        owner: dto.owner,
        treatment: dto.treatment,
        targetDate: dto.targetDate,
      },
      include: riskInclude,
    });
    return risk;
  }

  async findAll(tenantId: string, filters: FindAllRisksFilters = {}) {
    const risks = await this.prisma.risk.findMany({
      where: {
        tenantId,
        deletedAt: null,
        organisationId: filters.organisationId,
        riskLevel: filters.riskLevel,
        status: filters.status,
        assessmentItemId: filters.assessmentItemId,
      },
      include: riskInclude,
      orderBy:
        filters.sortBy === 'createdAt' ? { createdAt: 'desc' } : { inherentRiskScore: 'desc' },
    });
    return risks;
  }

  async findOne(tenantId: string, id: string) {
    const risk = await this.prisma.risk.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: riskInclude,
    });
    if (!risk) {
      throw new NotFoundException('Risk not found');
    }
    return risk;
  }

  async update(tenantId: string, id: string, dto: UpdateRiskDto) {
    const existing = await this.findOne(tenantId, id);

    const likelihood = dto.likelihood ?? existing.likelihood;
    const impact = dto.impact ?? existing.impact;
    const likelihoodOrImpactChanged = dto.likelihood !== undefined || dto.impact !== undefined;
    const inherentRiskScore = likelihoodOrImpactChanged ? likelihood * impact : undefined;

    await this.prisma.risk.update({
      where: { id },
      data: {
        ...dto,
        ...(inherentRiskScore !== undefined && {
          inherentRiskScore,
          riskLevel: dto.riskLevel ?? suggestRiskLevel(inherentRiskScore),
        }),
      },
    });
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.risk.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Risk deleted successfully' };
  }

  async linkInitiative(tenantId: string, riskId: string, initiativeId: string) {
    await this.findOne(tenantId, riskId);
    const initiative = await this.prisma.remediationInitiative.findFirst({
      where: { id: initiativeId, tenantId, deletedAt: null },
    });
    if (!initiative) {
      throw new NotFoundException('Remediation initiative not found');
    }
    await this.prisma.risk.update({
      where: { id: riskId },
      data: { initiatives: { connect: { id: initiativeId } } },
    });
    return this.findOne(tenantId, riskId);
  }

  async unlinkInitiative(tenantId: string, riskId: string, initiativeId: string) {
    await this.findOne(tenantId, riskId);
    await this.prisma.risk.update({
      where: { id: riskId },
      data: { initiatives: { disconnect: { id: initiativeId } } },
    });
    return this.findOne(tenantId, riskId);
  }

  /** Verifies an AssessmentItem belongs to this tenant before letting a Risk link to it (risk-control mapping). */
  private async requireOwnAssessmentItem(tenantId: string, assessmentItemId: string) {
    const item = await this.prisma.assessmentItem.findFirst({
      where: { id: assessmentItemId, assessment: { tenantId } },
    });
    if (!item) {
      throw new BadRequestException(
        `Assessment item '${assessmentItemId}' was not found for this tenant`,
      );
    }
    return item;
  }
}
