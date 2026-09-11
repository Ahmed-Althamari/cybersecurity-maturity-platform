import { BarChart3 } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import React from 'react';

import { FunctionDetailCards } from '../components/dashboard/FunctionDetailCards';
import { FunctionGapBarChart } from '../components/dashboard/FunctionGapBarChart';
import { KpiCard } from '../components/dashboard/KpiCard';
import { MaturityDistributionChart } from '../components/dashboard/MaturityDistributionChart';
import { MaturityHeatmap } from '../components/dashboard/MaturityHeatmap';
import { MaturityRadarChart } from '../components/dashboard/MaturityRadarChart';
import { PinnedInsightsSection } from '../components/dashboard/PinnedInsightsSection';
import { TopGapsTable } from '../components/dashboard/TopGapsTable';
import { AppHeader } from '../components/layout/AppHeader';
import { EmptyState } from '../components/layout/EmptyState';
import {
  ApiError,
  getAssessmentResults,
  getDashboardFunctions,
  getDashboardGaps,
  getDashboardMaturity,
  listPinnedInsights,
  type AssessmentResults,
  type FunctionMaturity,
  type GapAnalysisEntry,
  type MaturityOverview,
  type PinnedInsightRecord,
} from '../lib/api';
import { getAuthSession } from '../lib/auth';
import { hasAnyRole, PINNED_INSIGHT_WRITE_ROLES } from '../lib/roles';

interface DashboardPageProps {
  accessToken: string;
  userEmail: string;
  organisationId: string;
  canManagePinnedInsights: boolean;
  overview: MaturityOverview | null;
  functions: FunctionMaturity[];
  gaps: GapAnalysisEntry[];
  results: AssessmentResults | null;
  pinnedInsights: PinnedInsightRecord[];
  errorMessage: string | null;
}

export default function DashboardPage({
  accessToken,
  userEmail,
  canManagePinnedInsights,
  overview,
  functions,
  gaps,
  results,
  pinnedInsights,
  errorMessage,
}: DashboardPageProps) {
  return (
    <>
      <Head>
        <title>Dashboard - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader userEmail={userEmail} />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-white mb-8">Cybersecurity Maturity Dashboard</h1>

          {errorMessage && (
            <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>
          )}

          {overview?.combined && (
            <p className="text-slate-400 text-xs mb-2">
              Combined across {overview.assessmentIds.length} active assessments, weighted by each one&apos;s completeness.
            </p>
          )}

          {overview && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KpiCard title="Overall Maturity" value={overview.overallMaturity.toFixed(1)} />
              <KpiCard title="Target Maturity" value={overview.targetMaturity.toFixed(1)} />
              <KpiCard title="Maturity Gap" value={overview.maturityGap.toFixed(1)} accentColor={overview.maturityGap > 1 ? '#ec835a' : '#0ca30c'} />
              <KpiCard title="Completion" value={`${overview.completionPercentage}%`} />
            </div>
          )}

          {overview && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <KpiCard title="Critical Gaps" value={String(overview.criticalGaps)} accentColor="#e66767" />
              <KpiCard title="High-Risk Findings" value={String(overview.highRiskFindings)} accentColor="#ec835a" />
              <KpiCard title="Open Remediation Actions" value={String(overview.openRemediationActions)} accentColor="#3987e5" />
            </div>
          )}

          {functions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <MaturityRadarChart functions={functions} />
              <FunctionGapBarChart functions={functions} />
            </div>
          )}

          {results && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <MaturityHeatmap functions={results.functions} />
              <MaturityDistributionChart functions={results.functions} />
            </div>
          )}

          {functions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-white font-semibold text-lg mb-4">Function Detail</h2>
              <FunctionDetailCards functions={functions} />
            </div>
          )}

          {gaps.length > 0 && (
            <div className="mb-8">
              <TopGapsTable gaps={gaps} />
            </div>
          )}

          <PinnedInsightsSection accessToken={accessToken} canDelete={canManagePinnedInsights} insights={pinnedInsights} />

          {!overview && !errorMessage && (
            <EmptyState
              icon={BarChart3}
              title="No assessment data yet"
              description="Create and submit an assessment to see maturity scores, gaps, and risk data here."
            />
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<DashboardPageProps> = async (context) => {
  const session = await getAuthSession(context);

  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const organisationId = session.organisationId;
  const canManagePinnedInsights = hasAnyRole(session.roles ?? [], PINNED_INSIGHT_WRITE_ROLES);
  if (!organisationId) {
    return {
      props: {
        accessToken: session.accessToken,
        userEmail: session.user?.email ?? '',
        organisationId: '',
        canManagePinnedInsights,
        overview: null,
        functions: [],
        gaps: [],
        results: null,
        pinnedInsights: [],
        errorMessage: 'Your account has no organisation assigned, so no dashboard data can be shown.',
      },
    };
  }

  // Best-effort, like the slot picker on the Data Analysis page — a failed lookup here just
  // means the section doesn't render, not a broken dashboard.
  let pinnedInsights: PinnedInsightRecord[] = [];
  try {
    pinnedInsights = await listPinnedInsights(session.accessToken, organisationId);
  } catch {
    pinnedInsights = [];
  }

  try {
    const [overview, functions, gaps] = await Promise.all([
      getDashboardMaturity(session.accessToken, organisationId),
      getDashboardFunctions(session.accessToken, organisationId),
      getDashboardGaps(session.accessToken, organisationId, undefined, 10),
    ]);
    const results = await getAssessmentResults(session.accessToken, overview.assessmentId);

    return {
      props: {
        accessToken: session.accessToken,
        userEmail: session.user?.email ?? '',
        organisationId,
        canManagePinnedInsights,
        overview,
        functions,
        gaps,
        results,
        pinnedInsights,
        errorMessage: null,
      },
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load dashboard data.';
    return {
      props: {
        accessToken: session.accessToken,
        userEmail: session.user?.email ?? '',
        organisationId,
        canManagePinnedInsights,
        overview: null,
        functions: [],
        gaps: [],
        results: null,
        pinnedInsights,
        errorMessage: message,
      },
    };
  }
};
