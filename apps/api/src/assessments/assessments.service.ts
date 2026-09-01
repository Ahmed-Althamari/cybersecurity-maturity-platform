import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkService } from '../framework/framework.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpdateAssessmentItemDto } from './dto/update-assessment-item.dto';

export const ASSESSMENT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'ARCHIVED',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

// Which status an assessment may move to from its current one. ARCHIVED is
// reachable from anywhere except itself; APPROVED can only be reopened back
// to IN_PROGRESS for rework, never straight back to DRAFT.
const ALLOWED_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['APPROVED', 'IN_PROGRESS', 'ARCHIVED'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: [],
};

const assessmentSummarySelect = {
  id: true,
  tenantId: true,
  organisationId: true,
  name: true,
  description: true,
  status: true,
  assessmentDate: true,
  completionPercentage: true,
  currentMaturity: true,
  targetMaturity: true,
  maturityGap: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private frameworkService: FrameworkService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateAssessmentDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Reuses the framework-agnostic loader (ADR-006) rather than a
    // parallel query, so an assessment's question set always matches what
    // GET /frameworks/:slug would show for the same framework/version.
    const tree = await this.frameworkService.getTree(
      tenantId,
      dto.frameworkSlug,
      dto.frameworkVersion,
    );
    const questionIds = tree.functions.flatMap((fn) =>
      fn.categories.flatMap((category) =>
        category.subcategories.flatMap((subcategory) =>
          subcategory.questions.map((question) => question.id),
        ),
      ),
    );
    if (questionIds.length === 0) {
      throw new BadRequestException(
        `Framework '${dto.frameworkSlug}' has no assessment questions to assess against`,
      );
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        tenantId,
        organisationId: dto.organisationId,
        name: dto.name,
        description: dto.description,
        assessmentDate: dto.assessmentDate,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });

    await this.prisma.assessmentItem.createMany({
      data: questionIds.map((questionId) => ({ assessmentId: assessment.id, questionId })),
    });

    await this.prisma.assessmentHistory.create({
      data: { assessmentId: assessment.id, version: 1, status: 'DRAFT' },
    });

    return this.findOne(tenantId, assessment.id);
  }

  async findAll(tenantId: string, organisationId?: string) {
    return this.prisma.assessment.findMany({
      where: { tenantId, organisationId, deletedAt: null },
      select: assessmentSummarySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        ...assessmentSummarySelect,
        items: {
          select: {
            id: true,
            questionId: true,
            currentMaturity: true,
            targetMaturity: true,
            weight: true,
            riskLevel: true,
            businessCriticality: true,
            controlStatus: true,
            rationale: true,
            evidence: true,
            assessorComments: true,
            ownerName: true,
            ownerEmail: true,
            remediationDueDate: true,
            question: { select: { id: true, question: true, guidance: true, subcategoryId: true } },
          },
        },
      },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateAssessmentDto) {
    const assessment = await this.requireEditable(tenantId, id);
    await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: { ...dto, updatedById: userId },
    });
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.assessment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Assessment deleted successfully' };
  }

  async updateItem(
    tenantId: string,
    userId: string,
    assessmentId: string,
    itemId: string,
    dto: UpdateAssessmentItemDto,
  ) {
    const assessment = await this.requireEditable(tenantId, assessmentId);

    const item = await this.prisma.assessmentItem.findFirst({
      where: { id: itemId, assessmentId: assessment.id },
    });
    if (!item) {
      throw new NotFoundException('Assessment item not found');
    }

    await this.prisma.assessmentItem.update({ where: { id: itemId }, data: dto });

    if (assessment.status === 'DRAFT') {
      await this.transition(tenantId, userId, assessmentId, 'IN_PROGRESS');
    }

    await this.recalculateCompletion(assessmentId, userId);
    return this.findOne(tenantId, assessmentId);
  }

  async submit(tenantId: string, userId: string, assessmentId: string) {
    const assessment = await this.findOne(tenantId, assessmentId);
    if (assessment.completionPercentage !== 100) {
      throw new BadRequestException(
        `Cannot submit: assessment is ${assessment.completionPercentage}% complete, all items must be assessed first`,
      );
    }
    return this.transition(tenantId, userId, assessmentId, 'SUBMITTED');
  }

  async approve(tenantId: string, userId: string, assessmentId: string) {
    return this.transition(tenantId, userId, assessmentId, 'APPROVED');
  }

  async reopen(tenantId: string, userId: string, assessmentId: string) {
    return this.transition(tenantId, userId, assessmentId, 'IN_PROGRESS');
  }

  async archive(tenantId: string, userId: string, assessmentId: string) {
    return this.transition(tenantId, userId, assessmentId, 'ARCHIVED');
  }

  async getHistory(tenantId: string, assessmentId: string) {
    await this.findOne(tenantId, assessmentId);
    return this.prisma.assessmentHistory.findMany({
      where: { assessmentId },
      orderBy: { version: 'asc' },
    });
  }

  private async transition(
    tenantId: string,
    userId: string,
    assessmentId: string,
    toStatus: AssessmentStatus,
  ) {
    const assessment = await this.findOne(tenantId, assessmentId);
    const fromStatus = assessment.status as AssessmentStatus;

    if (!ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus)) {
      throw new BadRequestException(`Cannot move an assessment from ${fromStatus} to ${toStatus}`);
    }

    const lastHistory = await this.prisma.assessmentHistory.findFirst({
      where: { assessmentId },
      orderBy: { version: 'desc' },
    });

    await this.prisma.$transaction([
      this.prisma.assessment.update({
        where: { id: assessmentId },
        data: { status: toStatus, updatedById: userId },
      }),
      this.prisma.assessmentHistory.create({
        data: {
          assessmentId,
          version: (lastHistory?.version ?? 0) + 1,
          status: toStatus,
          currentMaturity: assessment.currentMaturity,
          targetMaturity: assessment.targetMaturity,
        },
      }),
    ]);

    return this.findOne(tenantId, assessmentId);
  }

  private async requireEditable(tenantId: string, assessmentId: string) {
    const assessment = await this.findOne(tenantId, assessmentId);
    if (assessment.status === 'SUBMITTED' || assessment.status === 'APPROVED' || assessment.status === 'ARCHIVED') {
      throw new BadRequestException(
        `Cannot modify an assessment while it is ${assessment.status}; reopen it first`,
      );
    }
    return assessment;
  }

  // Completion tracking is a workflow-progress heuristic for Phase 6, not a
  // maturity score — Phase 7 (Scoring Engine) owns currentMaturity/
  // targetMaturity/maturityGap aggregation. An item counts as "answered"
  // once its controlStatus has moved off the NOT_STARTED default.
  private async recalculateCompletion(assessmentId: string, userId: string) {
    const [total, answered] = await Promise.all([
      this.prisma.assessmentItem.count({ where: { assessmentId } }),
      this.prisma.assessmentItem.count({
        where: { assessmentId, controlStatus: { not: 'NOT_STARTED' } },
      }),
    ]);
    const completionPercentage = total === 0 ? 0 : Math.round((answered / total) * 100);
    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { completionPercentage, updatedById: userId },
    });
  }
}
