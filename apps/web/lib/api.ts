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

export function getDashboardRoadmap(accessToken: string, organisationId: string) {
  const query = new URLSearchParams({ organisationId });
  return apiFetch<RoadmapStatus>(`/dashboard/roadmap?${query}`, accessToken);
}
