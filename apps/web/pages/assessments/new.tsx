import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type FrameworkSummary } from '@/lib/api';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-slate-300';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewAssessmentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [frameworks, setFrameworks] = useState<FrameworkSummary[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frameworkSlug, setFrameworkSlug] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    api
      .listFrameworks(session.accessToken)
      .then((list) => {
        setFrameworks(list);
        if (list.length > 0) setFrameworkSlug(list[0].slug);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load frameworks'));
  }, [status, session]);

  if (status === 'loading' || (status === 'authenticated' && frameworks === null && !error)) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (status !== 'authenticated') {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const assessment = await api.createAssessment(session!.accessToken, {
        organisationId: session!.user.organisationId!,
        frameworkSlug,
        name,
        description: description || undefined,
        assessmentDate,
      });
      router.push(`/assessments/${assessment.id}/take`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create assessment');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>New Assessment · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-12">
        <div className="container mx-auto max-w-xl">
          <Link href="/assessments" className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Assessments
          </Link>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Start a New Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              {frameworks && frameworks.length === 0 && (
                <p className="mb-4 text-sm text-amber-400">
                  No frameworks are available yet. An administrator needs to add one before an
                  assessment can be created.
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>Framework</label>
                  <select
                    required
                    value={frameworkSlug}
                    onChange={(e) => setFrameworkSlug(e.target.value)}
                    className={inputClass}
                    disabled={!frameworks || frameworks.length === 0}
                  >
                    {(frameworks ?? []).map((fw) => (
                      <option key={fw.id} value={fw.slug}>
                        {fw.name} (v{fw.version})
                      </option>
                    ))}
                  </select>
                  {frameworkSlug && frameworks && (
                    <p className="mt-1 text-xs text-slate-500">
                      {frameworks.find((fw) => fw.slug === frameworkSlug)?.description}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Assessment Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Q1 2027 Cybersecurity Assessment"
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={inputClass}
                    rows={3}
                  />
                </div>
                <div>
                  <label className={labelClass}>Assessment Date</label>
                  <input
                    required
                    type="date"
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !frameworkSlug}
                >
                  {submitting ? 'Creating…' : 'Create & Start Assessment'}
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
