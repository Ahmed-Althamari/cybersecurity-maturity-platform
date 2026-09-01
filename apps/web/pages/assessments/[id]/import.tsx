import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useMemo, useState, type ChangeEvent } from 'react';

import { MaturityDistributionChart } from '@/components/dashboard/maturity-distribution-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  api,
  ApiError,
  type ColumnMapping,
  type ImportPreview,
  type ImportResult,
  type ImportSheetPreview,
} from '@/lib/api';

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

/** Best-effort auto-mapping: match a target field to a header of the same name (case-insensitively). */
function exactMatchMapping(headers: string[], fields: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of fields) {
    const match = headers.find((h) => h.toLowerCase() === field.toLowerCase());
    if (match) mapping[field] = match;
  }
  return mapping;
}

export default function ImportAssessmentPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const assessmentId = typeof router.query.id === 'string' ? router.query.id : undefined;

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sheet: ImportSheetPreview | undefined = preview?.sheets.find((s) => s.sheetName === activeSheet);
  const allFields = preview ? [preview.requiredField, ...preview.optionalFields] : [];

  const maturityDistribution = useMemo(() => {
    if (!result) return null;
    const counts: Record<string, number> = {};
    for (const row of result.results) {
      const level = row.data?.currentMaturity;
      if (row.status === 'ERROR' || !level) continue;
      counts[level] = (counts[level] ?? 0) + 1;
    }
    return counts;
  }, [result]);

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
    setActiveSheet(null);
    setMapping({});
    setAiSuggestedFields(new Set());
    setResult(null);
    setError(null);
    if (selected) {
      const inferred = selected.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
      setFormat(inferred);
    }
  }

  async function applyMappingForSheet(sheetPreview: ImportSheetPreview, fields: string[]) {
    const auto = exactMatchMapping(sheetPreview.headers, fields);
    setMapping(auto);
    setAiSuggestedFields(new Set());

    const stillUnmapped = fields.filter((f) => !auto[f]);
    if (stillUnmapped.length === 0 || !assessmentId) return;

    setSuggesting(true);
    try {
      const { mapping: suggested } = await api.suggestMapping(
        session!.accessToken,
        assessmentId,
        sheetPreview.headers,
        sheetPreview.sampleRows,
      );
      const merged: ColumnMapping = { ...auto };
      const suggestedSet = new Set<string>();
      for (const field of stillUnmapped) {
        if (suggested[field]) {
          merged[field] = suggested[field];
          suggestedSet.add(field);
        }
      }
      setMapping(merged);
      setAiSuggestedFields(suggestedSet);
    } catch {
      // AI suggestion is a pure enhancement -- leave the exact-match mapping as-is on failure.
    } finally {
      setSuggesting(false);
    }
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const previewResult = await api.previewImport(session!.accessToken, assessmentId!, file, format);
      setPreview(previewResult);
      const firstSheet = previewResult.sheets[0];
      if (firstSheet) {
        setActiveSheet(firstSheet.sheetName);
        const fields = [previewResult.requiredField, ...previewResult.optionalFields];
        await applyMappingForSheet(firstSheet, fields);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to read file');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSelectSheet(sheetName: string) {
    setActiveSheet(sheetName);
    setResult(null);
    const sheetPreview = preview?.sheets.find((s) => s.sheetName === sheetName);
    if (sheetPreview && preview) {
      await applyMappingForSheet(sheetPreview, allFields);
    }
  }

  async function handleImport() {
    if (!file || !preview || !sheet) return;
    setImporting(true);
    setError(null);
    try {
      const importResult = await api.importResponses(
        session!.accessToken,
        assessmentId!,
        file,
        format,
        mapping,
        // Only needed once a workbook actually has more than one tab --
        // omitting it for a single-sheet file/CSV keeps today's behavior.
        preview.sheets.length > 1 ? sheet.sheetName : undefined,
      );
      setResult(importResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

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

          {preview && preview.sheets.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>2. Choose a sheet tab</CardTitle>
                <p className="text-xs text-slate-500">
                  This workbook has {preview.sheets.length} tabs. Pick one to import -- you can come back and import
                  another tab afterward.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {preview.sheets.map((s) => (
                    <button
                      key={s.sheetName}
                      onClick={() => handleSelectSheet(s.sheetName)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        s.sheetName === activeSheet
                          ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                          : 'border-slate-600 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {s.sheetName}
                      <span className="ml-2 text-xs text-slate-500">({s.rowCount})</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {preview && sheet && (
            <Card>
              <CardHeader>
                <CardTitle>{preview.sheets.length > 1 ? '3.' : '2.'} Map columns</CardTitle>
                <p className="text-xs text-slate-500">
                  {sheet.rowCount} data row{sheet.rowCount === 1 ? '' : 's'} detected with {sheet.headers.length}{' '}
                  column{sheet.headers.length === 1 ? '' : 's'} in &ldquo;{sheet.sheetName}&rdquo;. Choose which
                  source column supplies each field below (leave optional fields unmapped to skip them).
                  {suggesting && ' Asking AI to suggest a mapping for unmatched fields…'}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {sheet.sampleFormulas.some((f) => Object.keys(f).length > 0) && (
                  <p className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                    Some sampled cells contain formulas -- the value shown/imported is the spreadsheet&apos;s last
                    calculated result, not the formula itself.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {allFields.map((field) => (
                    <div key={field}>
                      <label className={labelClass}>
                        {FIELD_LABELS[field] ?? field}
                        {aiSuggestedFields.has(field) && (
                          <span
                            className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300"
                            title="Suggested by AI -- verify before importing"
                          >
                            ✨ AI suggested
                          </span>
                        )}
                      </label>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) => {
                          setMapping((m) => ({ ...m, [field]: e.target.value || undefined }) as ColumnMapping);
                          setAiSuggestedFields((s) => {
                            const next = new Set(s);
                            next.delete(field);
                            return next;
                          });
                        }}
                        className={inputClass}
                      >
                        <option value="">
                          {field === preview.requiredField ? '-- select a column --' : '-- not mapped --'}
                        </option>
                        {sheet.headers.map((header) => (
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

          {maturityDistribution && Object.keys(maturityDistribution).length > 0 && (
            <MaturityDistributionChart distribution={maturityDistribution} />
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
