import { frameworkTreeInclude, toFrameworkDefinition } from '@cmmp/database';
import {
  buildErrorReportCsv,
  CANONICAL_COLUMNS,
  importFromSheet,
  parseCsv,
  parseXlsx,
  validateFileSignature,
  validateFileUpload,
  type CanonicalColumn,
  type ColumnMapping,
  type RawSheet,
  type ValidatedRow,
} from '@cmmp/import-engine';
import { analyzeGaps, scoreFramework, type AnalyzeGapsOptions, type ScoredItem } from '@cmmp/scoring-engine';
import { MaturityLevel as SharedMaturityLevel } from '@cmmp/shared';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpsertAssessmentItemDto } from './dto/upsert-assessment-item.dto';
import { ImportMappingSuggesterService } from './import-mapping/mapping-suggester.service';

const CANONICAL_COLUMN_SET = new Set<string>(CANONICAL_COLUMNS);

/** Parses and validates a user-supplied column-mapping override — an unknown canonical key or a non-string value is rejected outright rather than silently ignored, since this came from a request body, not a trusted default. */
export function parseColumnMappingOverride(raw: string | undefined): ColumnMapping | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('columnMapping must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestException('columnMapping must be a JSON object');
  }
  const mapping: ColumnMapping = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!CANONICAL_COLUMN_SET.has(key)) {
      throw new BadRequestException(`columnMapping has an unknown field: ${key}`);
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`columnMapping.${key} must be a string`);
    }
    mapping[key as CanonicalColumn] = value;
  }
  return mapping;
}

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
  constructor(
    private prisma: PrismaService,
    private mappingSuggester: ImportMappingSuggesterService,
  ) {}

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

    await this.recomputeCompletion(assessmentId, assessment.template.frameworkId, assessment.status, userId);

    return item;
  }

  /**
   * Bulk-imports assessment responses from an uploaded .xlsx/.xls/.csv
   * file (master prompt §14). Every row is classified — valid, warning,
   * invalid, or duplicate — and nothing is silently discarded: only
   * `valid` rows whose `Control_ID` resolves to a real subcategory in
   * this assessment's framework are written; everything else comes back
   * in the response (plus a downloadable CSV error report) instead of
   * disappearing.
   */
  /** Shared by `importFile` and `previewImport` — parses the upload into a `RawSheet` regardless of .csv/.xlsx, after the same file-guard checks either caller needs. */
  private async parseUploadedSheet(file: Express.Multer.File, worksheetName?: string): Promise<{ sheet: RawSheet; sheetNames: string[] }> {
    const fileIssues = validateFileUpload({ filename: file.originalname, mimetype: file.mimetype, size: file.size });
    if (fileIssues.some((issue) => issue.severity === 'error')) {
      throw new BadRequestException({ message: 'Invalid file upload', issues: fileIssues });
    }

    // Signature/magic-byte check: confirms the upload's actual bytes match
    // what its extension claims (a real ZIP-backed .xlsx, or genuinely
    // text-only content for .csv) before handing it to the parser — closes
    // the "renamed/disguised file" gap that extension/size/MIME metadata
    // checks alone can't catch.
    const signatureIssues = validateFileSignature(file.buffer, file.originalname);
    if (signatureIssues.length > 0) {
      throw new BadRequestException({ message: 'Invalid file upload', issues: signatureIssues });
    }

    const isCsv = file.originalname.toLowerCase().endsWith('.csv');
    if (isCsv) {
      return { sheet: parseCsv(file.buffer.toString('utf-8')), sheetNames: [] };
    }
    return parseXlsx(file.buffer, worksheetName);
  }

  private async assertEditableAssessment(assessmentId: string, tenantId: string) {
    const assessment = await this.findOrThrow(assessmentId, tenantId);
    if (!EDITABLE_STATUSES.includes(assessment.status)) {
      throw new ConflictException(`Assessment cannot be edited while in '${assessment.status}' status`);
    }
    if (!assessment.template) {
      throw new ConflictException('Assessment has no framework template to import responses against');
    }
    return { ...assessment, template: assessment.template };
  }

  /**
   * Parses the upload and returns the auto-detected (+ LLM-suggested, when configured) column
   * mapping and validation counts, without writing anything — lets the import wizard show the
   * user what will happen and let them correct a mapping before committing to `importFile`.
   */
  async previewImport(assessmentId: string, tenantId: string, file: Express.Multer.File, worksheetName?: string) {
    await this.assertEditableAssessment(assessmentId, tenantId);
    const { sheet, sheetNames } = await this.parseUploadedSheet(file, worksheetName);

    const autoResult = importFromSheet(sheet);
    const llmSuggested = await this.mappingSuggester.suggestMapping(sheet.headers, sheet.rows, autoResult.unmappedColumns);
    const finalResult =
      Object.keys(llmSuggested).length > 0 ? importFromSheet(sheet, { columnMapping: llmSuggested }) : autoResult;

    return {
      sheetNames,
      headers: sheet.headers,
      columnMapping: finalResult.columnMapping,
      unmappedColumns: finalResult.unmappedColumns,
      llmConfigured: this.mappingSuggester.isConfigured,
      llmSuggestedColumns: Object.keys(llmSuggested) as CanonicalColumn[],
      totalRows: finalResult.totalRows,
      validCount: finalResult.valid.length,
      warningCount: finalResult.warnings.length,
      invalidCount: finalResult.invalid.length,
      duplicateCount: finalResult.duplicates.length,
    };
  }

  async importFile(
    assessmentId: string,
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
    worksheetName?: string,
    columnMappingOverride?: ColumnMapping,
  ) {
    const assessment = await this.assertEditableAssessment(assessmentId, tenantId);
    const { sheet } = await this.parseUploadedSheet(file, worksheetName);
    const importResult = importFromSheet(sheet, { columnMapping: columnMappingOverride });

    // `warning` rows are importable — the flagged issue (e.g. a sanitised
    // formula cell, an unparseable due date) has already been handled or
    // is non-blocking; only `invalid` and `duplicate` rows are held back.
    const importCandidates = [...importResult.valid, ...importResult.warnings];
    const candidateCodes = importCandidates.map((row) => row.data.controlId).filter((code): code is string => Boolean(code));

    const questions = await this.prisma.assessmentQuestion.findMany({
      where: {
        subcategory: { code: { in: candidateCodes }, category: { function: { frameworkId: assessment.template.frameworkId } } },
      },
      include: { subcategory: { select: { code: true } } },
    });
    const questionIdByCode = new Map(questions.map((question) => [question.subcategory.code, question.id]));

    const imported: { row: ValidatedRow; questionId: string }[] = [];
    const unmatched: ValidatedRow[] = [];
    for (const row of importCandidates) {
      const questionId = row.data.controlId ? questionIdByCode.get(row.data.controlId) : undefined;
      if (questionId) {
        imported.push({ row, questionId });
      } else {
        unmatched.push({
          ...row,
          status: 'invalid',
          issues: [
            ...row.issues,
            { column: 'Control_ID', message: "Control_ID does not match any subcategory in this assessment's framework", severity: 'error' },
          ],
        });
      }
    }

    if (imported.length > 0) {
      await this.prisma.$transaction(
        imported.map(({ row, questionId }) =>
          this.prisma.assessmentItem.upsert({
            where: { assessmentId_questionId: { assessmentId, questionId } },
            create: {
              assessmentId,
              questionId,
              currentMaturity: row.data.currentMaturity,
              targetMaturity: row.data.targetMaturity,
              weight: row.data.weight,
              riskLevel: row.data.riskLevel,
              businessCriticality: row.data.businessCriticality,
              controlStatus: row.data.controlStatus,
              evidence: row.data.evidence,
              assessorComments: row.data.comments,
              ownerName: row.data.owner,
              remediationDueDate: row.data.dueDate ? new Date(row.data.dueDate) : undefined,
            },
            update: {
              currentMaturity: row.data.currentMaturity,
              targetMaturity: row.data.targetMaturity,
              weight: row.data.weight,
              riskLevel: row.data.riskLevel,
              businessCriticality: row.data.businessCriticality,
              controlStatus: row.data.controlStatus,
              evidence: row.data.evidence,
              assessorComments: row.data.comments,
              ownerName: row.data.owner,
              remediationDueDate: row.data.dueDate ? new Date(row.data.dueDate) : undefined,
            },
          }),
        ),
      );

      await this.recomputeCompletion(assessmentId, assessment.template.frameworkId, assessment.status, userId);
    }

    // A row that started as `warning` (e.g. a sanitised formula cell) but
    // turned out to have no matching subcategory moves to `invalid`
    // entirely, rather than being reported under both buckets.
    const unmatchedRowNumbers = new Set(unmatched.map((row) => row.rowNumber));
    const stillWarnings = importResult.warnings.filter((row) => !unmatchedRowNumbers.has(row.rowNumber));

    const rejected = {
      ...importResult,
      warnings: stillWarnings,
      invalid: [...importResult.invalid, ...unmatched],
    };

    return {
      totalRows: importResult.totalRows,
      importedCount: imported.length,
      validCount: importResult.valid.length,
      warningCount: stillWarnings.length,
      invalidCount: rejected.invalid.length,
      duplicateCount: importResult.duplicates.length,
      columnMapping: importResult.columnMapping,
      unmappedColumns: importResult.unmappedColumns,
      errorReportCsv: buildErrorReportCsv(rejected),
    };
  }

  private async recomputeCompletion(assessmentId: string, frameworkId: string, currentStatus: string, userId: string) {
    const totalQuestions = await this.prisma.assessmentQuestion.count({
      where: { subcategory: { category: { function: { frameworkId } } } },
    });
    const answeredItems = await this.prisma.assessmentItem.count({ where: { assessmentId } });
    const completionPercentage = totalQuestions > 0 ? Math.round((answeredItems / totalQuestions) * 100) : 0;

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: currentStatus === 'DRAFT' ? 'IN_PROGRESS' : currentStatus,
        completionPercentage,
        updatedById: userId,
      },
    });
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
