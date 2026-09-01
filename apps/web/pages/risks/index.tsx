import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { api, ApiError, type RiskDetail } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { RiskLevelBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function RisksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [risks, setRisks] = useState<RiskDetail[] | null>(null);
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
      .listRisks(session.accessToken)
      .then(setRisks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load risks'));
  }, [status, session]);

  if (status === 'loading' || (status === 'authenticated' && risks === null && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }

  return (
    <>
      <Head>
        <title>Risk Register · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
                &larr; Assessments
              </Link>
              <h1 className="mt-1 text-3xl font-bold text-white">Risk Register</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/risks/new">
                <Button>New Risk</Button>
              </Link>
              <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
                Sign Out
              </Button>
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          {risks && risks.length === 0 && <p className="text-slate-400">No risks recorded yet.</p>}

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-6 py-3 font-medium">Title</th>
                    <th className="px-6 py-3 font-medium">Risk Level</th>
                    <th className="px-6 py-3 font-medium">Score</th>
                    <th className="px-6 py-3 font-medium">Owner</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Initiatives</th>
                  </tr>
                </thead>
                <tbody>
                  {risks?.map((risk) => (
                    <tr
                      key={risk.id}
                      className="cursor-pointer border-b border-slate-800 text-slate-200 hover:bg-slate-700/40"
                      onClick={() => router.push(`/risks/${risk.id}`)}
                    >
                      <td className="px-6 py-3 font-medium">{risk.title}</td>
                      <td className="px-6 py-3">
                        <RiskLevelBadge level={risk.riskLevel} />
                      </td>
                      <td className="px-6 py-3">{risk.inherentRiskScore ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-400">{risk.owner ?? 'Unassigned'}</td>
                      <td className="px-6 py-3 text-slate-400">{risk.status}</td>
                      <td className="px-6 py-3 text-slate-400">{risk.initiatives.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
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
