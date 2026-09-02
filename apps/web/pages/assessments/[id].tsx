import type { ExecutiveDashboard, MaturityHeatmap as MaturityHeatmapData } from '@cmmp/shared';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { FunctionCards } from '@/components/dashboard/function-cards';
import { GapBarChart } from '@/components/dashboard/gap-bar-chart';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { MaturityDistributionChart } from '@/components/dashboard/maturity-distribution-chart';
import { MaturityHeatmap } from '@/components/dashboard/maturity-heatmap';
import { MaturityRadarChart } from '@/components/dashboard/maturity-radar-chart';
import { RiskSummaryPanel, RoadmapPanel } from '@/components/dashboard/risk-roadmap-panels';
import { TopGapsTable } from '@/components/dashboard/top-gaps-table';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';

export default function AssessmentDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const assessmentId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null);
  const [heatmap, setHeatmap] = useState<MaturityHeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [assessmentStatus, setAssessmentStatus] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  async function handleWorkflowAction(action: 'approve' | 'reopen') {
    if (!assessmentId) return;
    setWorkflowBusy(true);
    setWorkflowMessage(null);
    try {
      const updated =
        action === 'approve'
          ? await api.approveAssessment(session!.accessToken, assessmentId)
          : await api.reopenAssessment(session!.accessToken, assessmentId);
      setAssessmentStatus(updated.status);
      setWorkflowMessage(action === 'approve' ? 'Assessment approved.' : 'Assessment reopened for edits.');
    } catch (err) {
      setWorkflowMessage(err instanceof ApiError ? err.message : `Failed to ${action} assessment`);
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function handleGenerateRoadmap() {
    if (!assessmentId) return;
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const created = await api.generateRoadmap(session!.accessToken, assessmentId);
      setGenerateMessage(
        created.length === 0
          ? 'No new initiatives needed -- no gaps above the threshold.'
          : `Created ${created.length} initiative${created.length === 1 ? '' : 's'}. View them on the Roadmap.`,
      );
    } catch (err) {
      setGenerateMessage(err instanceof ApiError ? err.message : 'Failed to generate roadmap');
    } finally {
      setGenerating(false);
    }
  }

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
    api
      .getAssessment(session.accessToken, assessmentId)
      .then((a) => setAssessmentStatus(a.status))
      .catch(() => undefined);
    api
      .getMaturityHeatmap(session.accessToken, assessmentId)
      .then(setHeatmap)
      .catch(() => undefined);
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

  // See pages/assessments/index.tsx's own comment -- Roadmap/Risk Register
  // now 403 for an EXECUTIVE_VIEWER-only session (ExecutiveViewerScopeGuard).
  const isExecutiveViewerOnly =
    session.user.roles.length === 1 && session.user.roles[0] === 'EXECUTIVE_VIEWER';

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
            <div className="flex flex-wrap items-center gap-2">
              {assessmentId && (assessmentStatus === 'DRAFT' || assessmentStatus === 'IN_PROGRESS') && (
                <Link href={`/assessments/${assessmentId}/take`}>
                  <Button>{assessmentStatus === 'DRAFT' ? 'Start Assessment' : 'Continue Assessment'}</Button>
                </Link>
              )}
              {assessmentId && assessmentStatus === 'SUBMITTED' && (
                <>
                  <Link href={`/assessments/${assessmentId}/take`}>
                    <Button variant="outline">View Responses</Button>
                  </Link>
                  <Button onClick={() => handleWorkflowAction('approve')} disabled={workflowBusy}>
                    {workflowBusy ? 'Working…' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleWorkflowAction('reopen')}
                    disabled={workflowBusy}
                  >
                    Reopen
                  </Button>
                </>
              )}
              {assessmentId && assessmentStatus === 'APPROVED' && (
                <Link href={`/assessments/${assessmentId}/take`}>
                  <Button variant="outline">View Responses</Button>
                </Link>
              )}
              {!isExecutiveViewerOnly && (
                <>
                  <Link href="/roadmap">
                    <Button variant="outline">Roadmap</Button>
                  </Link>
                  <Link href="/risks">
                    <Button variant="outline">Risk Register</Button>
                  </Link>
                </>
              )}
              <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
                Sign Out
              </Button>
            </div>
          </div>
          {workflowMessage && <p className="mb-4 text-sm text-slate-400">{workflowMessage}</p>}

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

          {heatmap && (
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <MaturityHeatmap heatmap={heatmap} />
              </div>
              <MaturityDistributionChart distribution={heatmap.distribution} />
            </div>
          )}

          <div className="mb-8">
            <TopGapsTable gaps={topGaps} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RiskSummaryPanel summary={riskSummary} />
            <div className="space-y-3">
              <RoadmapPanel status={roadmapStatus} />
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleGenerateRoadmap} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate Roadmap from Gaps'}
                </Button>
                {generateMessage && <p className="text-sm text-slate-400">{generateMessage}</p>}
              </div>
            </div>
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
