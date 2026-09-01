import { ControlStatus, MaturityLevel } from '@cmmp/shared';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  api,
  ApiError,
  type AssessmentDetail,
  type AssessmentItemDetail,
  type UpdateAssessmentItemInput,
} from '@/lib/api';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-xs text-slate-400';

const MATURITY_OPTIONS = Object.values(MaturityLevel);
const CONTROL_STATUS_OPTIONS = Object.values(ControlStatus);

export default function TakeAssessmentPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const assessmentId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [sessionStatus, router]);

  function load() {
    if (sessionStatus !== 'authenticated' || !assessmentId) return;
    api
      .getAssessment(session.accessToken, assessmentId)
      .then(setAssessment)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load assessment'));
  }

  useEffect(load, [sessionStatus, session, assessmentId]);

  const filteredItems = useMemo(() => {
    if (!assessment) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return assessment.items;
    return assessment.items.filter((item) => item.question.question.toLowerCase().includes(needle));
  }, [assessment, filter]);

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && !assessment && !error)) {
    return <CenteredMessage>Loading assessment…</CenteredMessage>;
  }
  if (sessionStatus !== 'authenticated') {
    return null;
  }
  if (error) {
    return <CenteredMessage>{error}</CenteredMessage>;
  }
  if (!assessment) {
    return null;
  }

  async function handleItemSave(itemId: string, input: UpdateAssessmentItemInput) {
    await api.updateAssessmentItem(session!.accessToken, assessment!.id, itemId, input);
    load();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitAssessment(session!.accessToken, assessment!.id);
      router.push(`/assessments/${assessment!.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  }

  const isEditable = assessment.status === 'DRAFT' || assessment.status === 'IN_PROGRESS';

  return (
    <>
      <Head>
        <title>{assessment.name} · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-12">
        <div className="container mx-auto max-w-4xl space-y-6">
          <Link href={`/assessments/${assessment.id}`} className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Dashboard
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{assessment.name}</h1>
              <p className="text-sm text-slate-400">
                {assessment.status} &middot; {assessment.completionPercentage}% complete &middot;{' '}
                {assessment.items.length} controls
              </p>
            </div>
            {isEditable && (
              <div className="flex items-center gap-3">
                {submitError && <p className="text-sm text-red-400">{submitError}</p>}
                <Link href={`/assessments/${assessment.id}/import`}>
                  <Button variant="outline">Import from Spreadsheet</Button>
                </Link>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || assessment.completionPercentage !== 100}
                  title={
                    assessment.completionPercentage !== 100
                      ? 'Every control must be assessed before submitting'
                      : undefined
                  }
                >
                  {submitting ? 'Submitting…' : 'Submit for Approval'}
                </Button>
              </div>
            )}
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${assessment.completionPercentage}%` }}
            />
          </div>

          {!isEditable && (
            <p className="rounded-md border border-amber-800 bg-amber-950/50 p-3 text-sm text-amber-300">
              This assessment is {assessment.status.toLowerCase()} and its responses are read-only.
            </p>
          )}

          <input
            placeholder="Filter controls by keyword…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={inputClass}
          />

          <div className="space-y-4">
            {filteredItems.map((item) => (
              <AssessmentItemCard
                key={item.id}
                item={item}
                index={assessment.items.indexOf(item) + 1}
                readOnly={!isEditable}
                onSave={(input) => handleItemSave(item.id, input)}
              />
            ))}
            {filteredItems.length === 0 && (
              <p className="text-center text-sm text-slate-500">No controls match &ldquo;{filter}&rdquo;.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AssessmentItemCard({
  item,
  index,
  readOnly,
  onSave,
}: {
  item: AssessmentItemDetail;
  index: number;
  readOnly: boolean;
  onSave: (input: UpdateAssessmentItemInput) => Promise<void>;
}) {
  const [currentMaturity, setCurrentMaturity] = useState(item.currentMaturity);
  const [targetMaturity, setTargetMaturity] = useState(item.targetMaturity);
  const [controlStatus, setControlStatus] = useState(item.controlStatus);
  const [rationale, setRationale] = useState(item.rationale ?? '');
  const [evidence, setEvidence] = useState(item.evidence ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    currentMaturity !== item.currentMaturity ||
    targetMaturity !== item.targetMaturity ||
    controlStatus !== item.controlStatus ||
    rationale !== (item.rationale ?? '') ||
    evidence !== (item.evidence ?? '');

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        currentMaturity,
        targetMaturity,
        controlStatus,
        rationale: rationale || undefined,
        evidence: evidence || undefined,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-200">
          <span className="mr-2 text-slate-500">#{index}</span>
          {item.question.question}
        </CardTitle>
        {item.question.guidance && <p className="mt-1 text-xs text-slate-500">{item.question.guidance}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Current Maturity</label>
            <select
              disabled={readOnly}
              value={currentMaturity}
              onChange={(e) => setCurrentMaturity(e.target.value)}
              className={inputClass}
            >
              {MATURITY_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Target Maturity</label>
            <select
              disabled={readOnly}
              value={targetMaturity}
              onChange={(e) => setTargetMaturity(e.target.value)}
              className={inputClass}
            >
              {MATURITY_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Control Status</label>
            <select
              disabled={readOnly}
              value={controlStatus}
              onChange={(e) => setControlStatus(e.target.value)}
              className={inputClass}
            >
              {CONTROL_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Rationale</label>
            <textarea
              disabled={readOnly}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className={labelClass}>Evidence</label>
            <textarea
              disabled={readOnly}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            {!saveError && !dirty && savedAt && <p className="text-xs text-emerald-400">Saved</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <p className="text-slate-400">{children}</p>
    </div>
  );
}
