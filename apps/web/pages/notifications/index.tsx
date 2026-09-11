import { AlertTriangle, Bell, ShieldHalf, Wrench } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import { ApiError, getDueDateAlerts, type DueDateAlert } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface NotificationsPageProps {
  alerts: DueDateAlert[];
  errorMessage: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function dueDateLabel(alert: DueDateAlert): string {
  if (alert.urgency === 'OVERDUE') {
    const days = Math.abs(alert.daysUntilDue);
    return `${days} day${days === 1 ? '' : 's'} overdue`;
  }
  if (alert.daysUntilDue === 0) return 'Due today';
  return `Due in ${alert.daysUntilDue} day${alert.daysUntilDue === 1 ? '' : 's'}`;
}

/**
 * A live, computed "what needs attention" view over risk target dates and remediation initiative
 * deadlines — there's no email/push infrastructure in this app (docs/security-architecture.md), so
 * this is deliberately not a persisted, dismissible notification feed: it's always exactly what's
 * overdue or due within 14 days right now (apps/api/src/notifications), nothing to go stale or need
 * cleanup.
 */
export default function NotificationsPage({ alerts, errorMessage }: NotificationsPageProps) {
  const overdue = alerts.filter((a) => a.urgency === 'OVERDUE');
  const dueSoon = alerts.filter((a) => a.urgency === 'DUE_SOON');

  return (
    <>
      <Head>
        <title>Notifications - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-6 w-6 text-slate-400" />
            <h1 className="text-3xl font-bold text-white">Notifications</h1>
          </div>
          <p className="text-slate-400 text-sm mb-8">
            Open risks and active remediation initiatives with a due date that&apos;s overdue or coming up in the next 14 days.
          </p>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {alerts.length === 0 && !errorMessage && (
            <EmptyState icon={Bell} title="Nothing due." description="No open risk or remediation initiative has an approaching or overdue deadline." />
          )}

          {overdue.length > 0 && (
            <div className="mb-8">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">
                <AlertTriangle className="h-4 w-4" />
                Overdue ({overdue.length})
              </h2>
              <div className="space-y-3">
                {overdue.map((alert) => (
                  <AlertRow key={`${alert.type}-${alert.id}`} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {dueSoon.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">Due soon ({dueSoon.length})</h2>
              <div className="space-y-3">
                {dueSoon.map((alert) => (
                  <AlertRow key={`${alert.type}-${alert.id}`} alert={alert} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AlertRow({ alert }: { alert: DueDateAlert }) {
  const Icon = alert.type === 'RISK' ? ShieldHalf : Wrench;
  const urgencyClass =
    alert.urgency === 'OVERDUE' ? 'bg-red-950/40 text-red-300 border border-red-800' : 'bg-amber-950/30 text-amber-300 border border-amber-800';

  const content = (
    <>
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-white font-medium">{alert.title}</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {alert.type === 'RISK' ? 'Risk' : 'Remediation initiative'} · {alert.status} · Due {formatDate(alert.dueDate)}
          </p>
        </div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${urgencyClass}`}>{dueDateLabel(alert)}</span>
    </>
  );
  const className = 'flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700';

  // Risks have a detail page to link to; remediation initiatives don't have one anywhere in this
  // app yet (only a dashboard KPI count), so their rows render as plain, non-clickable info.
  if (alert.type === 'RISK') {
    return (
      <Link href={`/risks/${alert.id}`} className={`${className} hover:border-blue-500 transition-colors`}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}

export const getServerSideProps: GetServerSideProps<NotificationsPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const organisationId = session.organisationId;
  if (!organisationId) {
    return { props: { alerts: [], errorMessage: 'Your account has no organisation assigned.' } };
  }

  try {
    const alerts = await getDueDateAlerts(session.accessToken, organisationId);
    return { props: { alerts, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load notifications.';
    return { props: { alerts: [], errorMessage: message } };
  }
};
