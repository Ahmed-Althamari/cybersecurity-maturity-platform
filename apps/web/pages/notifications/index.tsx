import { AlertTriangle, Bell, Loader2, Mail, Sparkles, ShieldHalf, Wrench } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import {
  ApiError,
  generateAssistantDigest,
  getDueDateAlerts,
  listAssistantDigests,
  type AssistantDigestRecord,
  type DueDateAlert,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { DIGEST_MANAGE_ROLES, hasAnyRole } from '../../lib/roles';

interface NotificationsPageProps {
  accessToken: string;
  organisationId: string | null;
  canGenerateDigest: boolean;
  alerts: DueDateAlert[];
  initialDigests: AssistantDigestRecord[];
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

function digestBadge(digest: AssistantDigestRecord) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {digest.aiGenerated ? (
        <span className="flex items-center gap-1 text-indigo-400">
          <Sparkles className="h-3 w-3" /> AI-summarized
        </span>
      ) : (
        <span>Templated summary</span>
      )}
      <span>·</span>
      <span className="flex items-center gap-1">
        <Mail className="h-3 w-3" />
        {digest.emailSent ? `Emailed ${digest.recipientCount} recipient(s)` : 'Not emailed'}
      </span>
      <span>·</span>
      <span>{formatDate(digest.generatedAt)}</span>
    </div>
  );
}

/**
 * A live, computed "what needs attention" view over risk target dates and remediation initiative
 * deadlines — always exactly what's overdue or due within 14 days right now
 * (apps/api/src/notifications), nothing to go stale or need cleanup. The "AI Digest" section below
 * is its scheduled counterpart: a persisted, once-daily (or on-demand) summary of the same data,
 * optionally AI-summarized and best-effort emailed — see apps/api/src/assistant-digest.
 */
export default function NotificationsPage({
  accessToken,
  organisationId,
  canGenerateDigest,
  alerts,
  initialDigests,
  errorMessage,
}: NotificationsPageProps) {
  const overdue = alerts.filter((a) => a.urgency === 'OVERDUE');
  const dueSoon = alerts.filter((a) => a.urgency === 'DUE_SOON');

  const [digests, setDigests] = useState(initialDigests);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const latestDigest = digests[0];

  async function handleGenerateDigest() {
    if (!organisationId) return;
    setDigestBusy(true);
    setDigestError(null);
    try {
      const digest = await generateAssistantDigest(accessToken, organisationId);
      setDigests((prev) => [digest, ...prev]);
    } catch (err) {
      setDigestError(err instanceof ApiError ? err.message : 'Failed to generate digest.');
    } finally {
      setDigestBusy(false);
    }
  }

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

          <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="flex items-center gap-2 text-white font-semibold">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                AI Digest
              </h2>
              {canGenerateDigest && (
                <button
                  onClick={handleGenerateDigest}
                  disabled={digestBusy || !organisationId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors flex items-center gap-1.5"
                >
                  {digestBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Generate Digest Now
                </button>
              )}
            </div>

            {digestError && <p className="text-sm text-red-400 mb-3">{digestError}</p>}

            {latestDigest ? (
              <div>
                <p className="text-sm text-slate-300 mb-2">{latestDigest.summary}</p>
                {digestBadge(latestDigest)}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No digest has run yet for this organisation — one runs automatically once a day, or generate one now.
              </p>
            )}

            {digests.length > 1 && (
              <details className="mt-4">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
                  {digests.length - 1} earlier digest{digests.length - 1 === 1 ? '' : 's'}
                </summary>
                <div className="mt-3 space-y-3">
                  {digests.slice(1).map((digest) => (
                    <div key={digest.id} className="border-t border-slate-700 pt-3">
                      <p className="text-sm text-slate-400 mb-1.5">{digest.summary}</p>
                      {digestBadge(digest)}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

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

  const canGenerateDigest = hasAnyRole(session.roles ?? [], DIGEST_MANAGE_ROLES);
  const organisationId = session.organisationId ?? null;
  if (!organisationId) {
    return {
      props: {
        accessToken: session.accessToken,
        organisationId: null,
        canGenerateDigest,
        alerts: [],
        initialDigests: [],
        errorMessage: 'Your account has no organisation assigned.',
      },
    };
  }

  // Best-effort, same pattern as the dashboard's pinned-insights load: a digest-history fetch
  // failure shouldn't take down the whole page, which is mostly about the live due-date view.
  const initialDigests = await listAssistantDigests(session.accessToken, organisationId).catch(() => []);

  try {
    const alerts = await getDueDateAlerts(session.accessToken, organisationId);
    return { props: { accessToken: session.accessToken, organisationId, canGenerateDigest, alerts, initialDigests, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load notifications.';
    return { props: { accessToken: session.accessToken, organisationId, canGenerateDigest, alerts: [], initialDigests, errorMessage: message } };
  }
};
