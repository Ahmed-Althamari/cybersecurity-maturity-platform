import {
  mapAndValidateRows,
  parseAllSheets,
  parseSpreadsheet,
  SpreadsheetParseError,
  type ColumnMapping,
  type ImportRowResult,
  type SpreadsheetFormat,
} from '@cmmp/import-engine';
import { BadRequestException, Injectable } from '@nestjs/common';

import { AssessmentsService } from '../assessments/assessments.service';
import { PrismaService } from '../prisma/prisma.service';

import { AiMappingService } from './ai-mapping.service';

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
    private aiMappingService: AiMappingService,
  ) {}

  /**
   * Parses just enough of an uploaded file to drive a column-mapping UI:
   * every worksheet tab's source column headers, plus a few sample rows so
   * a human can tell which header is which before committing to a mapping.
   * Read-only -- nothing is persisted, and the assessment doesn't even need
   * to be editable (previewing a file doesn't change anything).
   *
   * The whole workbook is parsed once here (not once per tab) -- a CSV has
   * exactly one implicit "sheet"; an xlsx workbook returns one entry per
   * real Excel tab, so the frontend never has to re-upload the file just to
   * look at a different tab.
   */
  async previewSpreadsheet(tenantId: string, assessmentId: string, file: UploadedFile, format: SpreadsheetFormat) {
    await this.assessmentsService.findOne(tenantId, assessmentId);

    let sheets;
    try {
      sheets = await parseAllSheets(file.buffer, format);
    } catch (error) {
      if (error instanceof SpreadsheetParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return {
      sheets: sheets.map((sheet) => ({
        sheetName: sheet.sheetName,
        headers: sheet.rows.length > 0 ? Object.keys(sheet.rows[0].cells) : [],
        rowCount: sheet.rows.length,
        sampleRows: sheet.rows.slice(0, 3).map((row) => row.cells),
        // Parallel to sampleRows -- {} for a sample row with no formula
        // cells, so a mapping UI can show "what was calculated, and how"
        // without treating the formula text itself as importable data.
        sampleFormulas: sheet.rows.slice(0, 3).map((row) => row.formulas ?? {}),
      })),
      // The exact set of ColumnMapping keys a caller can map to -- kept
      // here (rather than duplicated in the frontend) so the mapping UI
      // can never drift from what importAssessmentResponses() below
      // actually accepts.
      requiredField: 'subcategoryCode' as const,
      optionalFields: MAPPABLE_ITEM_FIELDS,
    };
  }

  /**
   * Asks Claude to suggest a ColumnMapping for one sheet's headers, given a
   * couple of sample rows for context -- a fallback/enhancement for source
   * spreadsheets whose column names don't exactly match our field names
   * (e.g. "Current Level" instead of currentMaturity), which the frontend's
   * own case-insensitive exact-match auto-mapping can't cover. Every
   * suggested header is verified against the real header list before it's
   * returned (see AiMappingService) -- a hallucinated column name can never
   * silently become part of the mapping. Returns `{}` (never throws) when
   * no API key is configured or the call fails for any reason, so this is
   * always a pure enhancement, never a hard dependency of importing.
   */
  async suggestMapping(headers: string[], sampleRows: Record<string, unknown>[]): Promise<ColumnMapping> {
    const suggestion = await this.aiMappingService.suggestMapping(headers, sampleRows, [
      'subcategoryCode',
      ...MAPPABLE_ITEM_FIELDS,
    ]);
    return suggestion ?? {};
  }

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
    sheetName?: string,
  ) {
    const assessment = await this.assessmentsService.requireEditable(tenantId, assessmentId);

    if (!mapping.subcategoryCode) {
      throw new BadRequestException("Column mapping must include 'subcategoryCode'");
    }

    let rows;
    try {
      rows = await parseSpreadsheet(file.buffer, format, sheetName);
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
        // Records which tab was actually imported in the audit trail --
        // ImportJob has no dedicated sheet-name column, and adding one for
        // a single display string isn't worth a migration.
        fileName: sheetName ? `${file.originalname} [${sheetName}]` : file.originalname,
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
