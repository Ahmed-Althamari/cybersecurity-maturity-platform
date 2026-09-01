import { RiskLevel } from '@cmmp/shared';
import type {
  ExecutiveDashboard,
  FunctionMaturity,
  GapAnalysis,
  MaturityOverview,
  RemediationInitiative,
  Risk,
  RiskSummary,
  RoadmapStatus,
} from '@cmmp/shared';
import { Injectable } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

const OPEN_INITIATIVE_STATUSES = ['PLANNED', 'IN_PROGRESS'];
const RISK_SEVERITY_RANK: Record<RiskLevel, number> = {
  [RiskLevel.CRITICAL]: 0,
  [RiskLevel.HIGH]: 1,
  [RiskLevel.MEDIUM]: 2,
  [RiskLevel.LOW]: 3,
  [RiskLevel.MINIMAL]: 4,
};

interface FunctionMeta {
  code: string;
  name: string;
  displayOrder: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private assessmentsService: AssessmentsService,
    private scoringService: ScoringService,
  ) {}

  async getMaturityOverview(tenantId: string, assessmentId: string): Promise<MaturityOverview> {
    const assessment = await this.assessmentsService.findOne(tenantId, assessmentId);
    const { score, gaps } = await this.scoringService.computeGapAnalysis(assessmentId, {
      levels: ['subcategory'],
    });
    const [risks, initiatives] = await Promise.all([
      this.loadAssessmentRisks(tenantId, assessmentId),
      this.loadAssessmentInitiatives(tenantId, assessmentId),
    ]);

    return {
      overallMaturity: score.currentScore ?? 0,
      targetMaturity: score.targetScore ?? 0,
      maturityGap: score.gap ?? 0,
      completionPercentage: assessment.completionPercentage,
      criticalGaps: gaps.filter((gap) => gap.riskLevel === RiskLevel.CRITICAL).length,
      highRiskFindings: risks.filter(
        (risk) => (risk.riskLevel === RiskLevel.CRITICAL || risk.riskLevel === RiskLevel.HIGH) && risk.status !== 'CLOSED',
      ).length,
      openRemediationActions: initiatives.filter((initiative) =>
        OPEN_INITIATIVE_STATUSES.includes(initiative.status),
      ).length,
    };
  }

  async getFunctionMaturity(tenantId: string, assessmentId: string): Promise<FunctionMaturity[]> {
    await this.assessmentsService.findOne(tenantId, assessmentId);
    const [{ score, gaps }, functionMeta, completionByFunction] = await Promise.all([
      this.scoringService.computeGapAnalysis(assessmentId, { levels: ['subcategory'] }),
      this.loadFunctionMetadata(assessmentId),
      this.loadCompletionByFunction(assessmentId),
    ]);

    const highRiskGapsByFunction = new Map<string, number>();
    const subcategoryToFunction = new Map<string, string>();
    for (const fn of score.functions) {
      for (const category of fn.categories) {
        for (const subcategory of category.subcategories) {
          subcategoryToFunction.set(subcategory.subcategoryId, fn.functionId);
        }
      }
    }
    for (const gap of gaps) {
      if (gap.riskLevel !== RiskLevel.CRITICAL && gap.riskLevel !== RiskLevel.HIGH) {
        continue;
      }
      const functionId = subcategoryToFunction.get(gap.id);
      if (functionId) {
        highRiskGapsByFunction.set(functionId, (highRiskGapsByFunction.get(functionId) ?? 0) + 1);
      }
    }

    return score.functions
      .map((fn) => {
        const meta = functionMeta.get(fn.functionId);
        const completion = completionByFunction.get(fn.functionId);
        const highRiskGaps = highRiskGapsByFunction.get(fn.functionId) ?? 0;

        return {
          code: meta?.code ?? fn.functionId,
          name: meta?.name ?? fn.functionId,
          currentMaturity: fn.currentScore ?? 0,
          targetMaturity: fn.targetScore ?? 0,
          gap: fn.gap ?? 0,
          completionPercentage: completion ? Math.round((completion.answered / completion.total) * 100) : 0,
          highRiskGaps,
          displayOrder: meta?.displayOrder ?? 0,
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(({ displayOrder: _displayOrder, ...rest }) => rest);
  }

  async getGapAnalysis(tenantId: string, assessmentId: string, minGap?: number): Promise<GapAnalysis[]> {
    await this.assessmentsService.findOne(tenantId, assessmentId);
    const [{ score, gaps }, functionMeta] = await Promise.all([
      this.scoringService.computeGapAnalysis(assessmentId, { levels: ['function'], minGap }),
      this.loadFunctionMetadata(assessmentId),
    ]);

    return gaps.map((gap) => {
      const meta = functionMeta.get(gap.id);
      const fn = score.functions.find((f) => f.functionId === gap.id);
      const affectedControls =
        fn?.categories.reduce(
          (sum, category) =>
            sum + category.subcategories.filter((sub) => sub.gap !== null && sub.gap > 0).length,
          0,
        ) ?? 0;

      return {
        functionCode: meta?.code ?? gap.id,
        functionName: meta?.name ?? gap.id,
        currentMaturity: gap.currentScore ?? 0,
        targetMaturity: gap.targetScore ?? 0,
        gap: gap.gap ?? 0,
        riskLevel: gap.riskLevel,
        affectedControls,
      };
    });
  }

  async getRiskSummary(tenantId: string, assessmentId: string): Promise<RiskSummary> {
    await this.assessmentsService.findOne(tenantId, assessmentId);
    const risks = await this.loadAssessmentRisks(tenantId, assessmentId);

    const byRiskLevel = Object.fromEntries(
      Object.values(RiskLevel).map((level) => [level, 0]),
    ) as Record<RiskLevel, number>;
    const byStatus: Record<string, number> = {};
    for (const risk of risks) {
      byRiskLevel[risk.riskLevel] += 1;
      byStatus[risk.status] = (byStatus[risk.status] ?? 0) + 1;
    }

    const topRisks = [...risks]
      .sort((a, b) => RISK_SEVERITY_RANK[a.riskLevel] - RISK_SEVERITY_RANK[b.riskLevel])
      .slice(0, 10);

    return { totalRisks: risks.length, byRiskLevel, byStatus, topRisks };
  }

  async getRoadmapStatus(tenantId: string, assessmentId: string): Promise<RoadmapStatus> {
    await this.assessmentsService.findOne(tenantId, assessmentId);
    const initiatives = await this.loadAssessmentInitiatives(tenantId, assessmentId);

    const byStatus: Record<string, number> = {};
    for (const initiative of initiatives) {
      byStatus[initiative.status] = (byStatus[initiative.status] ?? 0) + 1;
    }

    const upcoming = initiatives
      .filter((initiative) => initiative.status !== 'COMPLETED' && initiative.targetCompletionDate)
      .sort((a, b) => a.targetCompletionDate!.getTime() - b.targetCompletionDate!.getTime())
      .slice(0, 10);

    return { totalInitiatives: initiatives.length, byStatus, upcoming };
  }

  async getExecutiveDashboard(tenantId: string, assessmentId: string): Promise<ExecutiveDashboard> {
    const [maturityOverview, functionMaturity, topGaps, riskSummary, roadmapStatus] = await Promise.all([
      this.getMaturityOverview(tenantId, assessmentId),
      this.getFunctionMaturity(tenantId, assessmentId),
      this.getGapAnalysis(tenantId, assessmentId),
      this.getRiskSummary(tenantId, assessmentId),
      this.getRoadmapStatus(tenantId, assessmentId),
    ]);
    return { maturityOverview, functionMaturity, topGaps, riskSummary, roadmapStatus };
  }

  private async loadFunctionMetadata(assessmentId: string): Promise<Map<string, FunctionMeta>> {
    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId },
      select: {
        question: {
          select: {
            subcategory: {
              select: {
                category: {
                  select: { function: { select: { id: true, code: true, name: true, displayOrder: true } } },
                },
              },
            },
          },
        },
      },
    });

    const meta = new Map<string, FunctionMeta>();
    for (const item of items) {
      const fn = item.question.subcategory.category.function;
      if (!meta.has(fn.id)) {
        meta.set(fn.id, { code: fn.code, name: fn.name, displayOrder: fn.displayOrder });
      }
    }
    return meta;
  }

  private async loadCompletionByFunction(
    assessmentId: string,
  ): Promise<Map<string, { total: number; answered: number }>> {
    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId },
      select: {
        controlStatus: true,
        question: { select: { subcategory: { select: { category: { select: { functionId: true } } } } } },
      },
    });

    const counts = new Map<string, { total: number; answered: number }>();
    for (const item of items) {
      const functionId = item.question.subcategory.category.functionId;
      const entry = counts.get(functionId) ?? { total: 0, answered: 0 };
      entry.total += 1;
      if (item.controlStatus !== 'NOT_STARTED') {
        entry.answered += 1;
      }
      counts.set(functionId, entry);
    }
    return counts;
  }

  private async loadAssessmentRisks(tenantId: string, assessmentId: string): Promise<Risk[]> {
    const rows = await this.prisma.risk.findMany({
      where: { tenantId, deletedAt: null, assessmentItem: { assessmentId } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      threat: row.threat ?? undefined,
      likelihood: row.likelihood,
      impact: row.impact,
      riskLevel: row.riskLevel as unknown as RiskLevel,
      owner: row.owner ?? undefined,
      status: row.status,
      targetDate: row.targetDate ?? undefined,
    }));
  }

  private async loadAssessmentInitiatives(
    tenantId: string,
    assessmentId: string,
  ): Promise<RemediationInitiative[]> {
    const rows = await this.prisma.remediationInitiative.findMany({
      where: { tenantId, deletedAt: null, risks: { some: { assessmentItem: { assessmentId } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      priority: row.priority,
      complexity: row.complexity,
      currentMaturity: row.currentMaturity as unknown as RemediationInitiative['currentMaturity'],
      targetMaturity: row.targetMaturity as unknown as RemediationInitiative['targetMaturity'],
      startDate: row.startDate ?? undefined,
      targetCompletionDate: row.targetCompletionDate ?? undefined,
      status: row.status as RemediationInitiative['status'],
      owner: row.owner ?? undefined,
      estimatedCost: row.estimatedCost ?? undefined,
    }));
  }
}
