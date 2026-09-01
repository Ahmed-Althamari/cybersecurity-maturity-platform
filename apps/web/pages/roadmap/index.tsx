import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type InitiativeDetail, type InitiativeTimeline } from '@/lib/api';

const PRIORITY_VARIANT: Record<number, 'critical' | 'high' | 'medium' | 'low' | 'minimal'> = {
  1: 'critical',
  2: 'high',
  3: 'medium',
  4: 'low',
  5: 'minimal',
};

const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'];

const BUCKETS: { key: keyof InitiativeTimeline; label: string }[] = [
  { key: 'next3Months', label: 'Next 3 Months' },
  { key: 'next6Months', label: 'Next 6 Months' },
  { key: 'next12Months', label: 'Next 12 Months' },
  { key: 'beyondOrUnscheduled', label: 'Beyond / Unscheduled' },
];

export default function RoadmapPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [timeline, setTimeline] = useState<InitiativeTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  function load() {
    if (status !== 'authenticated') return;
    api
      .getRoadmapTimeline(session.accessToken)
      .then(setTimeline)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load roadmap'));
  }

  useEffect(load, [status, session]);

  async function handleStatusChange(initiative: InitiativeDetail, newStatus: string) {
    try {
      await api.updateInitiativeStatus(session!.accessToken, initiative.id, newStatus);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  }

  if (status === 'loading' || (status === 'authenticated' && !timeline && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }

  return (
    <>
      <Head>
        <title>Remediation Roadmap · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
                &larr; Assessments
              </Link>
              <h1 className="mt-1 text-3xl font-bold text-white">Remediation Roadmap</h1>
            </div>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
              Sign Out
            </Button>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {BUCKETS.map(({ key, label }) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-base">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timeline?.[key].length === 0 && (
                    <p className="text-xs text-slate-500">Nothing here.</p>
                  )}
                  {timeline?.[key].map((initiative) => (
                    <div key={initiative.id} className="rounded-md border border-slate-700 p-3 text-sm">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-200">{initiative.title}</p>
                        <Badge variant={PRIORITY_VARIANT[initiative.priority] ?? 'default'}>
                          P{initiative.priority}
                        </Badge>
                      </div>
                      {initiative.securityCapability && (
                        <p className="mb-2 text-xs text-slate-500">{initiative.securityCapability}</p>
                      )}
                      {initiative.targetCompletionDate && (
                        <p className="mb-2 text-xs text-slate-500">
                          Due {new Date(initiative.targetCompletionDate).toLocaleDateString()}
                        </p>
                      )}
                      <select
                        value={initiative.status}
                        onChange={(e) => handleStatusChange(initiative, e.target.value)}
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
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
