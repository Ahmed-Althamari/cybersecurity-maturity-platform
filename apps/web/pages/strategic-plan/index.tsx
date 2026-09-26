import { AlertTriangle, CheckCircle2, Clock, LayoutList, LinkIcon, ListTodo, PauseCircle, Plus, ShieldAlert, Target } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { KpiCard } from '../../components/dashboard/KpiCard';
import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import { ObjectiveProgressChart } from '../../components/strategic-plan/ObjectiveProgressChart';
import { StrategicStatusBadge } from '../../components/strategic-plan/StrategicStatusBadge';
import { StrategicTimeline } from '../../components/strategic-plan/StrategicTimeline';
import { StrategicTrendChart } from '../../components/strategic-plan/StrategicTrendChart';
import {
  ApiError,
  getStrategicPlanDashboard,
  listStrategicInitiatives,
  type StrategicInitiativeRecord,
  type StrategicPlanDashboard,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { STATUS_COLORS } from '../../lib/maturity-scale';
import { hasAnyRole, STRATEGIC_WRITE_ROLES } from '../../lib/roles';

interface StrategicPlanPageProps {
  organisationId: string | null;
  dashboard: StrategicPlanDashboard | null;
  initiatives: StrategicInitiativeRecord[];
  page: number;
  totalPages: number;
  canManage: boolean;
  filters: {
    view: 'list' | 'timeline';
    status: string;
    owner: string;
    strategicObjective: string;
    priority: string;
    riskLevel: string;
    linked: string;
    year: string;
    month: string;
    sort: string;
  };
  errorMessage: string | null;
}

const STATUS_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const RISK_LEVEL_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'];
const PRIORITY_OPTIONS = ['1', '2', '3', '4', '5'];

function queryString(params: Record<string, string>): string {
  const search = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const str = search.toString();
  return str ? `?${str}` : '';
}

export default function StrategicPlanPage({
  organisationId,
  dashboard,
  initiatives,
  page,
  totalPages,
  canManage,
  filters,
  errorMessage,
}: StrategicPlanPageProps) {
  const router = useRouter();

  function updateFilter(key: string, value: string) {
    const next = { ...filters, [key]: value };
    router.push(`/strategic-plan${queryString(next)}`);
  }

  return (
    <>
      <Head>
        <title>Strategic Plan - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
            <div>
              <h1 className="flex items-center gap-2.5 text-3xl font-bold text-white">
                <Target className="h-7 w-7 text-blue-400" aria-hidden="true" />
                Strategic Plan
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Organisation-wide strategic initiatives, tracked month by month and linked to the Risk Register.
              </p>
            </div>
            {canManage && organisationId && (
              <Link
                href="/strategic-plan/new"
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Initiative
              </Link>
            )}
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {dashboard && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                <KpiCard
                  icon={Target}
                  title="Overall Progress"
                  value={`${dashboard.overallProgress}%`}
                  meterPercent={dashboard.overallProgress}
                  accentColor={STATUS_COLORS.good}
                />
                <KpiCard icon={LayoutList} title="Total Initiatives" value={String(dashboard.totalInitiatives)} />
                <KpiCard icon={CheckCircle2} title="Completed" value={String(dashboard.completed)} accentColor={STATUS_COLORS.good} />
                <KpiCard icon={Clock} title="In Progress" value={String(dashboard.inProgress)} />
                <KpiCard icon={ListTodo} title="Not Started" value={String(dashboard.notStarted)} />
                <KpiCard icon={PauseCircle} title="On Hold" value={String(dashboard.onHold)} accentColor={STATUS_COLORS.warning} />
                <KpiCard
                  icon={AlertTriangle}
                  title="Overdue"
                  value={String(dashboard.overdueCount)}
                  accentColor={dashboard.overdueCount > 0 ? STATUS_COLORS.critical : undefined}
                />
                <KpiCard
                  icon={ShieldAlert}
                  title="At Risk"
                  value={String(dashboard.atRiskCount)}
                  accentColor={dashboard.atRiskCount > 0 ? STATUS_COLORS.serious : undefined}
                />
                <KpiCard icon={LinkIcon} title="Linked to Risks" value={String(dashboard.linkedToRiskCount)} />
                <KpiCard
                  icon={ShieldAlert}
                  title="High/Critical Risks with Initiatives"
                  value={String(dashboard.highRiskWithInitiatives)}
                  accentColor={dashboard.highRiskWithInitiatives > 0 ? STATUS_COLORS.serious : undefined}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {dashboard.monthlyTrend.length > 0 ? (
                  <StrategicTrendChart series={dashboard.monthlyTrend} />
                ) : (
                  <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-white font-semibold mb-2">Monthly Progress: Planned vs Actual</h3>
                    <p className="text-sm text-slate-500">No monthly progress recorded yet — add an update from an initiative&apos;s detail page.</p>
                  </div>
                )}
                {dashboard.progressByObjective.length > 0 ? (
                  <ObjectiveProgressChart objectives={dashboard.progressByObjective} />
                ) : (
                  <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-white font-semibold mb-2">Progress by Strategic Objective</h3>
                    <p className="text-sm text-slate-500">No initiatives yet.</p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => updateFilter('view', 'list')}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                filters.view !== 'timeline' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              List
            </button>
            <button
              onClick={() => updateFilter('view', 'timeline')}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                filters.view === 'timeline' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Timeline
            </button>
          </div>

          <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700 mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label htmlFor="filter-status" className="block text-xs text-slate-400 mb-1">
                Status
              </label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-priority" className="block text-xs text-slate-400 mb-1">
                Priority
              </label>
              <select
                id="filter-priority"
                value={filters.priority}
                onChange={(e) => updateFilter('priority', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-risk-level" className="block text-xs text-slate-400 mb-1">
                Linked Risk Level
              </label>
              <select
                id="filter-risk-level"
                value={filters.riskLevel}
                onChange={(e) => updateFilter('riskLevel', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                {RISK_LEVEL_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-linked" className="block text-xs text-slate-400 mb-1">
                Risk Link
              </label>
              <select
                id="filter-linked"
                value={filters.linked}
                onChange={(e) => updateFilter('linked', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                <option value="true">Linked</option>
                <option value="false">Unlinked</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-owner" className="block text-xs text-slate-400 mb-1">
                Owner
              </label>
              <input
                id="filter-owner"
                defaultValue={filters.owner}
                onBlur={(e) => updateFilter('owner', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="filter-objective" className="block text-xs text-slate-400 mb-1">
                Strategic Objective
              </label>
              <input
                id="filter-objective"
                defaultValue={filters.strategicObjective}
                onBlur={(e) => updateFilter('strategicObjective', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="filter-year" className="block text-xs text-slate-400 mb-1">
                Year
              </label>
              <input
                id="filter-year"
                type="number"
                defaultValue={filters.year}
                onBlur={(e) => updateFilter('year', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="filter-month" className="block text-xs text-slate-400 mb-1">
                Month
              </label>
              <select
                id="filter-month"
                value={filters.month}
                onChange={(e) => updateFilter('month', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="">All</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-sort" className="block text-xs text-slate-400 mb-1">
                Sort
              </label>
              <select
                id="filter-sort"
                value={filters.sort}
                onChange={(e) => updateFilter('sort', e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-sm text-white"
              >
                <option value="recent">Recent</option>
                <option value="priority">Priority</option>
                <option value="targetDate">Target Date</option>
              </select>
            </div>
          </div>

          {initiatives.length === 0 && !errorMessage && (
            <EmptyState icon={Target} title="No initiatives match this filter." />
          )}

          {filters.view === 'timeline' ? (
            <StrategicTimeline initiatives={initiatives} />
          ) : (
            <div className="space-y-3">
              {initiatives.map((initiative) => (
                <Link
                  key={initiative.id}
                  href={`/strategic-plan/${initiative.id}`}
                  className="flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      <span className="text-slate-500">{initiative.code}</span> — {initiative.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {initiative.strategicObjective ?? 'No objective set'} · Owner: {initiative.owner ?? '—'}
                      {initiative.risks.length > 0 && ` · ${initiative.risks.length} linked risk${initiative.risks.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 hidden sm:block">
                      <div className="rounded-full bg-slate-700 overflow-hidden h-1.5">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${initiative.percentComplete}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 text-right">{initiative.percentComplete}%</p>
                    </div>
                    <StrategicStatusBadge status={initiative.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {totalPages > 1 && filters.view !== 'timeline' && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                href={`/strategic-plan${queryString({ ...filters, page: String(page - 1) })}`}
                aria-disabled={page <= 1}
                className={`rounded-md border border-slate-600 px-3 py-1.5 text-sm ${
                  page <= 1 ? 'pointer-events-none opacity-40 text-slate-500' : 'text-slate-300 hover:border-slate-500'
                }`}
              >
                Previous
              </Link>
              <span className="text-sm text-slate-400">
                Page {page} of {totalPages}
              </span>
              <Link
                href={`/strategic-plan${queryString({ ...filters, page: String(page + 1) })}`}
                aria-disabled={page >= totalPages}
                className={`rounded-md border border-slate-600 px-3 py-1.5 text-sm ${
                  page >= totalPages ? 'pointer-events-none opacity-40 text-slate-500' : 'text-slate-300 hover:border-slate-500'
                }`}
              >
                Next
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<StrategicPlanPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const organisationId = session.organisationId ?? null;
  const canManage = hasAnyRole(session.roles ?? [], STRATEGIC_WRITE_ROLES);
  const q = context.query;
  const filters = {
    view: q.view === 'timeline' ? ('timeline' as const) : ('list' as const),
    status: typeof q.status === 'string' ? q.status : '',
    owner: typeof q.owner === 'string' ? q.owner : '',
    strategicObjective: typeof q.strategicObjective === 'string' ? q.strategicObjective : '',
    priority: typeof q.priority === 'string' ? q.priority : '',
    riskLevel: typeof q.riskLevel === 'string' ? q.riskLevel : '',
    linked: typeof q.linked === 'string' ? q.linked : '',
    year: typeof q.year === 'string' ? q.year : '',
    month: typeof q.month === 'string' ? q.month : '',
    sort: typeof q.sort === 'string' ? q.sort : 'recent',
  };
  const page = typeof q.page === 'string' && Number(q.page) > 0 ? Number(q.page) : 1;

  if (!organisationId) {
    return {
      props: {
        organisationId: null,
        dashboard: null,
        initiatives: [],
        page: 1,
        totalPages: 1,
        canManage,
        filters,
        errorMessage: 'Your account has no organisation assigned.',
      },
    };
  }

  let dashboard: StrategicPlanDashboard | null = null;
  try {
    dashboard = await getStrategicPlanDashboard(session.accessToken, organisationId);
  } catch {
    dashboard = null;
  }

  try {
    const pageSize = filters.view === 'timeline' ? 200 : 20;
    const result = await listStrategicInitiatives(session.accessToken, organisationId, {
      status: filters.status || undefined,
      owner: filters.owner || undefined,
      strategicObjective: filters.strategicObjective || undefined,
      priority: filters.priority ? Number(filters.priority) : undefined,
      riskLevel: filters.riskLevel || undefined,
      linked: filters.linked === 'true' || filters.linked === 'false' ? filters.linked : undefined,
      year: filters.year ? Number(filters.year) : undefined,
      month: filters.month ? Number(filters.month) : undefined,
      sort: (filters.sort as 'priority' | 'recent' | 'targetDate') || 'recent',
      page,
      pageSize,
    });
    return {
      props: {
        organisationId,
        dashboard,
        initiatives: result.data,
        page: result.page,
        totalPages: result.totalPages,
        canManage,
        filters,
        errorMessage: null,
      },
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load the strategic plan.';
    return {
      props: { organisationId, dashboard, initiatives: [], page: 1, totalPages: 1, canManage, filters, errorMessage: message },
    };
  }
};
