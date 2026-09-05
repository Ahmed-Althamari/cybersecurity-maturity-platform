import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { RiskLevelBadge } from '../../components/risks/RiskLevelBadge';
import { ApiError, deleteRisk, getRisk, updateRisk, type RiskRecord } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';
import { hasAnyRole, RISK_DELETE_ROLES, RISK_WRITE_ROLES } from '../../lib/roles';

interface RiskDetailPageProps {
  risk: RiskRecord | null;
  accessToken: string;
  canEdit: boolean;
  canDelete: boolean;
  errorMessage: string | null;
}

const SCALE = [1, 2, 3, 4, 5];
const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
const TREATMENT_OPTIONS = ['MITIGATE', 'ACCEPT', 'AVOID', 'TRANSFER', 'MONITOR'];

export default function RiskDetailPage({ risk, accessToken, canEdit, canDelete, errorMessage }: RiskDetailPageProps) {
  const router = useRouter();
  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [likelihood, setLikelihood] = useState(risk?.likelihood ?? 3);
  const [impact, setImpact] = useState(risk?.impact ?? 3);
  const [owner, setOwner] = useState(risk?.owner ?? '');
  const [status, setStatus] = useState(risk?.status ?? 'OPEN');
  const [treatment, setTreatment] = useState(risk?.treatment ?? 'MONITOR');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!risk) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8">
          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4">{errorMessage}</div>}
        </div>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateRisk(accessToken, risk!.id, { title, description, likelihood, impact, owner, status, treatment });
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
      await deleteRisk(accessToken, risk!.id);
      router.push('/risks');
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : 'Failed to delete this risk.');
      setDeleting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{risk.title} - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Link href="/risks" className="text-slate-400 hover:text-white text-sm">
            ← Risk Register
          </Link>
          <div className="flex items-center justify-between mt-1 mb-8">
            <h1 className="text-3xl font-bold text-white">{risk.title}</h1>
            <RiskLevelBadge riskLevel={risk.riskLevel} />
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
            <div>
              <label htmlFor="risk-title" className="block text-sm text-slate-300 mb-1">
                Title
              </label>
              <input
                id="risk-title"
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="risk-description" className="block text-sm text-slate-300 mb-1">
                Description
              </label>
              <textarea
                id="risk-description"
                disabled={!canEdit}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="risk-likelihood" className="block text-sm text-slate-300 mb-1">
                  Likelihood
                </label>
                <select
                  id="risk-likelihood"
                  disabled={!canEdit}
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value))}
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
                <label htmlFor="risk-impact" className="block text-sm text-slate-300 mb-1">
                  Impact
                </label>
                <select
                  id="risk-impact"
                  disabled={!canEdit}
                  value={impact}
                  onChange={(e) => setImpact(Number(e.target.value))}
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
            <p className="text-slate-400 text-sm">
              Inherent risk score: <span className="text-white font-medium">{risk.inherentRiskScore ?? '—'}</span>
              {risk.residualRiskScore !== null && (
                <>
                  {' '}
                  · Residual: <span className="text-white font-medium">{risk.residualRiskScore}</span>
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="risk-status" className="block text-sm text-slate-300 mb-1">
                  Status
                </label>
                <select
                  id="risk-status"
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
                <label htmlFor="risk-treatment" className="block text-sm text-slate-300 mb-1">
                  Treatment
                </label>
                <select
                  id="risk-treatment"
                  disabled={!canEdit}
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-white disabled:opacity-60"
                >
                  {TREATMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
                disabled={!canEdit}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
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
                  {deleting ? 'Deleting…' : 'Delete Risk'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<RiskDetailPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  const canEdit = hasAnyRole(session.roles ?? [], RISK_WRITE_ROLES);
  const canDelete = hasAnyRole(session.roles ?? [], RISK_DELETE_ROLES);

  try {
    const risk = await getRisk(session.accessToken, id);
    return { props: { risk, accessToken: session.accessToken, canEdit, canDelete, errorMessage: null } };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this risk.';
    return { props: { risk: null, accessToken: session.accessToken, canEdit, canDelete, errorMessage: message } };
  }
};
