// Typed client for the NestJS API (apps/api). Every call needs the
// caller's NextAuth `accessToken` — there's no cookie-based session on the
// API side, it's bearer-JWT only (see apps/api/src/auth).

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message || `Request to ${path} failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

/**
 * Separate from apiFetch on purpose: that helper always sets Content-Type: application/json
 * whenever a body is present, which would corrupt a multipart upload — a browser's fetch() needs
 * to set its own Content-Type (with the `boundary=...` it generates) when the body is a FormData,
 * and an explicit JSON header here would make FileInterceptor never see a real file field.
 */
async function apiFetchFormData<T>(path: string, accessToken: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message || `Request to ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ============================================================================
// TYPES — mirror apps/api's response shapes
// ============================================================================

export interface FrameworkSummary {
  id: string;
  name: string;
  slug: string;
  version: string;
  frameWorkType: string;
  description: string | null;
  isActive: boolean;
}

export interface AssessmentSummary {
  id: string;
  name: string;
  status: string;
  assessmentDate: string;
  completionPercentage: number;
  currentMaturity: number | null;
  targetMaturity: number | null;
  organisationId: string;
  template: { id: string; frameworkId: string; name: string } | null;
  _count: { items: number };
}

export interface AssessmentItemRecord {
  id: string;
  questionId: string;
  currentMaturity: string;
  targetMaturity: string;
}

/** GET /assessments/:id — note `items` here (every recorded response), not the list endpoint's `_count`. */
export interface AssessmentDetail {
  id: string;
  name: string;
  status: string;
  completionPercentage: number;
  organisationId: string;
  template: { id: string; frameworkId: string; name: string } | null;
  items: AssessmentItemRecord[];
}

export interface FrameworkQuestion {
  id: string;
  question: string;
  guidance: string | null;
}

export interface FrameworkTreeSubcategory {
  id: string;
  code: string;
  name: string;
  assessmentQuestions: FrameworkQuestion[];
}

export interface FrameworkTreeCategory {
  id: string;
  code: string;
  name: string;
  subcategories: FrameworkTreeSubcategory[];
}

export interface FrameworkTreeFunction {
  id: string;
  code: string;
  name: string;
  categories: FrameworkTreeCategory[];
}

/** GET /frameworks/:id — the raw nested tree (every question included), unlike the flattened NavigationNode[] the /navigation endpoint returns. */
export interface FrameworkTree {
  id: string;
  name: string;
  functions: FrameworkTreeFunction[];
}

export interface MaturityScore {
  current: number;
  target: number;
  gap: number;
  itemCount: number;
  applicableCount: number;
}

export interface ScoredNode {
  code: string;
  label: string;
  depth: number;
  score: MaturityScore;
  children: ScoredNode[];
}

export interface AssessmentResults {
  assessmentId: string;
  status: string;
  completionPercentage: number;
  overall: MaturityScore;
  functions: ScoredNode[];
}

export interface MaturityOverview {
  assessmentId: string;
  /** Every assessment folded into these numbers. Length 1 unless `combined` is true. */
  assessmentIds: string[];
  /** True when this organisation had more than one active (SUBMITTED/APPROVED) assessment, so the numbers below are a weighted rollup across all of them. */
  combined: boolean;
  overallMaturity: number;
  targetMaturity: number;
  maturityGap: number;
  completionPercentage: number;
  criticalGaps: number;
  highRiskFindings: number;
  openRemediationActions: number;
}

export interface FunctionMaturity {
  code: string;
  name: string;
  currentMaturity: number;
  targetMaturity: number;
  gap: number;
  completionPercentage: number;
  highRiskGaps: number;
  trend?: number;
}

export interface GapAnalysisEntry {
  functionCode: string;
  functionName: string;
  currentMaturity: number;
  targetMaturity: number;
  gap: number;
  riskLevel: string;
  affectedControls: number;
}

export interface RiskSummary {
  countByLevel: Record<string, number>;
  totalOpen: number;
  topRisks: Array<{
    id: string;
    title: string;
    description: string | null;
    riskLevel: string;
    inherentRiskScore: number | null;
    owner: string | null;
    status: string;
  }>;
}

export interface RoadmapInitiative {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  targetCompletionDate: string | null;
  owner: string | null;
}

export interface RoadmapStatus {
  countByStatus: Record<string, number>;
  overdueCount: number;
  buckets: Record<'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'STRATEGIC' | 'UNSCHEDULED', RoadmapInitiative[]>;
}

export interface RemediationInitiativeSummary {
  id: string;
  title: string;
  status: string;
}

export interface RiskRecord {
  id: string;
  organisationId: string;
  title: string;
  description: string | null;
  threat: string | null;
  vulnerability: string | null;
  likelihood: number;
  impact: number;
  inherentRiskScore: number | null;
  residualRiskScore: number | null;
  riskLevel: string;
  owner: string | null;
  treatment: string;
  targetDate: string | null;
  // Optional: older callers (e.g. the risk list page, which only ever
  // renders summary fields) don't need this populated, but the risk-detail
  // page's initiative picker does — the API includes it on GET /risks/:id.
  initiatives?: RemediationInitiativeSummary[];
  status: string;
}

export interface CreateRiskInput {
  organisationId: string;
  title: string;
  description?: string;
  threat?: string;
  vulnerability?: string;
  likelihood: number;
  impact: number;
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
  residualRiskScore?: number;
  owner?: string;
  treatment?: string;
  status?: string;
  targetDate?: string;
}

export interface NavigationNode {
  id: string;
  code: string;
  label: string;
  description?: string;
  path: string;
  depth: number;
  children: NavigationNode[];
}

// ============================================================================
// CALLS
// ============================================================================

export function listFrameworks(accessToken: string) {
  return apiFetch<FrameworkSummary[]>('/frameworks', accessToken);
}

/** The API's GET /frameworks/:id also returns the full nested function/category/subcategory tree, which this ignores — GET /frameworks/:id/navigation below is the shape actually built for browsing it. */
export function getFramework(accessToken: string, id: string) {
  return apiFetch<FrameworkSummary>(`/frameworks/${id}`, accessToken);
}

export function getFrameworkNavigation(accessToken: string, id: string) {
  return apiFetch<NavigationNode[]>(`/frameworks/${id}/navigation`, accessToken);
}

export function listAssessments(accessToken: string, organisationId?: string) {
  const query = organisationId ? `?organisationId=${encodeURIComponent(organisationId)}` : '';
  return apiFetch<AssessmentSummary[]>(`/assessments${query}`, accessToken);
}

export function getAssessmentResults(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentResults>(`/assessments/${assessmentId}/results`, accessToken);
}

export function getAssessment(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentDetail>(`/assessments/${assessmentId}`, accessToken);
}

/** Ignores the nested assessmentQuestions[].guidance/examples/referenceLinks fields this doesn't need — GET /frameworks/:id returns the full raw tree either way. */
export function getFrameworkTree(accessToken: string, frameworkId: string) {
  return apiFetch<FrameworkTree>(`/frameworks/${frameworkId}`, accessToken);
}

export interface UpsertAssessmentItemInput {
  questionId: string;
  currentMaturity?: string;
  targetMaturity?: string;
}

export function upsertAssessmentItem(accessToken: string, assessmentId: string, input: UpsertAssessmentItemInput) {
  return apiFetch<AssessmentItemRecord>(`/assessments/${assessmentId}/items`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function submitAssessment(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentDetail>(`/assessments/${assessmentId}/submit`, accessToken, { method: 'POST' });
}

export interface ImportResult {
  totalRows: number;
  importedCount: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
  columnMapping: Record<string, string>;
  unmappedColumns: string[];
  errorReportCsv: string;
}

export interface ImportPreviewResult {
  sheetNames: string[];
  headers: string[];
  columnMapping: Record<string, string>;
  unmappedColumns: string[];
  /** Whether an LLM mapping assistant is configured server-side at all (an API key is set) — independent of whether it actually suggested anything for this file. */
  llmConfigured: boolean;
  /** Canonical columns the LLM assistant resolved that plain alias-matching didn't. */
  llmSuggestedColumns: string[];
  totalRows: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
}

/** Dry-runs an import (parses, auto-maps, and — when an LLM mapping assistant is configured — asks it to resolve any columns auto-mapping couldn't) without writing anything, so the wizard can show the user what will happen and let them fix the mapping first. */
export function previewAssessmentImport(accessToken: string, assessmentId: string, file: File, worksheet?: string) {
  const formData = new FormData();
  formData.append('file', file);
  const query = worksheet ? `?worksheet=${encodeURIComponent(worksheet)}` : '';
  return apiFetchFormData<ImportPreviewResult>(`/assessments/${assessmentId}/import/preview${query}`, accessToken, formData);
}

/** `columnMapping` overrides auto-detection for the named canonical columns; pass the (possibly user-edited) mapping from `previewAssessmentImport` to import against exactly what was shown. `worksheet` selects which sheet of a multi-sheet workbook to import — omit for the first sheet. */
export function importAssessmentFile(
  accessToken: string,
  assessmentId: string,
  file: File,
  columnMapping?: Record<string, string>,
  worksheet?: string,
) {
  const formData = new FormData();
  formData.append('file', file);
  if (columnMapping) {
    formData.append('columnMapping', JSON.stringify(columnMapping));
  }
  const query = worksheet ? `?worksheet=${encodeURIComponent(worksheet)}` : '';
  return apiFetchFormData<ImportResult>(`/assessments/${assessmentId}/import${query}`, accessToken, formData);
}

export function getDashboardMaturity(accessToken: string, organisationId: string, assessmentId?: string) {
  const query = new URLSearchParams({ organisationId, ...(assessmentId ? { assessmentId } : {}) });
  return apiFetch<MaturityOverview>(`/dashboard/maturity?${query}`, accessToken);
}

export function getDashboardFunctions(accessToken: string, organisationId: string, assessmentId?: string) {
  const query = new URLSearchParams({ organisationId, ...(assessmentId ? { assessmentId } : {}) });
  return apiFetch<FunctionMaturity[]>(`/dashboard/functions?${query}`, accessToken);
}

export function getDashboardGaps(accessToken: string, organisationId: string, assessmentId?: string, limit = 10) {
  const query = new URLSearchParams({ organisationId, limit: String(limit), ...(assessmentId ? { assessmentId } : {}) });
  return apiFetch<GapAnalysisEntry[]>(`/dashboard/gaps?${query}`, accessToken);
}

export function getDashboardRisks(accessToken: string, organisationId: string, limit = 10) {
  const query = new URLSearchParams({ organisationId, limit: String(limit) });
  return apiFetch<RiskSummary>(`/dashboard/risks?${query}`, accessToken);
}

export function listRisks(
  accessToken: string,
  organisationId: string,
  options: { status?: string; riskLevel?: string; sort?: 'priority' | 'recent' } = {},
) {
  // `new URLSearchParams({ ..., status: undefined })` would otherwise stringify the value as the
  // literal text "undefined" (URLSearchParams' object constructor calls String() on every value),
  // sending `status=undefined` and silently matching zero rows server-side instead of "no filter".
  const params: Record<string, string> = { organisationId };
  if (options.status) params.status = options.status;
  if (options.riskLevel) params.riskLevel = options.riskLevel;
  if (options.sort) params.sort = options.sort;
  const query = new URLSearchParams(params);
  return apiFetch<RiskRecord[]>(`/risks?${query}`, accessToken);
}

export function getRisk(accessToken: string, id: string) {
  return apiFetch<RiskRecord>(`/risks/${id}`, accessToken);
}

export function createRisk(accessToken: string, input: CreateRiskInput) {
  return apiFetch<RiskRecord>('/risks', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateRisk(accessToken: string, id: string, input: UpdateRiskInput) {
  return apiFetch<RiskRecord>(`/risks/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteRisk(accessToken: string, id: string) {
  return apiFetch<{ message: string }>(`/risks/${id}`, accessToken, { method: 'DELETE' });
}

export interface PaginatedInitiatives {
  data: RemediationInitiativeSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function listInitiatives(
  accessToken: string,
  organisationId: string,
  options: { search?: string; page?: number; pageSize?: number } = {},
) {
  const params: Record<string, string> = { organisationId };
  if (options.search) params.search = options.search;
  if (options.page) params.page = String(options.page);
  if (options.pageSize) params.pageSize = String(options.pageSize);
  const query = new URLSearchParams(params);
  return apiFetch<PaginatedInitiatives>(`/remediation-initiatives?${query}`, accessToken);
}

// Linking is modelled on the initiative, not the risk (`POST/DELETE
// /remediation-initiatives/:id/risks/:riskId`) — these just call that from
// the risk-detail page's point of view.
export function linkInitiative(accessToken: string, initiativeId: string, riskId: string) {
  return apiFetch<unknown>(`/remediation-initiatives/${initiativeId}/risks/${riskId}`, accessToken, { method: 'POST' });
}

export function unlinkInitiative(accessToken: string, initiativeId: string, riskId: string) {
  return apiFetch<unknown>(`/remediation-initiatives/${initiativeId}/risks/${riskId}`, accessToken, { method: 'DELETE' });
}

export function getDashboardRoadmap(accessToken: string, organisationId: string) {
  const query = new URLSearchParams({ organisationId });
  return apiFetch<RoadmapStatus>(`/dashboard/roadmap?${query}`, accessToken);
}

// ============================================================================
// DATA ANALYSIS — isolated feature, unrelated to the assessments/risks/frameworks
// domain above. See apps/api/src/data-analysis and services/data-analysis.
// ============================================================================

export type AnalysisMode = 'local' | 'ai';

export interface AnalysisColumn {
  name: string;
  dtype: string;
}

export interface AnalysisChart {
  title: string;
  imageBase64: string;
}

export interface AnalysisResult {
  mode: AnalysisMode;
  rowCount: number;
  columnCount: number;
  columns: AnalysisColumn[];
  charts: AnalysisChart[];
  answer: string | null;
  table: Record<string, unknown>[] | null;
  error: string | null;
}

/**
 * `mode: "local"` runs AutoViz only — zero LLM calls, zero network calls of any kind — for
 * tenants who don't want their spreadsheet data leaving the platform. `mode: "ai"` sends the
 * data to whichever LLM chain the server has configured (see llm-client.ts) for natural-language
 * analysis beyond AutoViz's fixed chart set; `question` is only used in this mode.
 */
export function analyzeSpreadsheet(accessToken: string, file: File, mode: AnalysisMode, question?: string, slot?: number) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  if (question) {
    formData.append('question', question);
  }
  // "ai" mode only: which single configured provider slot to use instead of the default full
  // fallback chain (tried in slot order). Ignored server-side for "local" mode.
  if (slot) {
    formData.append('slot', String(slot));
  }
  return apiFetchFormData<AnalysisResult>('/data-analysis/analyze', accessToken, formData);
}

// ============================================================================
// LLM SETTINGS — the "AI Assisted" panel. Lets a tenant configure its own provider
// credentials (Claude, or any OpenAI-compatible endpoint) instead of relying only on the
// platform-wide LLM_PROVIDER_<n>_* env vars. Once configured, both the import wizard's
// column-mapping suggestions and Data Analysis's "ai" mode run on these credentials.
// See apps/api/src/llm-settings.
// ============================================================================

export type LlmProviderFormat = 'openai' | 'anthropic';

export interface LlmProviderSettingView {
  slot: number;
  format: LlmProviderFormat;
  baseUrl: string | null;
  model: string;
  configured: boolean;
  platformDefaultAvailable: boolean;
  apiKeyPreview: string | null;
  updatedAt: string | null;
}

export interface UpsertLlmProviderSettingInput {
  format: LlmProviderFormat;
  baseUrl?: string;
  model: string;
  apiKey: string;
}

export function listLlmProviderSettings(accessToken: string) {
  return apiFetch<LlmProviderSettingView[]>('/llm-settings', accessToken);
}

export function upsertLlmProviderSetting(accessToken: string, slot: number, input: UpsertLlmProviderSettingInput) {
  return apiFetch<LlmProviderSettingView>(`/llm-settings/${slot}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteLlmProviderSetting(accessToken: string, slot: number) {
  return apiFetch<{ message: string }>(`/llm-settings/${slot}`, accessToken, { method: 'DELETE' });
}

export function testLlmProviderSetting(accessToken: string, slot: number, input?: Partial<UpsertLlmProviderSettingInput>) {
  return apiFetch<{ ok: boolean; error?: string }>(`/llm-settings/${slot}/test`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
}

/** Call-count-based, not token/cost-based — see apps/api/src/llm-settings/llm-settings.service.ts. */
export interface LlmUsageSummary {
  dailyCallLimit: number | null;
  todayCallCount: number;
}

export function getLlmUsageSummary(accessToken: string) {
  return apiFetch<LlmUsageSummary>('/llm-settings/usage', accessToken);
}

export function updateLlmUsageLimit(accessToken: string, dailyCallLimit: number | null) {
  return apiFetch<LlmUsageSummary>('/llm-settings/usage', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ dailyCallLimit }),
  });
}

// ============================================================================
// AUDIT LOG — every CREATE/UPDATE/DELETE/LOGIN/etc. action, recorded server-side
// by @AuditLog() (apps/api/src/audit). Read-only from the UI; rows are immutable.
// ============================================================================

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD' | 'DOWNLOAD' | 'EXPORT' | 'IMPORT';

export interface AuditEventRecord {
  id: string;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  description: string | null;
  previousValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export interface AuditEventPage {
  data: AuditEventRecord[];
  total: number;
}

export interface AuditEventFilters {
  action?: AuditAction;
  resource?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function listAuditEvents(accessToken: string, filters: AuditEventFilters = {}) {
  const params: Record<string, string> = {};
  if (filters.action) params.action = filters.action;
  if (filters.resource) params.resource = filters.resource;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.limit) params.limit = String(filters.limit);
  if (filters.offset) params.offset = String(filters.offset);
  const query = new URLSearchParams(params);
  return apiFetch<AuditEventPage>(`/audit-events?${query}`, accessToken);
}

// ============================================================================
// CONTROL MAPPINGS — a tenant's own crosswalk between two of its loaded frameworks (e.g. NIST
// CSF to ISO 27001). See apps/api/src/control-mappings.
// ============================================================================

export type ControlMappingRelationship = 'EQUIVALENT' | 'PARTIAL' | 'RELATED';

export interface FrameworkSubcategorySummary {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  functionCode: string;
  functionName: string;
}

export interface FrameworkCrosswalkSide {
  id: string;
  name: string;
  subcategories: FrameworkSubcategorySummary[];
}

export interface ControlMappingRecord {
  id: string;
  sourceSubcategoryId: string;
  targetSubcategoryId: string;
  relationship: ControlMappingRelationship;
  notes: string | null;
}

export interface FrameworkCrosswalk {
  sourceFramework: FrameworkCrosswalkSide;
  targetFramework: FrameworkCrosswalkSide;
  mappings: ControlMappingRecord[];
}

export function getFrameworkCrosswalk(accessToken: string, sourceFrameworkId: string, targetFrameworkId: string) {
  const query = new URLSearchParams({ sourceFrameworkId, targetFrameworkId });
  return apiFetch<FrameworkCrosswalk>(`/control-mappings?${query}`, accessToken);
}

export interface CreateControlMappingInput {
  sourceSubcategoryId: string;
  targetSubcategoryId: string;
  relationship: ControlMappingRelationship;
  notes?: string;
}

export function createControlMapping(accessToken: string, input: CreateControlMappingInput) {
  return apiFetch<ControlMappingRecord>('/control-mappings', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteControlMapping(accessToken: string, id: string) {
  return apiFetch<{ message: string }>(`/control-mappings/${id}`, accessToken, { method: 'DELETE' });
}

// ============================================================================
// NOTIFICATIONS — a live, computed view of risks and remediation initiatives whose due date has
// passed or is coming up soon. See apps/api/src/notifications.
// ============================================================================

export type DueDateAlertType = 'RISK' | 'REMEDIATION_INITIATIVE';
export type DueDateAlertUrgency = 'OVERDUE' | 'DUE_SOON';

export interface DueDateAlert {
  id: string;
  type: DueDateAlertType;
  title: string;
  status: string;
  dueDate: string;
  urgency: DueDateAlertUrgency;
  daysUntilDue: number;
}

export function getDueDateAlerts(accessToken: string, organisationId: string) {
  const query = new URLSearchParams({ organisationId });
  return apiFetch<DueDateAlert[]>(`/notifications/due-dates?${query}`, accessToken);
}
