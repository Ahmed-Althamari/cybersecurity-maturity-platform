import { scoreToMaturityLevel } from '@cmmp/scoring-engine';
import { ControlStatus, ControlStatusSchema, MaturityLevelSchema, RiskLevelSchema, type MaturityLevel, type RiskLevel } from '@cmmp/shared';

import type { MappedRow } from './map-row';
import type { CanonicalColumn, ImportedRowData, ValidatedRow, ValidationIssue } from './types';

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === '';
}

const STATUS_SYNONYMS: Record<string, ControlStatus> = {
  NOT_STARTED: ControlStatus.NOT_STARTED,
  NOTSTARTED: ControlStatus.NOT_STARTED,
  'IN PROGRESS': ControlStatus.IN_PROGRESS,
  IN_PROGRESS: ControlStatus.IN_PROGRESS,
  INPROGRESS: ControlStatus.IN_PROGRESS,
  COMPLETE: ControlStatus.COMPLETED,
  COMPLETED: ControlStatus.COMPLETED,
  BLOCKED: ControlStatus.BLOCKED,
};

function parseMaturity(raw: string | undefined, column: CanonicalColumn): { value?: MaturityLevel; issue?: ValidationIssue } {
  if (isBlank(raw)) return {};
  const trimmed = raw.trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: scoreToMaturityLevel(Number(trimmed)) };
  }

  const normalized = trimmed.toUpperCase().replace(/[\s-]+/g, '_').replace(/^N\/A$/, 'NOT_APPLICABLE');
  const parsed = MaturityLevelSchema.safeParse(normalized);
  if (parsed.success) {
    return { value: parsed.data as MaturityLevel };
  }
  return {
    issue: { column, message: `Unrecognised maturity value '${raw}' (expected a number 0-5 or a level name)`, severity: 'error' },
  };
}

function parseRisk(raw: string | undefined): { value?: RiskLevel; issue?: ValidationIssue } {
  if (isBlank(raw)) return {};
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const parsed = RiskLevelSchema.safeParse(normalized);
  if (parsed.success) {
    return { value: parsed.data as RiskLevel };
  }
  return { issue: { column: 'Risk', message: `Unrecognised risk level '${raw}'`, severity: 'error' } };
}

function parseStatus(raw: string | undefined): { value?: ControlStatus; issue?: ValidationIssue } {
  if (isBlank(raw)) return {};
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const synonym = STATUS_SYNONYMS[normalized] ?? STATUS_SYNONYMS[raw.trim().toUpperCase()];
  if (synonym) return { value: synonym };

  const parsed = ControlStatusSchema.safeParse(normalized);
  if (parsed.success) {
    return { value: parsed.data as ControlStatus };
  }
  return { issue: { column: 'Status', message: `Unrecognised status '${raw}'`, severity: 'error' } };
}

function parseWeight(raw: string | undefined): { value?: number; issue?: ValidationIssue } {
  if (isBlank(raw)) return { value: 1 };
  const num = Number(raw.trim());
  if (Number.isNaN(num) || num < 0) {
    return { issue: { column: 'Weight', message: `Weight must be a non-negative number, got '${raw}'`, severity: 'error' } };
  }
  return { value: num };
}

function parseBusinessCriticality(raw: string | undefined): { value?: number; issue?: ValidationIssue } {
  if (isBlank(raw)) return {};
  const num = Number(raw.trim());
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    return {
      issue: { column: 'Business_Criticality', message: `Business criticality must be an integer 1-5, got '${raw}'`, severity: 'error' },
    };
  }
  return { value: num };
}

function parseDueDate(raw: string | undefined): { value?: string; issue?: ValidationIssue } {
  if (isBlank(raw)) return {};
  const date = new Date(raw.trim());
  if (Number.isNaN(date.getTime())) {
    return { issue: { column: 'Due_Date', message: `Could not parse due date '${raw}'`, severity: 'warning' } };
  }
  return { value: date.toISOString() };
}

/** Validates one mapped row into typed `ImportedRowData`, collecting every issue rather than stopping at the first. */
export function validateRow(mapped: MappedRow): ValidatedRow {
  const { raw, rowNumber, sanitizationIssues } = mapped;
  const issues: ValidationIssue[] = [...sanitizationIssues];
  const data: ImportedRowData = {
    framework: raw.Framework,
    function: raw.Function,
    category: raw.Category,
    subcategory: raw.Subcategory,
    question: raw.Assessment_Question,
    evidence: raw.Evidence,
    comments: raw.Comments,
    recommendation: raw.Recommendation,
    owner: raw.Owner,
  };

  if (isBlank(raw.Control_ID)) {
    issues.push({ column: 'Control_ID', message: 'Control_ID is required to match this row to a framework subcategory', severity: 'error' });
  } else {
    data.controlId = raw.Control_ID.trim();
  }

  const current = parseMaturity(raw.Current_Maturity, 'Current_Maturity');
  if (current.issue) issues.push(current.issue);
  data.currentMaturity = current.value;

  const target = parseMaturity(raw.Target_Maturity, 'Target_Maturity');
  if (target.issue) issues.push(target.issue);
  data.targetMaturity = target.value;

  const weight = parseWeight(raw.Weight);
  if (weight.issue) issues.push(weight.issue);
  data.weight = weight.value;

  const risk = parseRisk(raw.Risk);
  if (risk.issue) issues.push(risk.issue);
  data.riskLevel = risk.value;

  const criticality = parseBusinessCriticality(raw.Business_Criticality);
  if (criticality.issue) issues.push(criticality.issue);
  data.businessCriticality = criticality.value;

  const status = parseStatus(raw.Status);
  if (status.issue) issues.push(status.issue);
  data.controlStatus = status.value;

  const dueDate = parseDueDate(raw.Due_Date);
  if (dueDate.issue) issues.push(dueDate.issue);
  data.dueDate = dueDate.value;

  const hasError = issues.some((issue) => issue.severity === 'error');
  const status_: ValidatedRow['status'] = hasError ? 'invalid' : issues.length > 0 ? 'warning' : 'valid';

  return { rowNumber, status: status_, issues, data, raw };
}
