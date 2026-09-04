import { Injectable, NotFoundException } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

const RISK_SEVERITY: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, MINIMAL: 0 };
const ACTIVE_INITIATIVE_STATUSES = ['PLANNED', 'IN_PROGRESS'];
const OPEN_RISK_STATUSES = ['OPEN', 'IN_PROGRESS'];

function worstRiskLevel(levels: string[]): string {
  return levels.reduce((worst, level) => ((RISK_SEVERITY[level] ?? 0) > (RISK_SEVERITY[worst] ?? -1) ? level : worst), 'MINIMAL');
}

/** Which of the master prompt §21 roadmap timeline buckets a target date falls into, relative to now. */
function timelineBucket(targetDate: Date | null, now: Date): 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'STRATEGIC' | 'UNSCHEDULED' {
  if (!targetDate) return 'UNSCHEDULED';
  const monthsOut = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsOut <= 3) return 'IMMEDIATE';
  if (monthsOut <= 6) return 'SHORT_TERM';
  if (monthsOut <= 12) return 'MEDIUM_TERM';
  return 'STRATEGIC';
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private assessmentsService: AssessmentsService,
  ) {}

  /**
   * Every dashboard endpoint is scoped to one organisation and (usually)
   * one assessment. When `assessmentId` isn't given, this picks the most
   * recently submitted assessment for the org, falling back to the most
   * recently updated one of any status.
   */
  private async resolveAssessment(tenantId: string, organisationId: string, assessmentId?: string) {
    const organisation = await this.prisma.organisation.findFirst({ where: { id: organisationId, tenantId, deletedAt: null } });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

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
    if (latestSubmitted) return latestSubmitted;

    const latestAny = await this.prisma.assessment.findFirst({
      where: { tenantId, organisationId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!latestAny) {
      throw new NotFoundException('This organisation has no assessments yet');
    }
    return latestAny;
  }

  async getMaturityOverview(tenantId: string, organisationId: string, assessmentId?: string) {
    const assessment = await this.resolveAssessment(tenantId, organisationId, assessmentId);
    const results = await this.assessmentsService.getResults(assessment.id, tenantId);

    const [criticalGaps, highRiskFindings, openRemediationActions] = await Promise.all([
      this.prisma.assessmentItem.count({ where: { assessmentId: assessment.id, riskLevel: 'CRITICAL' } }),
      this.prisma.risk.count({
        where: { tenantId, organisationId, deletedAt: null, status: { in: OPEN_RISK_STATUSES }, riskLevel: { in: ['CRITICAL', 'HIGH'] } },
      }),
      this.prisma.remediationInitiative.count({
        where: { tenantId, organisationId, deletedAt: null, status: { in: ACTIVE_INITIATIVE_STATUSES } },
      }),
    ]);

    return {
      assessmentId: assessment.id,
      overallMaturity: results.overall.current,
      targetMaturity: results.overall.target,
      maturityGap: results.overall.gap,
      completionPercentage: results.completionPercentage,
      criticalGaps,
      highRiskFindings,
      openRemediationActions,
    };
  }

  /**
   * `compareToAssessmentId` is explicit rather than auto-detected — which
   * earlier assessment is "the" comparison point is a judgement call this
   * endpoint leaves to the caller instead of guessing.
   */
  async getFunctionMaturity(tenantId: string, organisationId: string, assessmentId?: string, compareToAssessmentId?: string) {
    const assessment = await this.resolveAssessment(tenantId, organisationId, assessmentId);
    const results = await this.assessmentsService.getResults(assessment.id, tenantId);

    const highRiskItems = await this.prisma.assessmentItem.findMany({
      where: { assessmentId: assessment.id, riskLevel: { in: ['CRITICAL', 'HIGH'] } },
      include: { question: { include: { subcategory: { include: { category: { include: { function: true } } } } } } },
    });
    const highRiskGapsByFunction = new Map<string, number>();
    for (const item of highRiskItems) {
      const code = item.question.subcategory.category.function.code;
      highRiskGapsByFunction.set(code, (highRiskGapsByFunction.get(code) ?? 0) + 1);
    }

    const template = await this.prisma.assessmentTemplate.findUnique({
      where: { id: assessment.templateId ?? '' },
      select: { frameworkId: true },
    });
    const totalQuestions = template
      ? await this.prisma.assessmentQuestion.findMany({
          where: { subcategory: { category: { function: { frameworkId: template.frameworkId } } } },
          select: { subcategory: { select: { category: { select: { function: { select: { code: true } } } } } } },
        })
      : [];
    const totalByFunction = new Map<string, number>();
    for (const question of totalQuestions) {
      const code = question.subcategory.category.function.code;
      totalByFunction.set(code, (totalByFunction.get(code) ?? 0) + 1);
    }

    let previousByFunction = new Map<string, number>();
    if (compareToAssessmentId) {
      const previous = await this.resolveAssessment(tenantId, organisationId, compareToAssessmentId);
      const previousResults = await this.assessmentsService.getResults(previous.id, tenantId);
      previousByFunction = new Map(previousResults.functions.map((fn) => [fn.code, fn.score.current]));
    }

    return results.functions.map((fn) => {
      const previousScore = previousByFunction.get(fn.code);
      const totalInFunction = totalByFunction.get(fn.code) ?? fn.score.itemCount;
      return {
        code: fn.code,
        name: fn.label,
        currentMaturity: fn.score.current,
        targetMaturity: fn.score.target,
        gap: fn.score.gap,
        completionPercentage: totalInFunction > 0 ? Math.round((fn.score.itemCount / totalInFunction) * 100) : 0,
        highRiskGaps: highRiskGapsByFunction.get(fn.code) ?? 0,
        trend: previousScore !== undefined ? Math.round((fn.score.current - previousScore) * 100) / 100 : undefined,
      };
    });
  }

  async getGapAnalysis(tenantId: string, organisationId: string, assessmentId?: string, limit = 10) {
    const assessment = await this.resolveAssessment(tenantId, organisationId, assessmentId);
    const results = await this.assessmentsService.getResults(assessment.id, tenantId);

    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId: assessment.id },
      include: { question: { include: { subcategory: { include: { category: { include: { function: true } } } } } } },
    });
    const itemsByFunction = new Map<string, typeof items>();
    for (const item of items) {
      const code = item.question.subcategory.category.function.code;
      const existing = itemsByFunction.get(code);
      if (existing) existing.push(item);
      else itemsByFunction.set(code, [item]);
    }

    return results.functions
      .filter((fn) => fn.score.gap > 0)
      .sort((a, b) => b.score.gap - a.score.gap)
      .slice(0, limit)
      .map((fn) => {
        const functionItems = itemsByFunction.get(fn.code) ?? [];
        return {
          functionCode: fn.code,
          functionName: fn.label,
          currentMaturity: fn.score.current,
          targetMaturity: fn.score.target,
          gap: fn.score.gap,
          riskLevel: worstRiskLevel(functionItems.map((item) => item.riskLevel)),
          affectedControls: functionItems.length,
        };
      });
  }

  async getRiskSummary(tenantId: string, organisationId: string, limit = 10) {
    const [byLevel, topRisks] = await Promise.all([
      this.prisma.risk.groupBy({
        by: ['riskLevel'],
        where: { tenantId, organisationId, deletedAt: null, status: { in: OPEN_RISK_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.risk.findMany({
        where: { tenantId, organisationId, deletedAt: null, status: { in: OPEN_RISK_STATUSES } },
        orderBy: [{ inherentRiskScore: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
    ]);

    const countByLevel: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, MINIMAL: 0 };
    for (const row of byLevel) {
      countByLevel[row.riskLevel] = row._count._all;
    }

    return {
      countByLevel,
      totalOpen: byLevel.reduce((sum, row) => sum + row._count._all, 0),
      topRisks,
    };
  }

  async getRoadmapStatus(tenantId: string, organisationId: string) {
    const initiatives = await this.prisma.remediationInitiative.findMany({
      where: { tenantId, organisationId, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { targetCompletionDate: 'asc' }],
    });

    const now = new Date();
    const buckets: Record<string, typeof initiatives> = {
      IMMEDIATE: [],
      SHORT_TERM: [],
      MEDIUM_TERM: [],
      STRATEGIC: [],
      UNSCHEDULED: [],
    };
    const countByStatus: Record<string, number> = { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, BLOCKED: 0, ON_HOLD: 0 };
    let overdueCount = 0;

    for (const initiative of initiatives) {
      buckets[timelineBucket(initiative.targetCompletionDate, now)].push(initiative);
      countByStatus[initiative.status] = (countByStatus[initiative.status] ?? 0) + 1;
      if (initiative.targetCompletionDate && initiative.targetCompletionDate < now && initiative.status !== 'COMPLETED') {
        overdueCount++;
      }
    }

    return { countByStatus, overdueCount, buckets };
  }

  /**
   * The master prompt's Executive Dashboard (§23), minus the two fields
   * that would need a per-capability history table to compute honestly
   * (Top Improving/Deteriorating Capabilities) — `SecurityCapability` only
   * stores a current snapshot, not a time series, so those are left out
   * rather than faked from a single point-in-time gap. `maturityTrend`
   * uses real data: every `AssessmentHistory` snapshot across this org's
   * assessments, oldest first.
   */
  async getExecutiveSummary(tenantId: string, organisationId: string, assessmentId?: string) {
    const [maturity, gaps, risks, roadmap, maturityTrend] = await Promise.all([
      this.getMaturityOverview(tenantId, organisationId, assessmentId),
      this.getGapAnalysis(tenantId, organisationId, assessmentId, 5),
      this.getRiskSummary(tenantId, organisationId, 5),
      this.getRoadmapStatus(tenantId, organisationId),
      this.prisma.assessmentHistory.findMany({
        where: { assessment: { tenantId, organisationId, deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { assessmentId: true, version: true, currentMaturity: true, targetMaturity: true, createdAt: true },
      }),
    ]);

    const overdueHighRiskActions = await this.prisma.remediationInitiative.count({
      where: {
        tenantId,
        organisationId,
        deletedAt: null,
        status: { notIn: ['COMPLETED'] },
        targetCompletionDate: { lt: new Date() },
        risks: { some: { riskLevel: { in: ['CRITICAL', 'HIGH'] } } },
      },
    });

    return {
      enterpriseMaturity: maturity.overallMaturity,
      targetMaturity: maturity.targetMaturity,
      maturityGap: maturity.maturityGap,
      topRisks: risks.topRisks,
      largestMaturityGaps: gaps,
      roadmapProgress: roadmap.countByStatus,
      overdueHighRiskActions,
      maturityTrend,
    };
  }
}
