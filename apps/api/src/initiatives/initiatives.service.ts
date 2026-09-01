import { scoreToMaturityLevel, type GapAnalysisEntry } from '@cmmp/scoring-engine';
import { MaturityLevel, RiskLevel } from '@cmmp/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Gap risk level -> (priority, how many days out the target completion
// date should be). Priority follows the schema's convention (seed data:
// 1 = most urgent), and more urgent gaps get shorter timelines -- this is
// what feeds the 3/6/12-month timeline view.
const PRIORITY_BY_RISK_LEVEL: Record<RiskLevel, { priority: number; daysOut: number }> = {
  [RiskLevel.CRITICAL]: { priority: 1, daysOut: 90 },
  [RiskLevel.HIGH]: { priority: 2, daysOut: 90 },
  [RiskLevel.MEDIUM]: { priority: 3, daysOut: 180 },
  [RiskLevel.LOW]: { priority: 4, daysOut: 365 },
  [RiskLevel.MINIMAL]: { priority: 5, daysOut: 365 },
};

/** Bigger maturity gaps assumed to need more complex remediation work. */
function complexityForGap(gap: number): number {
  if (gap >= 3) return 4;
  if (gap >= 2) return 3;
  if (gap >= 1) return 2;
  return 1;
}

const initiativeInclude = {
  risks: { select: { id: true, title: true, riskLevel: true, status: true } },
};

export interface FindAllInitiativesFilters {
  organisationId?: string;
  status?: string;
  sortBy?: 'priority' | 'createdAt';
}

export interface InitiativeTimeline {
  next3Months: unknown[];
  next6Months: unknown[];
  next12Months: unknown[];
  beyondOrUnscheduled: unknown[];
}

@Injectable()
export class InitiativesService {
  constructor(
    private prisma: PrismaService,
    private assessmentsService: AssessmentsService,
    private scoringService: ScoringService,
  ) {}

  async create(tenantId: string, dto: CreateInitiativeDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    return this.prisma.remediationInitiative.create({
      data: { tenantId, ...dto },
      include: initiativeInclude,
    });
  }

  async findAll(tenantId: string, filters: FindAllInitiativesFilters = {}) {
    return this.prisma.remediationInitiative.findMany({
      where: {
        tenantId,
        deletedAt: null,
        organisationId: filters.organisationId,
        status: filters.status,
      },
      include: initiativeInclude,
      orderBy: filters.sortBy === 'createdAt' ? { createdAt: 'desc' } : { priority: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const initiative = await this.prisma.remediationInitiative.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: initiativeInclude,
    });
    if (!initiative) {
      throw new NotFoundException('Remediation initiative not found');
    }
    return initiative;
  }

  async update(tenantId: string, id: string, dto: UpdateInitiativeDto) {
    await this.findOne(tenantId, id);
    await this.prisma.remediationInitiative.update({ where: { id }, data: dto });
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.remediationInitiative.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Remediation initiative deleted successfully' };
  }

  async linkRisk(tenantId: string, initiativeId: string, riskId: string) {
    await this.findOne(tenantId, initiativeId);
    const risk = await this.prisma.risk.findFirst({ where: { id: riskId, tenantId, deletedAt: null } });
    if (!risk) {
      throw new NotFoundException('Risk not found');
    }
    await this.prisma.remediationInitiative.update({
      where: { id: initiativeId },
      data: { risks: { connect: { id: riskId } } },
    });
    return this.findOne(tenantId, initiativeId);
  }

  async unlinkRisk(tenantId: string, initiativeId: string, riskId: string) {
    await this.findOne(tenantId, initiativeId);
    await this.prisma.remediationInitiative.update({
      where: { id: initiativeId },
      data: { risks: { disconnect: { id: riskId } } },
    });
    return this.findOne(tenantId, initiativeId);
  }

  /** Buckets an organisation's initiatives by how far out their target completion date is -- the roadmap's 3/6/12 month timeline view. */
  async getTimeline(tenantId: string, organisationId?: string): Promise<InitiativeTimeline> {
    const initiatives = await this.findAll(tenantId, { organisationId });
    const now = Date.now();

    const timeline: InitiativeTimeline = {
      next3Months: [],
      next6Months: [],
      next12Months: [],
      beyondOrUnscheduled: [],
    };

    for (const initiative of initiatives) {
      if (initiative.status === 'COMPLETED' || !initiative.targetCompletionDate) {
        timeline.beyondOrUnscheduled.push(initiative);
        continue;
      }
      const daysOut = (initiative.targetCompletionDate.getTime() - now) / MS_PER_DAY;
      if (daysOut <= 90) {
        timeline.next3Months.push(initiative);
      } else if (daysOut <= 180) {
        timeline.next6Months.push(initiative);
      } else if (daysOut <= 365) {
        timeline.next12Months.push(initiative);
      } else {
        timeline.beyondOrUnscheduled.push(initiative);
      }
    }

    return timeline;
  }

  /**
   * Auto-generates one draft RemediationInitiative per function-level gap
   * on an assessment (Phase 12's "auto-generation from gaps" +
   * "prioritization algorithm"): priority and target-completion timeline
   * come from the gap's risk level, complexity from the gap's magnitude,
   * current/target maturity from the gap's scores via the scoring
   * engine's own scale.
   */
  async generateFromGaps(tenantId: string, assessmentId: string, minGap = 0.5) {
    const assessment = await this.assessmentsService.findOne(tenantId, assessmentId);
    const [{ gaps }, functionNames] = await Promise.all([
      this.scoringService.computeGapAnalysis(assessmentId, { levels: ['function'], minGap }),
      this.loadFunctionNames(assessmentId),
    ]);

    const eligible = gaps.filter(
      (gap): gap is GapAnalysisEntry & { gap: number } => gap.gap !== null && gap.gap >= minGap,
    );

    return Promise.all(
      eligible.map((gap) =>
        this.createInitiativeFromGap(tenantId, assessment, gap, functionNames.get(gap.id) ?? gap.id),
      ),
    );
  }

  /** function id -> display name, for turning a gap's raw functionId into a readable initiative title. */
  private async loadFunctionNames(assessmentId: string): Promise<Map<string, string>> {
    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId },
      select: {
        question: {
          select: { subcategory: { select: { category: { select: { function: { select: { id: true, name: true } } } } } } },
        },
      },
    });
    const names = new Map<string, string>();
    for (const item of items) {
      const fn = item.question.subcategory.category.function;
      names.set(fn.id, fn.name);
    }
    return names;
  }

  private async createInitiativeFromGap(
    tenantId: string,
    assessment: { organisationId: string; name: string },
    gap: GapAnalysisEntry & { gap: number },
    functionName: string,
  ) {
    const { priority, daysOut } = PRIORITY_BY_RISK_LEVEL[gap.riskLevel];
    const currentMaturity = scoreToMaturityLevel(gap.currentScore) ?? MaturityLevel.INITIAL;
    const targetMaturity = scoreToMaturityLevel(gap.targetScore) ?? MaturityLevel.DEFINED;

    return this.prisma.remediationInitiative.create({
      data: {
        tenantId,
        organisationId: assessment.organisationId,
        title: `Improve ${functionName} maturity`,
        description: `Current maturity ${gap.currentScore?.toFixed(1)}, target ${gap.targetScore?.toFixed(1)} (gap ${gap.gap.toFixed(1)}). Auto-generated from the gap analysis for "${assessment.name}".`,
        securityCapability: functionName,
        priority,
        complexity: complexityForGap(gap.gap),
        currentMaturity,
        targetMaturity,
        targetCompletionDate: new Date(Date.now() + daysOut * MS_PER_DAY),
        status: 'PLANNED',
      },
      include: initiativeInclude,
    });
  }
}
