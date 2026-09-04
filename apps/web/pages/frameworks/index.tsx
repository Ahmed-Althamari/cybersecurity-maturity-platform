import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { ApiError, listFrameworks, type FrameworkSummary } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface FrameworksPageProps {
  frameworks: FrameworkSummary[];
  errorMessage: string | null;
}

export default function FrameworksPage({ frameworks, errorMessage }: FrameworksPageProps) {
  return (
    <>
      <Head>
        <title>Frameworks - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Frameworks</h1>
              <p className="text-slate-400 text-sm mt-1">Every framework loaded for your tenant.</p>
            </div>
            <Link
              href="/dashboard"
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {frameworks.length === 0 && !errorMessage && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">No frameworks loaded yet.</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {frameworks.map((framework) => (
              <Link
                key={framework.id}
                href={`/frameworks/${framework.id}`}
                className="block bg-slate-800 rounded-lg p-5 border border-slate-700 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h2 className="text-white font-semibold">{framework.name}</h2>
                  {!framework.isActive && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  {framework.frameWorkType} · v{framework.version}
                </p>
                {framework.description && <p className="text-slate-500 text-sm mt-2 line-clamp-2">{framework.description}</p>}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<FrameworksPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  try {
    const frameworks = await listFrameworks(session.accessToken);
    return { props: { frameworks, errorMessage: null } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Failed to load frameworks.';
    return { props: { frameworks: [], errorMessage: message } };
  }
};
