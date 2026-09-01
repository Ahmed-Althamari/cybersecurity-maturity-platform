import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import type { ExecutiveDashboard } from '@cmmp/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { MaturityRadarChart } from '@/components/dashboard/maturity-radar-chart';
import { GapBarChart } from '@/components/dashboard/gap-bar-chart';
import { FunctionCards } from '@/components/dashboard/function-cards';
import { TopGapsTable } from '@/components/dashboard/top-gaps-table';
import { RiskSummaryPanel, RoadmapPanel } from '@/components/dashboard/risk-roadmap-panels';

export default function AssessmentDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const assessmentId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !assessmentId) {
      return;
    }
    api
      .getExecutiveDashboard(session.accessToken, assessmentId)
      .then(setDashboard)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
  }, [status, session, assessmentId]);

  if (status === 'loading' || (status === 'authenticated' && !dashboard && !error)) {
    return <CenteredMessage>Loading dashboard…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }
  if (error) {
    return <CenteredMessage>{error}</CenteredMessage>;
  }
  if (!dashboard) {
    return null;
  }

  const { maturityOverview, functionMaturity, topGaps, riskSummary, roadmapStatus } = dashboard;

  return (
    <>
      <Head>
        <title>Dashboard · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
                &larr; All assessments
              </Link>
              <h1 className="mt-1 text-3xl font-bold text-white">Executive Dashboard</h1>
            </div>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
              Sign Out
            </Button>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
            <KpiCard label="Overall Maturity" value={maturityOverview.overallMaturity.toFixed(1)} />
            <KpiCard label="Target Maturity" value={maturityOverview.targetMaturity.toFixed(1)} />
            <KpiCard
              label="Maturity Gap"
              value={maturityOverview.maturityGap.toFixed(1)}
              tone={maturityOverview.maturityGap > 1.5 ? 'danger' : maturityOverview.maturityGap > 0.5 ? 'warning' : 'success'}
            />
            <KpiCard label="Completion" value={`${maturityOverview.completionPercentage}%`} />
            <KpiCard
              label="Critical Gaps"
              value={String(maturityOverview.criticalGaps)}
              tone={maturityOverview.criticalGaps > 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="High Risk Findings"
              value={String(maturityOverview.highRiskFindings)}
              tone={maturityOverview.highRiskFindings > 0 ? 'warning' : 'success'}
            />
            <KpiCard label="Open Remediations" value={String(maturityOverview.openRemediationActions)} />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <MaturityRadarChart functions={functionMaturity} />
            <GapBarChart functions={functionMaturity} />
          </div>

          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-white">Function Breakdown</h2>
            <FunctionCards functions={functionMaturity} />
          </div>

          <div className="mb-8">
            <TopGapsTable gaps={topGaps} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RiskSummaryPanel summary={riskSummary} />
            <RoadmapPanel status={roadmapStatus} />
          </div>
        </div>
      </div>
    </>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <p className="text-slate-400">{children}</p>
    </div>
  );
}
