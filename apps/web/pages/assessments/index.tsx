import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type AssessmentSummary } from '@/lib/api';
import { signOutAndRevoke } from '@/lib/auth';

export default function AssessmentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [assessments, setAssessments] = useState<AssessmentSummary[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    api
      .listAssessments(session.accessToken, page)
      .then((result) => {
        setAssessments(result.data);
        setTotalPages(Math.max(1, result.totalPages));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load assessments'));
  }, [status, session, page]);

  if (status === 'loading' || (status === 'authenticated' && assessments === null && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }

  // EXECUTIVE_VIEWER-only sessions are API-side restricted to the executive
  // dashboard (ExecutiveViewerScopeGuard) -- Roadmap/Risk Register/Audit Log
  // would all now 403 for them, so hide the dead-end links rather than let
  // them click through to an error. A user who also holds a broader role
  // keeps full nav, matching the guard's own multi-role treatment.
  const isExecutiveViewerOnly =
    session.user.roles.length === 1 && session.user.roles[0] === 'EXECUTIVE_VIEWER';

  return (
    <>
      <Head>
        <title>Assessments · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Assessments</h1>
              <p className="text-slate-400">{session.user.name} &middot; {session.user.role}</p>
            </div>
            <div className="flex gap-2">
              {!isExecutiveViewerOnly && (
                <>
                  <Link href="/assessments/new">
                    <Button>New Assessment</Button>
                  </Link>
                  <Link href="/roadmap">
                    <Button variant="outline">Roadmap</Button>
                  </Link>
                  <Link href="/risks">
                    <Button variant="outline">Risk Register</Button>
                  </Link>
                  <Link href="/audit">
                    <Button variant="outline">Audit Log</Button>
                  </Link>
                </>
              )}
              {session.user.roles.includes('PLATFORM_ADMIN') && (
                <Link href="/admin/settings">
                  <Button variant="outline">Settings</Button>
                </Link>
              )}
              <Button
                variant="outline"
                onClick={() => signOutAndRevoke(session.accessToken, '/auth/signin')}
              >
                Sign Out
              </Button>
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          {assessments && assessments.length === 0 && (
            <p className="text-slate-400">No assessments yet for your organisation.</p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assessments?.map((assessment) => (
              <Link key={assessment.id} href={`/assessments/${assessment.id}`} className="no-underline">
                <Card className="cursor-pointer transition-colors hover:border-blue-500">
                  <CardHeader>
                    <CardTitle>{assessment.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 text-sm text-slate-400">
                    <p>Status: <span className="text-slate-200">{assessment.status}</span></p>
                    <p>Completion: <span className="text-slate-200">{assessment.completionPercentage}%</span></p>
                    {assessment.currentMaturity !== null && (
                      <p>
                        Maturity: <span className="text-slate-200">{assessment.currentMaturity.toFixed(1)} / {assessment.targetMaturity?.toFixed(1)}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                Previous
              </Button>
              <span className="text-sm text-slate-400">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
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
