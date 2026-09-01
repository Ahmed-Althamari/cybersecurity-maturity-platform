import {
  mapAndValidateRows,
  parseSpreadsheet,
  SpreadsheetParseError,
  type ColumnMapping,
  type ImportRowResult,
  type SpreadsheetFormat,
} from '@cmmp/import-engine';
import { BadRequestException, Injectable } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface ResolvedRowResult extends ImportRowResult {
  itemId?: string;
}

const MAPPABLE_ITEM_FIELDS = [
  'currentMaturity',
  'targetMaturity',
  'riskLevel',
  'controlStatus',
  'businessCriticality',
  'rationale',
  'evidence',
  'assessorComments',
  'ownerName',
  'ownerEmail',
  'remediationDueDate',
] as const;

@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private assessmentsService: AssessmentsService,
  ) {}

  /**
   * Bulk-updates an assessment's existing AssessmentItems (one row per
   * NIST subcategory code) from an uploaded CSV/XLSX file, all within a
   * single transaction alongside the ImportJob/ImportRecord audit trail
   * (Phase 8's "bulk import with transaction support"). Assessment items
   * are pre-seeded from the framework at assessment-creation time (Phase
   * 6), so import never creates new items — only resolves and updates
   * ones that already exist for this assessment.
   */
  async importAssessmentResponses(
    tenantId: string,
    userId: string,
    assessmentId: string,
    file: UploadedFile,
    format: SpreadsheetFormat,
    mapping: ColumnMapping,
  ) {
    const assessment = await this.assessmentsService.requireEditable(tenantId, assessmentId);

    if (!mapping.subcategoryCode) {
      throw new BadRequestException("Column mapping must include 'subcategoryCode'");
    }

    let rows;
    try {
      rows = await parseSpreadsheet(file.buffer, format);
    } catch (error) {
      if (error instanceof SpreadsheetParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const results = mapAndValidateRows(rows, mapping);
    const resolvedResults = await this.resolveItemIds(assessmentId, results);

    const importJob = await this.prisma.importJob.create({
      data: {
        organisationId: assessment.organisationId,
        fileName: file.originalname,
        fileSize: file.size,
        recordCount: rows.length,
        status: 'PROCESSING',
      },
    });

    const applicable = resolvedResults.filter((result) => result.status !== 'ERROR' && result.itemId);

    await this.prisma.$transaction([
      ...applicable.map((result) =>
        this.prisma.assessmentItem.update({
          where: { id: result.itemId },
          data: pickDefined(result.data!, MAPPABLE_ITEM_FIELDS),
        }),
      ),
      ...resolvedResults.map((result) =>
        this.prisma.importRecord.create({
          data: {
            jobId: importJob.id,
            rowNumber: result.rowNumber,
            status: result.status,
            message: result.messages.join('; ') || null,
            rawData: JSON.stringify(result.raw),
            parsedData: result.data ? JSON.stringify(result.data) : null,
          },
        }),
      ),
    ]);

    const errorResults = resolvedResults.filter((result) => result.status === 'ERROR');
    const warningCount = resolvedResults.filter((result) => result.status === 'WARNING').length;

    await this.prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: 'COMPLETED',
        successCount: applicable.length,
        errorCount: errorResults.length,
        warningCount,
        errorReport:
          errorResults.length > 0
            ? JSON.stringify(errorResults.map((r) => ({ rowNumber: r.rowNumber, messages: r.messages })))
            : null,
        completedAt: new Date(),
      },
    });

    if (applicable.length > 0) {
      await this.assessmentsService.recalculateProgress(assessmentId, userId);
    }

    return {
      importJobId: importJob.id,
      recordCount: rows.length,
      successCount: applicable.length,
      warningCount,
      errorCount: errorResults.length,
      results: resolvedResults,
    };
  }

  /** Matches each row's subcategoryCode against this assessment's own items; unmatched codes become row-level errors. */
  private async resolveItemIds(
    assessmentId: string,
    results: ImportRowResult[],
  ): Promise<ResolvedRowResult[]> {
    const items = await this.prisma.assessmentItem.findMany({
      where: { assessmentId },
      select: { id: true, question: { select: { subcategory: { select: { code: true } } } } },
    });
    const itemIdByCode = new Map(items.map((item) => [item.question.subcategory.code, item.id]));

    return results.map((result) => {
      if (result.status === 'ERROR' || !result.data) {
        return result;
      }
      const itemId = itemIdByCode.get(result.data.subcategoryCode);
      if (!itemId) {
        return {
          ...result,
          status: 'ERROR',
          messages: [
            ...result.messages,
            `No item found for subcategory code '${result.data.subcategoryCode}' in this assessment's framework`,
          ],
          data: undefined,
        };
      }
      return { ...result, itemId };
    });
  }
}

function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<T> {
  const picked: Partial<T> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      picked[key] = source[key];
    }
  }
  return picked;
}
