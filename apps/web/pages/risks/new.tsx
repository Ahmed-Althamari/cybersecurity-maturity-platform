import { useState, type FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-slate-300';

export default function NewRiskPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [threat, setThreat] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status !== 'authenticated') {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const risk = await api.createRisk(session!.accessToken, {
        organisationId: session!.user.organisationId!,
        title,
        description: description || undefined,
        threat: threat || undefined,
        likelihood,
        impact,
        owner: owner || undefined,
      });
      router.push(`/risks/${risk.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create risk');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>New Risk · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-12">
        <div className="container mx-auto max-w-xl">
          <Link href="/risks" className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Risk Register
          </Link>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Record a New Risk</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inputClass}
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
                  <label className={labelClass}>Threat</label>
                  <input value={threat} onChange={(e) => setThreat(e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Likelihood (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={likelihood}
                      onChange={(e) => setLikelihood(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Impact (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={impact}
                      onChange={(e) => setImpact(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Risk score: {likelihood * impact} / 25 (risk level is auto-suggested from this score)
                </p>
                <div>
                  <label className={labelClass}>Owner</label>
                  <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass} />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Risk'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
