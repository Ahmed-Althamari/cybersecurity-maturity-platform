import type { ExecutiveDashboard } from '@cmmp/shared';

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

export const api = {
  listAssessments: (token: string) => apiFetch<AssessmentSummary[]>(token, '/assessments'),

  getExecutiveDashboard: (token: string, assessmentId: string) =>
    apiFetch<ExecutiveDashboard>(token, `/assessments/${assessmentId}/dashboard`),

  listRisks: (token: string) => apiFetch<RiskDetail[]>(token, '/risks?sortBy=score'),

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
