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

export const api = {
  listAssessments: (token: string) => apiFetch<AssessmentSummary[]>(token, '/assessments'),

  getExecutiveDashboard: (token: string, assessmentId: string) =>
    apiFetch<ExecutiveDashboard>(token, `/assessments/${assessmentId}/dashboard`),
};
