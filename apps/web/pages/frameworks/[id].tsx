import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { NavigationTree } from '../../components/frameworks/NavigationTree';
import { ApiError, getFramework, getFrameworkNavigation, type FrameworkSummary, type NavigationNode } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface FrameworkDetailPageProps {
  framework: FrameworkSummary | null;
  navigation: NavigationNode[];
  errorMessage: string | null;
}

export default function FrameworkDetailPage({ framework, navigation, errorMessage }: FrameworkDetailPageProps) {
  return (
    <>
      <Head>
        <title>{framework ? `${framework.name} - CMMP` : 'Framework - CMMP'}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link href="/frameworks" className="text-slate-400 hover:text-white text-sm">
                ← Frameworks
              </Link>
              <h1 className="text-3xl font-bold text-white mt-1">{framework?.name ?? 'Framework'}</h1>
              {framework && (
                <p className="text-slate-400 text-sm mt-1">
                  {framework.frameWorkType} · v{framework.version}
                </p>
              )}
            </div>
          </div>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {framework?.description && <p className="text-slate-300 text-sm mb-6 max-w-2xl">{framework.description}</p>}

          {framework && (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <NavigationTree nodes={navigation} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<FrameworkDetailPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  try {
    const [framework, navigation] = await Promise.all([
      getFramework(session.accessToken, id),
      getFrameworkNavigation(session.accessToken, id),
    ]);
    return { props: { framework, navigation, errorMessage: null } };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this framework.';
    return { props: { framework: null, navigation: [], errorMessage: message } };
  }
};
