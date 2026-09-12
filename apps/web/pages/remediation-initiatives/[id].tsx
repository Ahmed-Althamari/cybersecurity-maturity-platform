import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { BackLink } from '../../components/layout/BackLink';
import { RiskLevelBadge } from '../../components/risks/RiskLevelBadge';
import { ApiError, deleteInitiative, getInitiative, updateInitiative, type RemediationInitiativeRecord } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, REMEDIATION_DELETE_ROLES, REMEDIATION_WRITE_ROLES } from '../../lib/roles';

interface InitiativeDetailPageProps {
  initiative: RemediationInitiativeRecord | null;
  accessToken: string;
  canEdit: boolean;
  canDelete: boolean;
  errorMessage: string | null;
}

const SCALE = [1, 2, 3, 4, 5];
const MATURITY_LEVELS = ['NOT_APPLICABLE', 'INITIAL', 'DEVELOPING', 'DEFINED', 'MANAGED', 'OPTIMISED'];
const STATUS_OPTIONS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'];

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function InitiativeDetailPage({ initiative, accessToken, canEdit, canDelete, errorMessage }: InitiativeDetailPageProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initiative?.title ?? '');
  const [description, setDescription] = useState(initiative?.description ?? '');
  const [securityCapability, setSecurityCapability] = useState(initiative?.securityCapability ?? '');
  const [priority, setPriority] = useState(initiative?.priority ?? 3);
  const [complexity, setComplexity] = useState(initiative?.complexity ?? 3);
  const [currentMaturity, setCurrentMaturity] = useState(initiative?.currentMaturity ?? 'INITIAL');
  const [targetMaturity, setTargetMaturity] = useState(initiative?.targetMaturity ?? 'DEFINED');
  const [estimatedCost, setEstimatedCost] = useState(initiative?.estimatedCost != null ? String(initiative.estimatedCost) : '');
  const [owner, setOwner] = useState(initiative?.owner ?? '');
  const [status, setStatus] = useState(initiative?.status ?? 'PLANNED');
  const [startDate, setStartDate] = useState(toDateInputValue(initiative?.startDate ?? null));
  const [targetCompletionDate, setTargetCompletionDate] = useState(toDateInputValue(initiative?.targetCompletionDate ?? null));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!initiative) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8">
          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4">{errorMessage}</div>}
        </div>
      </div>
    );
  }

  function toIsoDate(dateInput: string): string | undefined {
    return dateInput ? new Date(`${dateInput}T00:00:00.000Z`).toISOString() : undefined;
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateInitiative(accessToken, initiative!.id, {
        title,
        description,
        securityCapability,
        priority,
        complexity,
        currentMaturity,
        targetMaturity,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
        owner,
        status,
        startDate: toIsoDate(startDate),
        targetCompletionDate: toIsoDate(targetCompletionDate),
      });
      setSaveMessage('Saved.');
      router.replace(router.asPath);
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteInitiative(accessToken, initiative!.id);
      router.push('/remediation-initiatives');
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : 'Failed to delete this initiative.');
      setDeleting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{initiative.title} - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <BackLink href="/remediation-initiatives">Remediation Initiatives</BackLink>
          <div className="flex items-center justify-between mt-1 mb-8">
            <h1 className="text-3xl font-bold text-white">{initiative.title}</h1>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{initiative.status}</span>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
            <div>
              <label htmlFor="initiative-title" className="block text-sm text-slate-300 mb-1">
                Title
              </label>
              <input
                id="initiative-title"
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="initiative-description" className="block text-sm text-slate-300 mb-1">
                Description
              </label>
              <textarea
                id="initiative-description"
                disabled={!canEdit}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="initiative-capability" className="block text-sm text-slate-300 mb-1">
                Security Capability
              </label>
              <input
                id="initiative-capability"
                disabled={!canEdit}
                value={securityCapability}
                onChange={(e) => setSecurityCapability(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="initiative-priority" className="block text-sm text-slate-300 mb-1">
                  Priority (1 = highest)
                </label>
                <select
                  id="initiative-priority"
                  disabled={!canEdit}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                  disabled={!canEdit}
                  value={complexity}
                  onChange={(e) => setComplexity(Number(e.target.value))}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                  disabled={!canEdit}
                  value={currentMaturity}
                  onChange={(e) => setCurrentMaturity(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                  disabled={!canEdit}
                  value={targetMaturity}
                  onChange={(e) => setTargetMaturity(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                <label htmlFor="initiative-status" className="block text-sm text-slate-300 mb-1">
                  Status
                </label>
                <select
                  id="initiative-status"
                  disabled={!canEdit}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="initiative-owner" className="block text-sm text-slate-300 mb-1">
                  Owner
                </label>
                <input
                  id="initiative-owner"
                  disabled={!canEdit}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                  disabled={!canEdit}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="initiative-target-date" className="block text-sm text-slate-300 mb-1">
                  Target Completion
                </label>
                <input
                  id="initiative-target-date"
                  type="date"
                  disabled={!canEdit}
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
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
                disabled={!canEdit}
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>

            {saveMessage && <p className="text-sm text-slate-300">{saveMessage}</p>}

            <div className="flex items-center justify-between pt-2">
              {canEdit ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              ) : (
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Read-only</span>
              )}
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-red-400 hover:text-red-300 disabled:opacity-50 text-sm font-medium"
                >
                  {deleting ? 'Deleting…' : 'Delete Initiative'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 mt-6">
            <h2 className="text-lg font-semibold text-white">Linked Risks</h2>
            <p className="text-xs text-slate-500">
              Link or unlink a risk from its own detail page&apos;s &quot;Remediation Initiatives&quot; section.
            </p>
            {initiative.risks.length === 0 ? (
              <p className="text-sm text-slate-500">No risks linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {initiative.risks.map((risk) => (
                  <li key={risk.id}>
                    <Link
                      href={`/risks/${risk.id}`}
                      className="flex items-center justify-between rounded-md border border-slate-700 p-3 text-sm hover:border-blue-500 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-slate-200">{risk.title}</p>
                        <p className="text-xs text-slate-500">{risk.status}</p>
                      </div>
                      <RiskLevelBadge riskLevel={risk.riskLevel} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<InitiativeDetailPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  const canEdit = hasAnyRole(session.roles ?? [], REMEDIATION_WRITE_ROLES);
  const canDelete = hasAnyRole(session.roles ?? [], REMEDIATION_DELETE_ROLES);

  try {
    const initiative = await getInitiative(session.accessToken, id);
    return { props: { initiative, accessToken: session.accessToken, canEdit, canDelete, errorMessage: null } };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this initiative.';
    return { props: { initiative: null, accessToken: session.accessToken, canEdit, canDelete, errorMessage: message } };
  }
};
