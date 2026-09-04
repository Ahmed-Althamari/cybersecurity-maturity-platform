import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { RiskLevelBadge } from '../../components/risks/RiskLevelBadge';
import { ApiError, listRisks, type RiskRecord } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, RISK_WRITE_ROLES } from '../../lib/roles';

interface RisksPageProps {
  risks: RiskRecord[];
  canCreate: boolean;
  sort: string;
  status: string;
  errorMessage: string | null;
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'CLOSED'];

export default function RisksPage({ risks, canCreate, sort, status, errorMessage }: RisksPageProps) {
  return (
    <>
      <Head>
        <title>Risk Register - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Risk Register</h1>
              <p className="text-slate-400 text-sm mt-1">Every open risk for your organisation.</p>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Link
                  href="/risks/new"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  New Risk
                </Link>
              )}
              <Link
                href="/dashboard"
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6 text-sm">
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

          {risks.length === 0 && !errorMessage && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
              No risks match this filter.
            </div>
          )}

          <div className="space-y-3">
            {risks.map((risk) => (
              <Link
                key={risk.id}
                href={`/risks/${risk.id}`}
                className="flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-blue-500 transition-colors"
              >
                <div>
                  <p className="text-white font-medium">{risk.title}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Likelihood {risk.likelihood} × Impact {risk.impact} = {risk.inherentRiskScore ?? '—'}
                    {risk.owner && ` · ${risk.owner}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{risk.status}</span>
                  <RiskLevelBadge riskLevel={risk.riskLevel} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<RisksPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const organisationId = session.organisationId;
  const sort = typeof context.query.sort === 'string' && context.query.sort === 'recent' ? 'recent' : 'priority';
  const status = typeof context.query.status === 'string' ? context.query.status : '';
  const canCreate = hasAnyRole(session.roles ?? [], RISK_WRITE_ROLES);

  if (!organisationId) {
    return { props: { risks: [], canCreate, sort, status, errorMessage: 'Your account has no organisation assigned.' } };
  }

  try {
    const risks = await listRisks(session.accessToken, organisationId, { sort, status: status || undefined });
    return { props: { risks, canCreate, sort, status, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load risks.';
    return { props: { risks: [], canCreate, sort, status, errorMessage: message } };
  }
};
