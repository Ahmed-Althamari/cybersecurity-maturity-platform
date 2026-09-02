import type { AuditEventSummary } from '@cmmp/shared';
import type { ExecutiveDashboard } from '@cmmp/shared';
import type { IntegrationSettingsStatus } from '@cmmp/shared';
import type { MaturityHeatmap } from '@cmmp/shared';
import type { PaginatedResponse } from '@cmmp/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}

/**
 * Like apiFetch, but for a multipart/form-data upload -- the browser must
 * set its own Content-Type (with the multipart boundary) from the
 * FormData body, so this deliberately sends no Content-Type of its own.
 */
async function apiUpload<T>(accessToken: string, path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}

export interface AssessmentSummary {
  id: string;
  organisationId: string;
  name: string;
  status: string;
  completionPercentage: number;
  currentMaturity: number | null;
  targetMaturity: number | null;
  maturityGap: number | null;
  createdAt: string;
}

export interface LinkedInitiative {
  id: string;
  title: string;
  status: string;
  targetCompletionDate: string | null;
}

export interface FrameworkSummary {
  id: string;
  name: string;
  slug: string;
  version: string;
  frameWorkType: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateAssessmentInput {
  organisationId: string;
  frameworkSlug: string;
  frameworkVersion?: string;
  name: string;
  description?: string;
  assessmentDate: string;
}

export interface AssessmentItemDetail {
  id: string;
  questionId: string;
  currentMaturity: string;
  targetMaturity: string;
  weight: number;
  riskLevel: string;
  businessCriticality: number;
  controlStatus: string;
  rationale: string | null;
  evidence: string | null;
  assessorComments: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  remediationDueDate: string | null;
  question: {
    id: string;
    question: string;
    guidance: string | null;
    subcategoryId: string;
  };
}

export interface AssessmentDetail extends AssessmentSummary {
  items: AssessmentItemDetail[];
}

export interface UpdateAssessmentItemInput {
  currentMaturity?: string;
  targetMaturity?: string;
  controlStatus?: string;
  riskLevel?: string;
  businessCriticality?: number;
  rationale?: string;
  evidence?: string;
  assessorComments?: string;
  ownerName?: string;
  ownerEmail?: string;
}

export interface RiskDetail {
  id: string;
  organisationId: string;
  title: string;
  description: string | null;
  threat: string | null;
  vulnerability: string | null;
  assessmentItemId: string | null;
  assessmentItem: {
    id: string;
    assessmentId: string;
    question: { question: string; subcategory: { code: string; name: string } };
  } | null;
  likelihood: number;
  impact: number;
  inherentRiskScore: number | null;
  residualRiskScore: number | null;
  riskLevel: string;
  owner: string | null;
  treatment: string;
  targetDate: string | null;
  status: string;
  initiatives: LinkedInitiative[];
  createdAt: string;
}

export interface CreateRiskInput {
  organisationId: string;
  title: string;
  description?: string;
  threat?: string;
  vulnerability?: string;
  likelihood?: number;
  impact?: number;
  owner?: string;
  treatment?: string;
  targetDate?: string;
}

export interface UpdateRiskInput {
  title?: string;
  description?: string;
  threat?: string;
  vulnerability?: string;
  likelihood?: number;
  impact?: number;
  riskLevel?: string;
  owner?: string;
  treatment?: string;
  status?: string;
  targetDate?: string;
}

export interface InitiativeDetail {
  id: string;
  organisationId: string;
  title: string;
  description: string | null;
  securityCapability: string | null;
  priority: number;
  complexity: number;
  currentMaturity: string;
  targetMaturity: string;
  estimatedCost: number | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  status: string;
  owner: string | null;
  risks: { id: string; title: string; riskLevel: string; status: string }[];
  createdAt: string;
}

export interface InitiativeTimeline {
  next3Months: InitiativeDetail[];
  next6Months: InitiativeDetail[];
  next12Months: InitiativeDetail[];
  beyondOrUnscheduled: InitiativeDetail[];
}

export interface ImportSheetPreview {
  sheetName: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  /** Parallel to sampleRows -- {} for a sample row with no formula cells. */
  sampleFormulas: Record<string, string>[];
}

export interface ImportPreview {
  sheets: ImportSheetPreview[];
  requiredField: 'subcategoryCode';
  optionalFields: string[];
}

export interface ImportRowResult {
  rowNumber: number;
  status: 'VALID' | 'WARNING' | 'ERROR';
  messages: string[];
  /** Present for VALID/WARNING rows -- the mapped field values actually applied. Absent for ERROR rows. */
  data?: {
    currentMaturity?: string;
    targetMaturity?: string;
    controlStatus?: string;
    riskLevel?: string;
    [key: string]: unknown;
  };
}

export interface ImportResult {
  importJobId: string;
  recordCount: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
  results: ImportRowResult[];
}

export type ColumnMapping = Record<string, string>;

export const api = {
  // Revokes the token server-side (RevokedToken -- see AuthService.logout)
  // so it stops working immediately rather than remaining valid for its
  // full 24h lifetime. See lib/auth.ts's signOutAndRevoke() for why every
  // Sign Out button calls this before clearing the NextAuth session.
  logout: (token: string) => apiFetch<{ message: string }>(token, '/auth/logout', { method: 'POST' }),

  listAssessments: (token: string, page = 1, pageSize = 20) =>
    apiFetch<PaginatedResponse<AssessmentSummary>>(token, `/assessments?page=${page}&pageSize=${pageSize}`),

  listFrameworks: (token: string) => apiFetch<FrameworkSummary[]>(token, '/frameworks'),

  createAssessment: (token: string, input: CreateAssessmentInput) =>
    apiFetch<AssessmentDetail>(token, '/assessments', { method: 'POST', body: JSON.stringify(input) }),

  getAssessment: (token: string, assessmentId: string) =>
    apiFetch<AssessmentDetail>(token, `/assessments/${assessmentId}`),

  previewImport: (token: string, assessmentId: string, file: File, format: 'csv' | 'xlsx') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    return apiUpload<ImportPreview>(token, `/assessments/${assessmentId}/import/preview`, formData);
  },

  suggestMapping: (
    token: string,
    assessmentId: string,
    headers: string[],
    sampleRows: Record<string, unknown>[],
  ) =>
    apiFetch<{ mapping: ColumnMapping }>(token, `/assessments/${assessmentId}/import/suggest-mapping`, {
      method: 'POST',
      body: JSON.stringify({ headers, sampleRows }),
    }),

  importResponses: (
    token: string,
    assessmentId: string,
    file: File,
    format: 'csv' | 'xlsx',
    mapping: ColumnMapping,
    sheetName?: string,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    formData.append('mapping', JSON.stringify(mapping));
    if (sheetName) formData.append('sheetName', sheetName);
    return apiUpload<ImportResult>(token, `/assessments/${assessmentId}/import`, formData);
  },

  updateAssessmentItem: (token: string, assessmentId: string, itemId: string, input: UpdateAssessmentItemInput) =>
    apiFetch<AssessmentDetail>(token, `/assessments/${assessmentId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  submitAssessment: (token: string, assessmentId: string) =>
    apiFetch<AssessmentDetail>(token, `/assessments/${assessmentId}/submit`, { method: 'POST' }),

  approveAssessment: (token: string, assessmentId: string) =>
    apiFetch<AssessmentDetail>(token, `/assessments/${assessmentId}/approve`, { method: 'POST' }),

  reopenAssessment: (token: string, assessmentId: string) =>
    apiFetch<AssessmentDetail>(token, `/assessments/${assessmentId}/reopen`, { method: 'POST' }),

  getExecutiveDashboard: (token: string, assessmentId: string) =>
    apiFetch<ExecutiveDashboard>(token, `/assessments/${assessmentId}/dashboard`),

  getMaturityHeatmap: (token: string, assessmentId: string) =>
    apiFetch<MaturityHeatmap>(token, `/assessments/${assessmentId}/dashboard/heatmap`),

  listRisks: (token: string, page = 1, pageSize = 20) =>
    apiFetch<PaginatedResponse<RiskDetail>>(token, `/risks?sortBy=score&page=${page}&pageSize=${pageSize}`),

  getRoadmapTimeline: (token: string) => apiFetch<InitiativeTimeline>(token, '/initiatives/timeline'),

  // Powers the risk-detail page's initiative *picker* -- a dropdown wants
  // "all of them", not one page, so this requests the largest page the API
  // allows (100) rather than exposing page params to callers. A tenant with
  // more than 100 initiatives will have some missing from the picker; a
  // known, documented limitation (see docs/api-reference.md) rather than
  // building a searchable/paginated picker for what's still a small-scale
  // feature today.
  listInitiatives: (token: string) =>
    apiFetch<PaginatedResponse<InitiativeDetail>>(token, '/initiatives?sortBy=priority&pageSize=100').then(
      (result) => result.data,
    ),

  generateRoadmap: (token: string, assessmentId: string) =>
    apiFetch<InitiativeDetail[]>(token, `/assessments/${assessmentId}/roadmap/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  updateInitiativeStatus: (token: string, initiativeId: string, statusValue: string) =>
    apiFetch<InitiativeDetail>(token, `/initiatives/${initiativeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: statusValue }),
    }),

  getAuditSummary: (token: string) => apiFetch<AuditEventSummary>(token, '/audit-events/summary'),

  // PLATFORM_ADMIN only. Status only -- the API never returns the key
  // itself, on any of these three calls; write-only from the UI's
  // perspective by design.
  getIntegrationSettings: (token: string) =>
    apiFetch<IntegrationSettingsStatus>(token, '/settings/integrations'),

  setAnthropicApiKey: (token: string, apiKey: string) =>
    apiFetch<IntegrationSettingsStatus>(token, '/settings/integrations/anthropic-api-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),

  clearAnthropicApiKey: (token: string) =>
    apiFetch<IntegrationSettingsStatus>(token, '/settings/integrations/anthropic-api-key', {
      method: 'DELETE',
    }),

  getRisk: (token: string, riskId: string) => apiFetch<RiskDetail>(token, `/risks/${riskId}`),

  createRisk: (token: string, input: CreateRiskInput) =>
    apiFetch<RiskDetail>(token, '/risks', { method: 'POST', body: JSON.stringify(input) }),

  updateRisk: (token: string, riskId: string, input: UpdateRiskInput) =>
    apiFetch<RiskDetail>(token, `/risks/${riskId}`, { method: 'PATCH', body: JSON.stringify(input) }),

  linkInitiative: (token: string, riskId: string, initiativeId: string) =>
    apiFetch<RiskDetail>(token, `/risks/${riskId}/initiatives/${initiativeId}`, { method: 'POST' }),

  unlinkInitiative: (token: string, riskId: string, initiativeId: string) =>
    apiFetch<RiskDetail>(token, `/risks/${riskId}/initiatives/${initiativeId}`, { method: 'DELETE' }),
};
