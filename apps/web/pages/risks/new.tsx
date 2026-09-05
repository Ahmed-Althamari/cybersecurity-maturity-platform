import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { ApiError, createRisk } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, RISK_WRITE_ROLES } from '../../lib/roles';

interface NewRiskPageProps {
  organisationId: string;
  accessToken: string;
}

const SCALE = [1, 2, 3, 4, 5];

export default function NewRiskPage({ organisationId, accessToken }: NewRiskPageProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [owner, setOwner] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const risk = await createRisk(accessToken, {
        organisationId,
        title,
        description: description || undefined,
        likelihood,
        impact,
        owner: owner || undefined,
      });
      router.push(`/risks/${risk.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the risk.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>New Risk - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8 max-w-xl">
          <Link href="/risks" className="text-slate-400 hover:text-white text-sm">
            ← Risk Register
          </Link>
          <h1 className="text-3xl font-bold text-white mt-1 mb-8">New Risk</h1>

          <form onSubmit={handleSubmit} className="space-y-4 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div>
              <label htmlFor="risk-title" className="block text-sm text-slate-300 mb-1">
                Title
              </label>
              <input
                id="risk-title"
                required
                minLength={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="risk-description" className="block text-sm text-slate-300 mb-1">
                Description
              </label>
              <textarea
                id="risk-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="risk-likelihood" className="block text-sm text-slate-300 mb-1">
                  Likelihood (1-5)
                </label>
                <select
                  id="risk-likelihood"
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value))}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white"
                >
                  {SCALE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="risk-impact" className="block text-sm text-slate-300 mb-1">
                  Impact (1-5)
                </label>
                <select
                  id="risk-impact"
                  value={impact}
                  onChange={(e) => setImpact(Number(e.target.value))}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white"
                >
                  {SCALE.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="risk-owner" className="block text-sm text-slate-300 mb-1">
                Owner
              </label>
              <input
                id="risk-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-md transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Risk'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<NewRiskPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  if (!session.organisationId || !hasAnyRole(session.roles ?? [], RISK_WRITE_ROLES)) {
    return { redirect: { destination: '/risks', permanent: false } };
  }

  return { props: { organisationId: session.organisationId, accessToken: session.accessToken } };
};
