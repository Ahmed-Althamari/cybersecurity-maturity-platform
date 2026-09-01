import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState, type FormEvent } from 'react';

import { RiskLevelBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type RiskDetail } from '@/lib/api';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-slate-300';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'];

export default function RiskDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const riskId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [risk, setRisk] = useState<RiskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState('');
  const [riskStatus, setRiskStatus] = useState('OPEN');
  const [initiativeId, setInitiativeId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [sessionStatus, router]);

  function load() {
    if (sessionStatus !== 'authenticated' || !riskId) {
      return;
    }
    api
      .getRisk(session.accessToken, riskId)
      .then((r) => {
        setRisk(r);
        setOwner(r.owner ?? '');
        setRiskStatus(r.status);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load risk'));
  }

  useEffect(load, [sessionStatus, session, riskId]);

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && !risk && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (sessionStatus !== 'authenticated') {
    return null;
  }
  if (error) {
    return <CenteredMessage>{error}</CenteredMessage>;
  }
  if (!risk) {
    return null;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateRisk(session!.accessToken, risk!.id, { owner: owner || undefined, status: riskStatus });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkInitiative(event: FormEvent) {
    event.preventDefault();
    if (!initiativeId) return;
    try {
      await api.linkInitiative(session!.accessToken, risk!.id, initiativeId);
      setInitiativeId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to link initiative');
    }
  }

  async function handleUnlink(id: string) {
    try {
      await api.unlinkInitiative(session!.accessToken, risk!.id, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to unlink initiative');
    }
  }

  return (
    <>
      <Head>
        <title>{risk.title} · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-12">
        <div className="container mx-auto max-w-3xl space-y-6">
          <Link href="/risks" className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Risk Register
          </Link>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{risk.title}</CardTitle>
                <RiskLevelBadge level={risk.riskLevel} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {risk.description && <p className="text-slate-300">{risk.description}</p>}
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-400 sm:grid-cols-4">
                <div>
                  <p className="text-slate-500">Likelihood</p>
                  <p className="text-lg font-semibold text-white">{risk.likelihood}</p>
                </div>
                <div>
                  <p className="text-slate-500">Impact</p>
                  <p className="text-lg font-semibold text-white">{risk.impact}</p>
                </div>
                <div>
                  <p className="text-slate-500">Inherent Score</p>
                  <p className="text-lg font-semibold text-white">{risk.inherentRiskScore ?? '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Residual Score</p>
                  <p className="text-lg font-semibold text-white">{risk.residualRiskScore ?? '—'}</p>
                </div>
              </div>
              {risk.threat && (
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Threat: </span>
                  {risk.threat}
                </p>
              )}
              {risk.assessmentItem && (
                <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
                  <p className="text-slate-500">Linked control ({risk.assessmentItem.question.subcategory.code})</p>
                  <p className="text-slate-300">{risk.assessmentItem.question.question}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Owner</label>
                  <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={riskStatus}
                    onChange={(e) => setRiskStatus(e.target.value)}
                    className={inputClass}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Remediation Initiatives</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {risk.initiatives.length === 0 && <p className="text-sm text-slate-500">None linked yet.</p>}
              <ul className="space-y-2">
                {risk.initiatives.map((initiative) => (
                  <li
                    key={initiative.id}
                    className="flex items-center justify-between rounded-md border border-slate-700 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-200">{initiative.title}</p>
                      <p className="text-xs text-slate-500">{initiative.status}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleUnlink(initiative.id)}>
                      Unlink
                    </Button>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleLinkInitiative} className="flex gap-2">
                <input
                  placeholder="Remediation initiative ID"
                  value={initiativeId}
                  onChange={(e) => setInitiativeId(e.target.value)}
                  className={inputClass}
                />
                <Button type="submit" variant="outline">
                  Link
                </Button>
              </form>
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
