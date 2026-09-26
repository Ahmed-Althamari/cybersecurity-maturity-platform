import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { BackLink } from '../../components/layout/BackLink';
import { ApiError, createStrategicInitiative } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, STRATEGIC_WRITE_ROLES } from '../../lib/roles';

interface NewStrategicInitiativePageProps {
  organisationId: string;
  accessToken: string;
}

const SCALE = [1, 2, 3, 4, 5];

export default function NewStrategicInitiativePage({ organisationId, accessToken }: NewStrategicInitiativePageProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [strategicObjective, setStrategicObjective] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState(3);
  const [weight, setWeight] = useState('1');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const initiative = await createStrategicInitiative(accessToken, {
        organisationId,
        title,
        description: description || undefined,
        strategicObjective: strategicObjective || undefined,
        owner: owner || undefined,
        priority,
        weight: weight ? Number(weight) : undefined,
        notes: notes || undefined,
        // Date-only input needs a real ISO timestamp for the API's @IsISO8601 fields.
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`).toISOString() : undefined,
        targetDate: targetDate ? new Date(`${targetDate}T00:00:00.000Z`).toISOString() : undefined,
      });
      router.push(`/strategic-plan/${initiative.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the initiative.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>New Strategic Initiative - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-xl">
          <BackLink href="/strategic-plan">Strategic Plan</BackLink>
          <h1 className="text-3xl font-bold text-white mt-1 mb-8">New Strategic Initiative</h1>

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
                placeholder="e.g. Implement Enterprise Vulnerability Management Programme"
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label htmlFor="initiative-objective" className="block text-sm text-slate-300 mb-1">
                Strategic Objective
              </label>
              <input
                id="initiative-objective"
                value={strategicObjective}
                onChange={(e) => setStrategicObjective(e.target.value)}
                placeholder="e.g. Strengthen Vulnerability & Patch Management"
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
                <label htmlFor="initiative-weight" className="block text-sm text-slate-300 mb-1">
                  Weight (overall progress rollup)
                </label>
                <input
                  id="initiative-weight"
                  type="number"
                  min={0}
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white"
                />
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-start-date" className="block text-sm text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  id="initiative-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="initiative-target-date" className="block text-sm text-slate-300 mb-1">
                  Target Date
                </label>
                <input
                  id="initiative-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="initiative-notes" className="block text-sm text-slate-300 mb-1">
                Comments / Notes
              </label>
              <textarea
                id="initiative-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

export const getServerSideProps: GetServerSideProps<NewStrategicInitiativePageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  if (!session.organisationId || !hasAnyRole(session.roles ?? [], STRATEGIC_WRITE_ROLES)) {
    return { redirect: { destination: '/strategic-plan', permanent: false } };
  }

  return { props: { organisationId: session.organisationId, accessToken: session.accessToken } };
};
