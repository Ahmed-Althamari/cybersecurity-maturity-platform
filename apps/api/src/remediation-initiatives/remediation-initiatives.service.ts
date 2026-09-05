import { scoreToMaturityLevel } from '@cmmp/scoring-engine';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

import { CreateRemediationInitiativeDto } from './dto/create-remediation-initiative.dto';
import { UpdateRemediationInitiativeDto } from './dto/update-remediation-initiative.dto';

const NON_TERMINAL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'BLOCKED'];

const initiativeDetailInclude = {
  risks: { where: { deletedAt: null } },
  recommendations: true,
};

/** A risk's severity, restated on the same 1-5 scale as `businessCriticality` and `gap`, so the priority formula's factors are comparable. */
const RISK_LEVEL_SCORE: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, MINIMAL: 1 };

/**
 * Master prompt §20: "Priority Score = Risk × Gap × Business Criticality ×
 * Weight... do not permanently hard-code this formula." This is that
 * formula, isolated in one function so it can be swapped for an
 * admin-configurable one later without hunting through the service. The
 * banding thresholds are a documented heuristic, not derived from
 * anything — recalibrate freely.
 */
export function computePriority(riskScore: number, gap: number, businessCriticality: number, weight: number): number {
  const raw = riskScore * gap * businessCriticality * weight;
  if (raw >= 60) return 1;
  if (raw >= 30) return 2;
  if (raw >= 15) return 3;
  if (raw >= 5) return 4;
  return 5;
}

@Injectable()
export class RemediationInitiativesService {
  constructor(
    private prisma: PrismaService,
    private assessmentsService: AssessmentsService,
  ) {}

  async create(tenantId: string, dto: CreateRemediationInitiativeDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (dto.riskIds && dto.riskIds.length > 0) {
      const matchingRisks = await this.prisma.risk.count({
        where: { id: { in: dto.riskIds }, tenantId, organisationId: dto.organisationId, deletedAt: null },
      });
      if (matchingRisks !== dto.riskIds.length) {
        throw new BadRequestException('One or more riskIds do not belong to this organisation');
      }
    }

    return this.prisma.remediationInitiative.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        title: dto.title,
        description: dto.description,
        securityCapability: dto.securityCapability,
        priority: dto.priority ?? 3,
        complexity: dto.complexity ?? 3,
        currentMaturity: dto.currentMaturity,
        targetMaturity: dto.targetMaturity,
        estimatedCost: dto.estimatedCost,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetCompletionDate: dto.targetCompletionDate ? new Date(dto.targetCompletionDate) : undefined,
        owner: dto.owner,
        status: 'PLANNED',
        risks: dto.riskIds && dto.riskIds.length > 0 ? { connect: dto.riskIds.map((id) => ({ id })) } : undefined,
      },
      include: initiativeDetailInclude,
    });
  }

  /**
   * `search` matches on `title` case-insensitively (Postgres `ILIKE`-equivalent via Prisma's
   * `mode: 'insensitive'`) — added for the risk-detail page's initiative picker, which searches
   * across every initiative in the organisation rather than paging through a single fixed-size
   * list that could otherwise silently hide anything past the first page's worth of results.
   */
  async findAll(
    tenantId: string,
    organisationId: string,
    options: { status?: string; sort?: 'priority' | 'recent'; search?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const pageSize = options.pageSize && options.pageSize > 0 ? Math.min(Math.floor(options.pageSize), 100) : 20;

    const where = {
      tenantId,
      organisationId,
      deletedAt: null,
      status: options.status,
      ...(options.search ? { title: { contains: options.search, mode: 'insensitive' as const } } : {}),
    };
    const orderBy = options.sort === 'priority' ? [{ priority: 'asc' as const }, { targetCompletionDate: 'asc' as const }] : [{ createdAt: 'desc' as const }];

    const [data, total] = await Promise.all([
      this.prisma.remediationInitiative.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.remediationInitiative.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(id: string, tenantId: string) {
    const initiative = await this.prisma.remediationInitiative.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: initiativeDetailInclude,
    });
    if (!initiative) {
      throw new NotFoundException('Remediation initiative not found');
    }
    return initiative;
  }

  async update(id: string, tenantId: string, dto: UpdateRemediationInitiativeDto) {
    await this.findOne(id, tenantId);

    return this.prisma.remediationInitiative.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        securityCapability: dto.securityCapability,
        priority: dto.priority,
        complexity: dto.complexity,
        currentMaturity: dto.currentMaturity,
        targetMaturity: dto.targetMaturity,
        estimatedCost: dto.estimatedCost,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetCompletionDate: dto.targetCompletionDate ? new Date(dto.targetCompletionDate) : undefined,
        // Marking COMPLETED without an explicit date stamps "now" — the common case — but an explicit date always wins.
        actualCompletionDate: dto.actualCompletionDate
          ? new Date(dto.actualCompletionDate)
          : dto.status === 'COMPLETED'
            ? new Date()
            : undefined,
        status: dto.status,
        owner: dto.owner,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.remediationInitiative.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Remediation initiative deleted successfully' };
  }

  async linkRisk(id: string, tenantId: string, riskId: string) {
    const initiative = await this.findOne(id, tenantId);
    const risk = await this.prisma.risk.findFirst({
      where: { id: riskId, tenantId, organisationId: initiative.organisationId, deletedAt: null },
    });
    if (!risk) {
      throw new NotFoundException('Risk not found for this organisation');
    }

    return this.prisma.remediationInitiative.update({
      where: { id },
      data: { risks: { connect: { id: riskId } } },
      include: initiativeDetailInclude,
    });
  }

  async unlinkRisk(id: string, tenantId: string, riskId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.remediationInitiative.update({
      where: { id },
      data: { risks: { disconnect: { id: riskId } } },
      include: initiativeDetailInclude,
    });
  }

  private async resolveAssessment(tenantId: string, organisationId: string, assessmentId?: string) {
    if (assessmentId) {
      const assessment = await this.prisma.assessment.findFirst({
        where: { id: assessmentId, tenantId, organisationId, deletedAt: null },
      });
      if (!assessment) {
        throw new NotFoundException('Assessment not found for this organisation');
      }
      return assessment;
    }

    const latestSubmitted = await this.prisma.assessment.findFirst({
      where: { tenantId, organisationId, status: 'SUBMITTED', deletedAt: null },
      orderBy: { assessmentDate: 'desc' },
    });
    if (!latestSubmitted) {
      throw new NotFoundException('No submitted assessment found for this organisation');
    }
    return latestSubmitted;
  }

  /**
   * Creates one draft `PLANNED` initiative per largest subcategory-level
   * gap, skipping any subcategory that already has a non-terminal
   * initiative tracking it (`securityCapability` doubles as that
   * dedup key — the schema has no dedicated gap/subcategory FK on
   * `RemediationInitiative`). Priority is computed from the real
   * assessment item behind each gap (its stored risk level, business
   * criticality, and weight) via `computePriority`, never left at a
   * default.
   */
  async generateFromGaps(tenantId: string, organisationId: string, assessmentId?: string, limit = 5) {
    const assessment = await this.resolveAssessment(tenantId, organisationId, assessmentId);
    const gaps = await this.assessmentsService.getGaps(assessment.id, tenantId, { depth: 2, limit });

    const created = [];
    for (const gap of gaps) {
      const existing = await this.prisma.remediationInitiative.findFirst({
        where: {
          tenantId,
          organisationId,
          securityCapability: gap.code,
          deletedAt: null,
          status: { in: NON_TERMINAL_STATUSES },
        },
      });
      if (existing) continue;

      const item = await this.prisma.assessmentItem.findFirst({
        where: { assessmentId: assessment.id, question: { subcategory: { code: gap.code } } },
      });

      const riskScore = item ? (RISK_LEVEL_SCORE[item.riskLevel] ?? 3) : 3;
      const businessCriticality = item?.businessCriticality ?? 3;
      const weight = item?.weight ?? 1;
      const priority = computePriority(riskScore, gap.gap, businessCriticality, weight);

      const initiative = await this.prisma.remediationInitiative.create({
        data: {
          tenantId,
          organisationId,
          title: `Close gap: ${gap.code}`,
          description: gap.label,
          securityCapability: gap.code,
          priority,
          currentMaturity: scoreToMaturityLevel(gap.current),
          targetMaturity: scoreToMaturityLevel(gap.target),
          status: 'PLANNED',
        },
      });
      created.push(initiative);
    }

    return created;
  }
}
