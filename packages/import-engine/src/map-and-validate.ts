import { ControlStatus, MaturityLevel, RiskLevel } from '@cmmp/shared';
import { sanitizeFormulaInjection } from './sanitize';
import type { ColumnMapping, ImportRowResult, MappedAssessmentRow, ParsedRow } from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEnumInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function cellString(cells: Record<string, unknown>, column: string | undefined): string | undefined {
  if (!column) {
    return undefined;
  }
  const raw = cells[column];
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const text = raw instanceof Date ? raw.toISOString() : String(raw);
  return text.trim().length > 0 ? text : undefined;
}

interface RowContext {
  errors: string[];
  warnings: string[];
}

/** Sanitizes a free-text value for formula injection, recording a warning if it had to. */
function sanitizeText(value: string, fieldLabel: string, ctx: RowContext): string {
  const { value: sanitized, sanitized: wasSanitized } = sanitizeFormulaInjection(value);
  if (wasSanitized) {
    ctx.warnings.push(
      `${fieldLabel} started with a spreadsheet-formula character and was neutralized for safety`,
    );
  }
  return sanitized;
}

function parseEnumField<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fieldLabel: string,
  ctx: RowContext,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const normalized = normalizeEnumInput(raw);
  const match = allowed.find((value) => value === normalized);
  if (!match) {
    ctx.errors.push(`${fieldLabel} '${raw}' is not one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return match;
}

function mapRow(row: ParsedRow, mapping: ColumnMapping): { data: MappedAssessmentRow; ctx: RowContext } {
  const ctx: RowContext = { errors: [], warnings: [] };
  const { cells } = row;

  const subcategoryCode = cellString(cells, mapping.subcategoryCode);
  if (!subcategoryCode) {
    ctx.errors.push("Missing required 'subcategoryCode' value");
  }

  const rationale = cellString(cells, mapping.rationale);
  const evidence = cellString(cells, mapping.evidence);
  const assessorComments = cellString(cells, mapping.assessorComments);
  const ownerName = cellString(cells, mapping.ownerName);
  const ownerEmail = cellString(cells, mapping.ownerEmail);

  const businessCriticalityRaw = cellString(cells, mapping.businessCriticality);
  let businessCriticality: number | undefined;
  if (businessCriticalityRaw !== undefined) {
    const parsed = Number(businessCriticalityRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      ctx.errors.push(`businessCriticality '${businessCriticalityRaw}' must be an integer from 1 to 5`);
    } else {
      businessCriticality = parsed;
    }
  }

  if (ownerEmail !== undefined && !EMAIL_PATTERN.test(ownerEmail)) {
    ctx.errors.push(`ownerEmail '${ownerEmail}' is not a valid email address`);
  }

  const remediationDueDateRaw = cellString(cells, mapping.remediationDueDate);
  let remediationDueDate: Date | undefined;
  if (remediationDueDateRaw !== undefined) {
    const parsed = new Date(remediationDueDateRaw);
    if (Number.isNaN(parsed.getTime())) {
      ctx.errors.push(`remediationDueDate '${remediationDueDateRaw}' is not a valid date`);
    } else {
      remediationDueDate = parsed;
    }
  }

  const data: MappedAssessmentRow = {
    subcategoryCode: subcategoryCode ?? '',
    currentMaturity: parseEnumField(
      cellString(cells, mapping.currentMaturity),
      Object.values(MaturityLevel),
      'currentMaturity',
      ctx,
    ),
    targetMaturity: parseEnumField(
      cellString(cells, mapping.targetMaturity),
      Object.values(MaturityLevel),
      'targetMaturity',
      ctx,
    ),
    riskLevel: parseEnumField(cellString(cells, mapping.riskLevel), Object.values(RiskLevel), 'riskLevel', ctx),
    controlStatus: parseEnumField(
      cellString(cells, mapping.controlStatus),
      Object.values(ControlStatus),
      'controlStatus',
      ctx,
    ),
    businessCriticality,
    rationale: rationale !== undefined ? sanitizeText(rationale, 'rationale', ctx) : undefined,
    evidence: evidence !== undefined ? sanitizeText(evidence, 'evidence', ctx) : undefined,
    assessorComments:
      assessorComments !== undefined ? sanitizeText(assessorComments, 'assessorComments', ctx) : undefined,
    ownerName: ownerName !== undefined ? sanitizeText(ownerName, 'ownerName', ctx) : undefined,
    ownerEmail,
    remediationDueDate,
  };

  return { data, ctx };
}

/**
 * Applies a column mapping to every parsed row, validates and sanitizes
 * each field, and returns one result per row. Rows with any validation
 * error carry no `data` (nothing safe to apply); rows that only needed
 * formula-injection sanitization are `WARNING`, still importable.
 */
export function mapAndValidateRows(rows: ParsedRow[], mapping: ColumnMapping): ImportRowResult[] {
  return rows.map((row) => {
    const { data, ctx } = mapRow(row, mapping);
    if (ctx.errors.length > 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'ERROR',
        messages: ctx.errors,
        raw: row.cells,
      };
    }
    return {
      rowNumber: row.rowNumber,
      status: ctx.warnings.length > 0 ? 'WARNING' : 'VALID',
      messages: ctx.warnings,
      data,
      raw: row.cells,
    };
  });
}
