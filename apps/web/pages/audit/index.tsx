import { ScrollText } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import { ApiError, listAuditEvents, type AuditAction, type AuditEventRecord } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { AUDIT_READ_ROLES, hasAnyRole } from '../../lib/roles';

const PAGE_SIZE = 50;
const ACTIONS: AuditAction[] = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'DOWNLOAD', 'EXPORT', 'IMPORT'];

const ACTION_COLORS: Record<AuditAction, string> = {
  LOGIN: 'bg-slate-700 text-slate-300',
  LOGOUT: 'bg-slate-700 text-slate-300',
  CREATE: 'bg-emerald-950/40 text-emerald-300 border border-emerald-800',
  UPDATE: 'bg-indigo-950/40 text-indigo-300 border border-indigo-800',
  DELETE: 'bg-red-950/40 text-red-300 border border-red-800',
  UPLOAD: 'bg-slate-700 text-slate-300',
  DOWNLOAD: 'bg-slate-700 text-slate-300',
  EXPORT: 'bg-slate-700 text-slate-300',
  IMPORT: 'bg-slate-700 text-slate-300',
};

interface AuditPageProps {
  canView: boolean;
  events: AuditEventRecord[];
  total: number;
  page: number;
  filters: { action: string; resource: string; from: string; to: string };
  errorMessage: string | null;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Read-only view over AuditEvent rows the backend already records for every CREATE/UPDATE/DELETE
 * (and login/logout/import/export) action via @AuditLog() (see apps/api/src/audit). No new
 * write path — this is purely a UI for data that already existed but had nowhere to be seen.
 */
export default function AuditPage({ canView, events, total, page, filters, errorMessage }: AuditPageProps) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageQuery(nextPage: number) {
    return { ...filters, page: String(nextPage) };
  }

  return (
    <>
      <Head>
        <title>Audit Log - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-1">
            <ScrollText className="h-6 w-6 text-slate-400" />
            <h1 className="text-3xl font-bold text-white">Audit Log</h1>
          </div>
          <p className="text-slate-400 text-sm mb-8">Every recorded action for your organisation — immutable, newest first.</p>

          {!canView && (
            <EmptyState
              icon={ScrollText}
              title="You don't have access to the audit log."
              description="This view is restricted to platform/organisation admins, CISOs, auditors, and GRC managers."
            />
          )}

          {canView && (
            <>
              <form method="GET" className="flex flex-wrap items-end gap-3 mb-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div>
                  <label htmlFor="action" className="block text-xs font-medium text-slate-400 mb-1">
                    Action
                  </label>
                  <select
                    id="action"
                    name="action"
                    defaultValue={filters.action}
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                  >
                    <option value="">All</option>
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="resource" className="block text-xs font-medium text-slate-400 mb-1">
                    Resource
                  </label>
                  <input
                    id="resource"
                    name="resource"
                    type="text"
                    defaultValue={filters.resource}
                    placeholder="e.g. Risk, Assessment"
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label htmlFor="from" className="block text-xs font-medium text-slate-400 mb-1">
                    From
                  </label>
                  <input
                    id="from"
                    name="from"
                    type="date"
                    defaultValue={filters.from}
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="to" className="block text-xs font-medium text-slate-400 mb-1">
                    To
                  </label>
                  <input
                    id="to"
                    name="to"
                    type="date"
                    defaultValue={filters.to}
                    className="rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-md transition-colors"
                >
                  Filter
                </button>
                {(filters.action || filters.resource || filters.from || filters.to) && (
                  <Link href="/audit" className="text-slate-400 hover:text-white text-sm py-1.5 px-2">
                    Clear
                  </Link>
                )}
              </form>

              {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

              {events.length === 0 && !errorMessage && <EmptyState icon={ScrollText} title="No audit events match this filter." />}

              {events.length > 0 && (
                <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                        <th className="py-3 px-4 font-medium">Time</th>
                        <th className="py-3 px-4 font-medium">User</th>
                        <th className="py-3 px-4 font-medium">Action</th>
                        <th className="py-3 px-4 font-medium">Resource</th>
                        <th className="py-3 px-4 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id} className="border-b border-slate-800/60 last:border-0">
                          <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{formatTimestamp(event.createdAt)}</td>
                          <td className="py-3 px-4 text-slate-300">{event.user ? event.user.name : '—'}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-1 rounded-full ${ACTION_COLORS[event.action]}`}>{event.action}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {event.resource}
                            {event.resourceId && <span className="text-slate-500 text-xs"> · {event.resourceId.slice(0, 8)}</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-400">{event.description ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
                  <span>
                    Page {page} of {totalPages} ({total} events)
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={{ query: pageQuery(page - 1) }}
                      aria-disabled={page <= 1}
                      className={page <= 1 ? 'pointer-events-none opacity-40' : 'text-white hover:text-blue-400'}
                    >
                      Previous
                    </Link>
                    <Link
                      href={{ query: pageQuery(page + 1) }}
                      aria-disabled={page >= totalPages}
                      className={page >= totalPages ? 'pointer-events-none opacity-40' : 'text-white hover:text-blue-400'}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AuditPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const canView = hasAnyRole(session.roles ?? [], AUDIT_READ_ROLES);
  const action = typeof context.query.action === 'string' ? context.query.action : '';
  const resource = typeof context.query.resource === 'string' ? context.query.resource : '';
  const from = typeof context.query.from === 'string' ? context.query.from : '';
  const to = typeof context.query.to === 'string' ? context.query.to : '';
  const page = Math.max(1, Number(context.query.page) || 1);
  const filters = { action, resource, from, to };

  if (!canView) {
    return { props: { canView, events: [], total: 0, page, filters, errorMessage: null } };
  }

  try {
    const result = await listAuditEvents(session.accessToken, {
      action: (action || undefined) as AuditAction | undefined,
      resource: resource || undefined,
      // Date-only inputs need a real ISO timestamp; "to" extends through end-of-day so it's inclusive.
      from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return { props: { canView, events: result.data, total: result.total, page, filters, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load the audit log.';
    return { props: { canView, events: [], total: 0, page, filters, errorMessage: message } };
  }
};
