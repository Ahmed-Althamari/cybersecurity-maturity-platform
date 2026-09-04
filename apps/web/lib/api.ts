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

// ============================================================================
// CALLS
// ============================================================================

export function listFrameworks(accessToken: string) {
  return apiFetch<FrameworkSummary[]>('/frameworks', accessToken);
}

export function listAssessments(accessToken: string, organisationId?: string) {
  const query = organisationId ? `?organisationId=${encodeURIComponent(organisationId)}` : '';
  return apiFetch<AssessmentSummary[]>(`/assessments${query}`, accessToken);
}

export function getAssessmentResults(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentResults>(`/assessments/${assessmentId}/results`, accessToken);
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
