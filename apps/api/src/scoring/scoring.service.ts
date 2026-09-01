import { Injectable } from '@nestjs/common';
import { MaturityLevel } from '@cmmp/shared';
import {
  aggregateHierarchy,
  identifyGaps,
  type IdentifyGapsOptions,
  type OrganisationMaturityScore,
  type ScoredResponse,
} from '@cmmp/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  /**
   * Loads every item on an assessment together with the Function/Category/
   * Subcategory it belongs to (via its question's hierarchy), and maps it
   * onto the scoring-engine's plain, framework-agnostic `ScoredResponse`
   * shape. Prisma's generated enum types are structurally plain string
   * unions rather than a nominal TS enum (unlike `@cmmp/shared`'s), so the
   * cast here is a real type-system boundary crossing, not a shortcut
   * around a bug.
   */
  private async loadScoredResponses(assessmentId: string): Promise<ScoredResponse[]> {
    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId },
      select: {
        currentMaturity: true,
        targetMaturity: true,
        weight: true,
        question: {
          select: {
            subcategory: {
              select: {
                id: true,
                category: { select: { id: true, function: { select: { id: true } } } },
              },
            },
          },
        },
      },
    });

    return items.map((item) => ({
      subcategoryId: item.question.subcategory.id,
      categoryId: item.question.subcategory.category.id,
      functionId: item.question.subcategory.category.function.id,
      currentMaturity: item.currentMaturity as unknown as MaturityLevel,
      targetMaturity: item.targetMaturity as unknown as MaturityLevel,
      weight: item.weight,
    }));
  }

  async computeAssessmentScore(assessmentId: string): Promise<OrganisationMaturityScore> {
    const responses = await this.loadScoredResponses(assessmentId);
    return aggregateHierarchy(responses);
  }

  async computeGapAnalysis(assessmentId: string, options?: IdentifyGapsOptions) {
    const score = await this.computeAssessmentScore(assessmentId);
    return { score, gaps: identifyGaps(score, options) };
  }
}
