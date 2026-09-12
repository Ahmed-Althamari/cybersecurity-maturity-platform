import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { BackLink } from '../../components/layout/BackLink';
import { ApiError, createInitiative } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, REMEDIATION_WRITE_ROLES } from '../../lib/roles';

interface NewInitiativePageProps {
  organisationId: string;
  accessToken: string;
}

const SCALE = [1, 2, 3, 4, 5];
const MATURITY_LEVELS = ['NOT_APPLICABLE', 'INITIAL', 'DEVELOPING', 'DEFINED', 'MANAGED', 'OPTIMISED'];

export default function NewInitiativePage({ organisationId, accessToken }: NewInitiativePageProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [securityCapability, setSecurityCapability] = useState('');
  const [priority, setPriority] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [currentMaturity, setCurrentMaturity] = useState('INITIAL');
  const [targetMaturity, setTargetMaturity] = useState('DEFINED');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [owner, setOwner] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const initiative = await createInitiative(accessToken, {
        organisationId,
        title,
        description: description || undefined,
        securityCapability: securityCapability || undefined,
        priority,
        complexity,
        currentMaturity,
        targetMaturity,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
        owner: owner || undefined,
        // Date-only input needs a real ISO timestamp for the API's @IsISO8601 target date.
        targetCompletionDate: targetCompletionDate ? new Date(`${targetCompletionDate}T00:00:00.000Z`).toISOString() : undefined,
      });
      router.push(`/remediation-initiatives/${initiative.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the initiative.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>New Remediation Initiative - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-xl">
          <BackLink href="/remediation-initiatives">Remediation Initiatives</BackLink>
          <h1 className="text-3xl font-bold text-white mt-1 mb-8">New Remediation Initiative</h1>

          <form onSubmit={handleSubmit} className="space-y-4 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div>
              <label htmlFor="initiative-title" className="block text-sm text-slate-300 mb-1">
                Title
              </label>
              <input
                id="initiative-title"
                required
                minLength={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="initiative-description" className="block text-sm text-slate-300 mb-1">
                Description
              </label>
              <textarea
                id="initiative-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="initiative-capability" className="block text-sm text-slate-300 mb-1">
                Security Capability
              </label>
              <input
                id="initiative-capability"
                value={securityCapability}
                onChange={(e) => setSecurityCapability(e.target.value)}
                placeholder="e.g. Identity & Access Management"
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-priority" className="block text-sm text-slate-300 mb-1">
                  Priority (1 = highest)
                </label>
                <select
                  id="initiative-priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
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
                <label htmlFor="initiative-complexity" className="block text-sm text-slate-300 mb-1">
                  Complexity (1-5)
                </label>
                <select
                  id="initiative-complexity"
                  value={complexity}
                  onChange={(e) => setComplexity(Number(e.target.value))}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-current-maturity" className="block text-sm text-slate-300 mb-1">
                  Current Maturity
                </label>
                <select
                  id="initiative-current-maturity"
                  value={currentMaturity}
                  onChange={(e) => setCurrentMaturity(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white"
                >
                  {MATURITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="initiative-target-maturity" className="block text-sm text-slate-300 mb-1">
                  Target Maturity
                </label>
                <select
                  id="initiative-target-maturity"
                  value={targetMaturity}
                  onChange={(e) => setTargetMaturity(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white"
                >
                  {MATURITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-owner" className="block text-sm text-slate-300 mb-1">
                  Owner
                </label>
                <input
                  id="initiative-owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="initiative-target-date" className="block text-sm text-slate-300 mb-1">
                  Target Completion
                </label>
                <input
                  id="initiative-target-date"
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="initiative-cost" className="block text-sm text-slate-300 mb-1">
                Estimated Cost
              </label>
              <input
                id="initiative-cost"
                type="number"
                min={0}
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-md transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Initiative'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<NewInitiativePageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  if (!session.organisationId || !hasAnyRole(session.roles ?? [], REMEDIATION_WRITE_ROLES)) {
    return { redirect: { destination: '/remediation-initiatives', permanent: false } };
  }

  return { props: { organisationId: session.organisationId, accessToken: session.accessToken } };
};
