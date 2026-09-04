import { frameworkTreeInclude, toFrameworkDefinition } from '@cmmp/database';
import { analyzeGaps, scoreFramework, type AnalyzeGapsOptions, type ScoredItem } from '@cmmp/scoring-engine';
import { MaturityLevel as SharedMaturityLevel } from '@cmmp/shared';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpsertAssessmentItemDto } from './dto/upsert-assessment-item.dto';

/**
 * Prisma generates its own `$Enums.MaturityLevel` (from the schema) which
 * is nominally distinct from `@cmmp/shared`'s hand-written `MaturityLevel`
 * even though every member matches — this converts between them instead of
 * a blind type cast.
 */
function toSharedMaturityLevel(level: string): SharedMaturityLevel {
  const value = SharedMaturityLevel[level as keyof typeof SharedMaturityLevel];
  if (!value) {
    throw new Error(`Unknown maturity level: ${level}`);
  }
  return value;
}

const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS'];

const assessmentListInclude = {
  template: { select: { id: true, frameworkId: true, name: true } },
  _count: { select: { items: true } },
};

const assessmentDetailInclude = {
  template: { select: { id: true, frameworkId: true, name: true } },
  items: { orderBy: { updatedAt: 'desc' as const } },
};

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateAssessmentDto) {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: dto.organisationId, tenantId, deletedAt: null },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const framework = await this.prisma.framework.findFirst({
      where: { id: dto.frameworkId, tenantId, deletedAt: null },
    });
    if (!framework) {
      throw new NotFoundException('Framework not found');
    }

    let template = await this.prisma.assessmentTemplate.findFirst({
      where: { frameworkId: framework.id, isDefault: true },
    });
    if (!template) {
      template = await this.prisma.assessmentTemplate.create({
        data: {
          frameworkId: framework.id,
          name: `${framework.name} - Default Template`,
          isDefault: true,
        },
      });
    }

    return this.prisma.assessment.create({
      data: {
        tenantId,
        organisationId: organisation.id,
        templateId: template.id,
        name: dto.name,
        description: dto.description,
        status: 'DRAFT',
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : new Date(),
        createdById: userId,
        updatedById: userId,
      },
    });
  }

  async findAll(tenantId: string, organisationId?: string, status?: string) {
    return this.prisma.assessment.findMany({
      where: { tenantId, organisationId, status, deletedAt: null },
      include: assessmentListInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async findOrThrow(id: string, tenantId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: assessmentDetailInclude,
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  async findOne(id: string, tenantId: string) {
    return this.findOrThrow(id, tenantId);
  }

  async update(id: string, tenantId: string, userId: string, dto: UpdateAssessmentDto) {
    const assessment = await this.findOrThrow(id, tenantId);
    if (!EDITABLE_STATUSES.includes(assessment.status)) {
      throw new ConflictException(`Assessment cannot be edited while in '${assessment.status}' status`);
    }

    return this.prisma.assessment.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : undefined,
        updatedById: userId,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOrThrow(id, tenantId);
    await this.prisma.assessment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Assessment deleted successfully' };
  }

  async history(id: string, tenantId: string) {
    await this.findOrThrow(id, tenantId);
    return this.prisma.assessmentHistory.findMany({
      where: { assessmentId: id },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Records (or updates) one question's response on an assessment. The
   * question must belong to the assessment's own framework and tenant —
   * otherwise a response could reference a subcategory from a completely
   * different framework or tenant.
   */
  async upsertItem(assessmentId: string, tenantId: string, userId: string, dto: UpsertAssessmentItemDto) {
    const assessment = await this.findOrThrow(assessmentId, tenantId);
    if (!EDITABLE_STATUSES.includes(assessment.status)) {
      throw new ConflictException(`Assessment cannot be edited while in '${assessment.status}' status`);
    }
    if (!assessment.template) {
      throw new ConflictException('Assessment has no framework template to validate responses against');
    }

    const question = await this.prisma.assessmentQuestion.findFirst({
      where: {
        id: dto.questionId,
        subcategory: { category: { function: { frameworkId: assessment.template.frameworkId } } },
      },
    });
    if (!question) {
      throw new BadRequestException("Question does not belong to this assessment's framework");
    }

    const item = await this.prisma.assessmentItem.upsert({
      where: { assessmentId_questionId: { assessmentId, questionId: dto.questionId } },
      create: {
        assessmentId,
        questionId: dto.questionId,
        currentMaturity: dto.currentMaturity,
        targetMaturity: dto.targetMaturity,
        weight: dto.weight,
        riskLevel: dto.riskLevel,
        businessCriticality: dto.businessCriticality,
        controlStatus: dto.controlStatus,
        rationale: dto.rationale,
        evidence: dto.evidence,
        assessorComments: dto.assessorComments,
        ownerName: dto.ownerName,
        ownerEmail: dto.ownerEmail,
        remediationDueDate: dto.remediationDueDate ? new Date(dto.remediationDueDate) : undefined,
      },
      update: {
        currentMaturity: dto.currentMaturity,
        targetMaturity: dto.targetMaturity,
        weight: dto.weight,
        riskLevel: dto.riskLevel,
        businessCriticality: dto.businessCriticality,
        controlStatus: dto.controlStatus,
        rationale: dto.rationale,
        evidence: dto.evidence,
        assessorComments: dto.assessorComments,
        ownerName: dto.ownerName,
        ownerEmail: dto.ownerEmail,
        remediationDueDate: dto.remediationDueDate ? new Date(dto.remediationDueDate) : undefined,
      },
    });

    const totalQuestions = await this.prisma.assessmentQuestion.count({
      where: { subcategory: { category: { function: { frameworkId: assessment.template.frameworkId } } } },
    });
    const answeredItems = await this.prisma.assessmentItem.count({ where: { assessmentId } });
    const completionPercentage = totalQuestions > 0 ? Math.round((answeredItems / totalQuestions) * 100) : 0;

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: assessment.status === 'DRAFT' ? 'IN_PROGRESS' : assessment.status,
        completionPercentage,
        updatedById: userId,
      },
    });

    return item;
  }

  async submit(id: string, tenantId: string, userId: string) {
    const assessment = await this.findOrThrow(id, tenantId);
    if (assessment.status === 'SUBMITTED' || assessment.status === 'APPROVED') {
      throw new ConflictException(`Assessment is already '${assessment.status}'`);
    }
    if (assessment.status === 'ARCHIVED') {
      throw new ConflictException('Archived assessments cannot be submitted');
    }
    if (assessment.items.length === 0) {
      throw new BadRequestException('Cannot submit an assessment with no recorded responses');
    }

    const { overall } = await this.scoreAssessment(assessment);
    const hasScore = overall.applicableCount > 0;

    const updated = await this.prisma.assessment.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        updatedById: userId,
        currentMaturity: hasScore ? overall.current : null,
        targetMaturity: hasScore ? overall.target : null,
        maturityGap: hasScore ? overall.gap : null,
      },
    });

    const lastVersion = await this.prisma.assessmentHistory.findFirst({
      where: { assessmentId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    await this.prisma.assessmentHistory.create({
      data: {
        assessmentId: id,
        version: (lastVersion?.version ?? 0) + 1,
        status: updated.status,
        currentMaturity: updated.currentMaturity,
        targetMaturity: updated.targetMaturity,
      },
    });

    return updated;
  }

  /**
   * Scores an assessment's responses against its own framework, via
   * `@cmmp/scoring-engine` — kept as its own standalone step (master
   * prompt §33) rather than folded into the response-recording path in
   * `upsertItem`.
   */
  private async scoreAssessment(assessment: { id: string; template: { frameworkId: string } | null }) {
    if (!assessment.template) {
      throw new ConflictException('Assessment has no framework template to score against');
    }

    const framework = await this.prisma.framework.findFirst({
      where: { id: assessment.template.frameworkId },
      include: frameworkTreeInclude,
    });
    if (!framework) {
      throw new NotFoundException("Assessment's framework not found");
    }
    const definition = toFrameworkDefinition(framework);

    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId: assessment.id },
      include: { question: { include: { subcategory: { select: { code: true } } } } },
    });

    const scoredItems: ScoredItem[] = items.map((item) => ({
      subcategoryCode: item.question.subcategory.code,
      currentMaturity: toSharedMaturityLevel(item.currentMaturity),
      targetMaturity: toSharedMaturityLevel(item.targetMaturity),
      weight: item.weight,
    }));

    return scoreFramework(definition, scoredItems);
  }

  async getResults(id: string, tenantId: string) {
    const assessment = await this.findOrThrow(id, tenantId);
    const { overall, functions } = await this.scoreAssessment(assessment);

    return {
      assessmentId: assessment.id,
      status: assessment.status,
      completionPercentage: assessment.completionPercentage,
      overall,
      functions,
    };
  }

  async getGaps(id: string, tenantId: string, options: AnalyzeGapsOptions = {}) {
    const assessment = await this.findOrThrow(id, tenantId);
    const { functions } = await this.scoreAssessment(assessment);
    return analyzeGaps(functions, options);
  }
}
