import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type ColumnMapping, type ImportPreview, type ImportResult } from '@/lib/api';

const inputClass =
  'w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-xs text-slate-400';

const FIELD_LABELS: Record<string, string> = {
  subcategoryCode: 'Subcategory Code (required)',
  currentMaturity: 'Current Maturity',
  targetMaturity: 'Target Maturity',
  riskLevel: 'Risk Level',
  businessCriticality: 'Business Criticality',
  controlStatus: 'Control Status',
  rationale: 'Rationale',
  evidence: 'Evidence',
  assessorComments: 'Assessor Comments',
  ownerName: 'Owner Name',
  ownerEmail: 'Owner Email',
  remediationDueDate: 'Remediation Due Date',
};

export default function ImportAssessmentPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const assessmentId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sessionStatus === 'loading') {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (sessionStatus !== 'authenticated' || !assessmentId) {
    return null;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    if (selected) {
      const inferred = selected.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
      setFormat(inferred);
    }
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const result = await api.previewImport(session!.accessToken, assessmentId!, file, format);
      setPreview(result);
      // Best-effort auto-mapping: match a target field to a header of the
      // same name (case-insensitively), leaving the rest for the human to
      // pick -- most spreadsheets exported from this platform will already
      // use these exact header names.
      const autoMapping: ColumnMapping = {};
      const allFields = [result.requiredField, ...result.optionalFields];
      for (const field of allFields) {
        const match = result.headers.find((h) => h.toLowerCase() === field.toLowerCase());
        if (match) autoMapping[field] = match;
      }
      setMapping(autoMapping);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to read file');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const importResult = await api.importResponses(session!.accessToken, assessmentId!, file, format, mapping);
      setResult(importResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const allFields = preview ? [preview.requiredField, ...preview.optionalFields] : [];

  return (
    <>
      <Head>
        <title>Import Responses · CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-12">
        <div className="container mx-auto max-w-3xl space-y-6">
          <Link href={`/assessments/${assessmentId}/take`} className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Back to Assessment
          </Link>

          <Card>
            <CardHeader>
              <CardTitle>1. Choose a file</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} className={inputClass} />
              {file && (
                <div className="flex items-center gap-4">
                  <div>
                    <label className={labelClass}>Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}
                      className={inputClass}
                    >
                      <option value="csv">CSV</option>
                      <option value="xlsx">XLSX</option>
                    </select>
                  </div>
                  <Button onClick={handlePreview} disabled={previewing} className="mt-4">
                    {previewing ? 'Reading…' : 'Preview Columns'}
                  </Button>
                </div>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>2. Map columns</CardTitle>
                <p className="text-xs text-slate-500">
                  {preview.rowCount} data row{preview.rowCount === 1 ? '' : 's'} detected with{' '}
                  {preview.headers.length} column{preview.headers.length === 1 ? '' : 's'}. Choose which source
                  column supplies each field below (leave optional fields unmapped to skip them).
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {allFields.map((field) => (
                    <div key={field}>
                      <label className={labelClass}>{FIELD_LABELS[field] ?? field}</label>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [field]: e.target.value || undefined }) as ColumnMapping)
                        }
                        className={inputClass}
                      >
                        <option value="">
                          {field === preview.requiredField ? '-- select a column --' : '-- not mapped --'}
                        </option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <Button onClick={handleImport} disabled={importing || !mapping[preview.requiredField]}>
                  {importing ? 'Importing…' : 'Import Responses'}
                </Button>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Import Complete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{result.successCount}</p>
                    <p className="text-slate-500">Applied</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">{result.warningCount}</p>
                    <p className="text-slate-500">Warnings</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{result.errorCount}</p>
                    <p className="text-slate-500">Errors</p>
                  </div>
                </div>
                {result.results
                  .filter((r) => r.status !== 'VALID')
                  .slice(0, 20)
                  .map((r) => (
                    <p key={r.rowNumber} className="text-xs text-slate-400">
                      Row {r.rowNumber} ({r.status}): {r.messages.join('; ')}
                    </p>
                  ))}
                <Link href={`/assessments/${assessmentId}/take`}>
                  <Button variant="outline">View Assessment</Button>
                </Link>
              </CardContent>
            </Card>
          )}
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
