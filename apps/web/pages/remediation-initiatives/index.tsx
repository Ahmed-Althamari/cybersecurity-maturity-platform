import { Plus, Sparkles, Wrench } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import {
  ApiError,
  generateInitiativesFromGaps,
  listInitiatives,
  type RemediationInitiativeSummary,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, REMEDIATION_WRITE_ROLES } from '../../lib/roles';

interface RemediationInitiativesPageProps {
  accessToken: string;
  organisationId: string | null;
  initiatives: RemediationInitiativeSummary[];
  page: number;
  totalPages: number;
  canManage: boolean;
  sort: string;
  status: string;
  errorMessage: string | null;
}

const STATUS_OPTIONS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'];

export default function RemediationInitiativesPage({
  accessToken,
  organisationId,
  initiatives,
  page,
  totalPages,
  canManage,
  sort,
  status,
  errorMessage,
}: RemediationInitiativesPageProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  async function handleGenerateFromGaps() {
    if (!organisationId) return;
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const created = await generateInitiativesFromGaps(accessToken, organisationId);
      setGenerateMessage(
        created.length === 0
          ? 'No new initiatives — every current gap already has one tracking it.'
          : `Drafted ${created.length} new initiative${created.length === 1 ? '' : 's'} from the largest framework gaps. Review and flesh out each one.`,
      );
      router.replace(router.asPath);
    } catch (err) {
      setGenerateMessage(err instanceof ApiError ? err.message : 'Failed to generate initiatives from gaps.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Head>
        <title>Remediation Initiatives - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-white">Remediation Initiatives</h1>
              <p className="text-slate-400 text-sm mt-1">Planned and in-flight work to close maturity gaps and treat risks.</p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateFromGaps}
                  disabled={generating}
                  className="flex items-center gap-1.5 border border-slate-600 hover:border-slate-500 disabled:opacity-50 text-slate-200 text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  {generating ? 'Generating…' : 'Generate from Gaps'}
                </button>
                <Link
                  href="/remediation-initiatives/new"
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Initiative
                </Link>
              </div>
            )}
          </div>

          {generateMessage && <p className="text-sm text-slate-300 mb-4">{generateMessage}</p>}

          <div className="flex items-center gap-2 mb-6 text-sm flex-wrap">
            <span className="text-slate-400">Sort:</span>
            <Link href={{ query: { sort: 'priority', status } }} className={sort === 'priority' ? 'text-white font-medium' : 'text-slate-400'}>
              Priority
            </Link>
            <span className="text-slate-600">·</span>
            <Link href={{ query: { sort: 'recent', status } }} className={sort === 'recent' ? 'text-white font-medium' : 'text-slate-400'}>
              Recent
            </Link>
            <span className="text-slate-600 mx-2">|</span>
            <span className="text-slate-400">Status:</span>
            <Link href={{ query: { sort, status: '' } }} className={!status ? 'text-white font-medium' : 'text-slate-400'}>
              All
            </Link>
            {STATUS_OPTIONS.map((option) => (
              <Link
                key={option}
                href={{ query: { sort, status: option } }}
                className={status === option ? 'text-white font-medium' : 'text-slate-400'}
              >
                {option}
              </Link>
            ))}
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {initiatives.length === 0 && !errorMessage && (
            <EmptyState icon={Wrench} title="No initiatives match this filter." />
          )}

          <div className="space-y-3">
            {initiatives.map((initiative) => (
              <Link
                key={initiative.id}
                href={`/remediation-initiatives/${initiative.id}`}
                className="flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors"
              >
                <p className="text-white font-medium">{initiative.title}</p>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full whitespace-nowrap">{initiative.status}</span>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                href={{ query: { sort, status, page: String(page - 1) } }}
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
                href={{ query: { sort, status, page: String(page + 1) } }}
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

export const getServerSideProps: GetServerSideProps<RemediationInitiativesPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const organisationId = session.organisationId ?? null;
  const sort = typeof context.query.sort === 'string' && context.query.sort === 'recent' ? 'recent' : 'priority';
  const status = typeof context.query.status === 'string' ? context.query.status : '';
  const page = typeof context.query.page === 'string' && Number(context.query.page) > 0 ? Number(context.query.page) : 1;
  const canManage = hasAnyRole(session.roles ?? [], REMEDIATION_WRITE_ROLES);

  if (!organisationId) {
    return {
      props: {
        accessToken: session.accessToken,
        organisationId: null,
        initiatives: [],
        page: 1,
        totalPages: 1,
        canManage,
        sort,
        status,
        errorMessage: 'Your account has no organisation assigned.',
      },
    };
  }

  try {
    const result = await listInitiatives(session.accessToken, organisationId, { sort, status: status || undefined, page, pageSize: 20 });
    return {
      props: {
        accessToken: session.accessToken,
        organisationId,
        initiatives: result.data,
        page: result.page,
        totalPages: result.totalPages,
        canManage,
        sort,
        status,
        errorMessage: null,
      },
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load remediation initiatives.';
    return {
      props: { accessToken: session.accessToken, organisationId, initiatives: [], page: 1, totalPages: 1, canManage, sort, status, errorMessage: message },
    };
  }
};
