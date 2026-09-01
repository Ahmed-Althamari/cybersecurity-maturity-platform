import type { AuditEventSummary } from '@cmmp/shared';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

const ACTION_VARIANT: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'minimal' | 'default'> = {
  DELETE: 'critical',
  LOGIN: 'low',
  LOGOUT: 'default',
  CREATE: 'minimal',
  UPDATE: 'medium',
  IMPORT: 'high',
};

export default function AuditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [summary, setSummary] = useState<AuditEventSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    api
      .getAuditSummary(session.accessToken)
      .then(setSummary)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have permission to view the audit log."
              : err.message
            : 'Failed to load audit log',
        ),
      );
  }, [status, session]);

  if (status === 'loading' || (status === 'authenticated' && !summary && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }

  return (
    <>
      <Head>
        <title>Audit Log · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
                &larr; Assessments
              </Link>
              <h1 className="mt-1 text-3xl font-bold text-white">Audit Log</h1>
              <p className="text-slate-400">Last 30 days</p>
            </div>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
              Sign Out
            </Button>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          {summary && (
            <>
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-9">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-slate-400">Total Events</p>
                    <p className="text-2xl font-bold text-white">{summary.totalEvents}</p>
                  </CardContent>
                </Card>
                {Object.entries(summary.byAction)
                  .filter(([, count]) => count > 0)
                  .map(([action, count]) => (
                    <Card key={action}>
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-400">{action}</p>
                        <p className="text-2xl font-bold text-white">{count}</p>
                      </CardContent>
                    </Card>
                  ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Events</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 text-slate-400">
                          <th className="px-6 py-3 font-medium">When</th>
                          <th className="px-6 py-3 font-medium">Action</th>
                          <th className="px-6 py-3 font-medium">Resource</th>
                          <th className="px-6 py-3 font-medium">Resource ID</th>
                          <th className="px-6 py-3 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recentEvents.map((event) => (
                          <tr key={event.id} className="border-b border-slate-800 text-slate-300">
                            <td className="px-6 py-3 text-slate-400">
                              {new Date(event.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-3">
                              <Badge variant={ACTION_VARIANT[event.action] ?? 'default'}>{event.action}</Badge>
                            </td>
                            <td className="px-6 py-3">{event.resource}</td>
                            <td className="px-6 py-3 font-mono text-xs text-slate-500">
                              {event.resourceId ?? '—'}
                            </td>
                            <td className="px-6 py-3 text-slate-400">{event.description ?? '—'}</td>
                          </tr>
                        ))}
                        {summary.recentEvents.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-6 text-center text-slate-500">
                              No events recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
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
