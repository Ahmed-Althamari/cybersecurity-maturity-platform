import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React, { useState } from 'react';

import { AppHeader } from '../../../components/layout/AppHeader';
import { BackLink } from '../../../components/layout/BackLink';
import {
  ApiError,
  getAssessment,
  importAssessmentFile,
  previewAssessmentImport,
  type ImportPreviewResult,
  type ImportResult,
} from '../../../lib/api';
import { getAuthSession } from '../../../lib/auth';

interface ImportPageProps {
  assessmentId: string;
  assessmentName: string;
  editable: boolean;
  accessToken: string;
  errorMessage: string | null;
}

type Step = 'select' | 'previewing' | 'preview' | 'importing' | 'result';

function downloadErrorReport(csv: string, assessmentName: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${assessmentName.replace(/[^a-z0-9]+/gi, '-')}-import-errors.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Every canonical column the preview mentions, mapped ones first (each in the order the API returned them), then the rest still unmapped. */
function orderedColumns(preview: ImportPreviewResult): string[] {
  return [...Object.keys(preview.columnMapping), ...preview.unmappedColumns];
}

export default function ImportPage({ assessmentId, assessmentName, editable, accessToken, errorMessage }: ImportPageProps) {
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) return;
    setStep('previewing');
    setStepError(null);
    try {
      const response = await previewAssessmentImport(accessToken, assessmentId, file);
      setPreview(response);
      setMapping(response.columnMapping);
      setStep('preview');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Could not read this file.');
      setStep('select');
    }
  }

  async function handleImport() {
    if (!file) return;
    setStep('importing');
    setStepError(null);
    try {
      const response = await importAssessmentFile(accessToken, assessmentId, file, mapping);
      setResult(response);
      setStep('result');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Import failed.');
      setStep('preview');
    }
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setStepError(null);
    setStep('select');
  }

  return (
    <>
      <Head>
        <title>Import - {assessmentName || 'Assessment'} - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <BackLink href={`/assessments/${assessmentId}/items`}>{assessmentName || 'Assessment'}</BackLink>
          <h1 className="text-3xl font-bold text-white mt-1 mb-8">Import from Excel/CSV</h1>

          {errorMessage && <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-lg p-4 mb-6">{errorMessage}</div>}

          {!editable && !errorMessage && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
              This assessment can no longer be edited, so it can&apos;t accept an import.
            </div>
          )}

          {editable && step === 'select' && (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4">
              <p className="text-slate-300 text-sm">
                Upload a <code className="text-slate-200">.xlsx</code>, <code className="text-slate-200">.xls</code>, or{' '}
                <code className="text-slate-200">.csv</code> file. Columns are matched automatically by name (e.g. a
                &quot;Current Score&quot; column maps to Current Maturity); you&apos;ll get a chance to review and fix the
                mapping before anything is written.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-slate-700 file:text-white file:text-sm hover:file:bg-slate-600"
              />
              {stepError && <p className="text-sm text-red-400">{stepError}</p>}
              <button
                onClick={handlePreview}
                disabled={!file}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Preview Import
              </button>
            </div>
          )}

          {step === 'previewing' && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">Reading file…</div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Review Column Mapping</h2>
                  {preview.llmConfigured && (
                    <span className="text-xs bg-indigo-950/60 border border-indigo-800 text-indigo-300 px-2 py-1 rounded-full">
                      AI-assisted mapping enabled
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  {preview.totalRows} rows found. {preview.validCount} valid, {preview.warningCount} with warnings,{' '}
                  {preview.invalidCount} invalid, {preview.duplicateCount} duplicate — based on the mapping below. Adjust any
                  field, then confirm to actually import.
                </p>
                <div className="space-y-2">
                  {orderedColumns(preview).map((column) => {
                    const suggested = preview.llmSuggestedColumns.includes(column);
                    return (
                      <div key={column} className="flex items-center gap-3">
                        <label htmlFor={`mapping-${column}`} className="w-48 shrink-0 text-sm text-slate-300">
                          {column.replace(/_/g, ' ')}
                          {suggested && <span className="ml-1.5 text-xs text-indigo-400" title="Suggested by the mapping assistant">✨</span>}
                        </label>
                        <select
                          id={`mapping-${column}`}
                          value={mapping[column] ?? ''}
                          onChange={(e) =>
                            setMapping((prev) => {
                              const next = { ...prev };
                              if (e.target.value) {
                                next[column] = e.target.value;
                              } else {
                                delete next[column];
                              }
                              return next;
                            })
                          }
                          className="flex-1 rounded-md bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white"
                        >
                          <option value="">— not mapped —</option>
                          {preview.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {stepError && <p className="text-sm text-red-400">{stepError}</p>}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Confirm &amp; Import
                </button>
                <button
                  onClick={handleReset}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Choose a Different File
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">Importing…</div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-white font-semibold mb-4">Import Results</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Total rows</p>
                    <p className="text-white text-lg font-medium">{result.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Imported</p>
                    <p className="text-green-500 text-lg font-medium">{result.importedCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Valid</p>
                    <p className="text-white text-lg font-medium">{result.validCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Warnings</p>
                    <p className="text-yellow-500 text-lg font-medium">{result.warningCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Invalid</p>
                    <p className="text-red-400 text-lg font-medium">{result.invalidCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Duplicates</p>
                    <p className="text-red-400 text-lg font-medium">{result.duplicateCount}</p>
                  </div>
                </div>

                {result.unmappedColumns.length > 0 && (
                  <p className="text-slate-400 text-xs mt-4">
                    Unmapped columns (ignored): {result.unmappedColumns.join(', ')}
                  </p>
                )}

                {(result.invalidCount > 0 || result.duplicateCount > 0) && (
                  <button
                    onClick={() => downloadErrorReport(result.errorReportCsv, assessmentName)}
                    className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline"
                  >
                    Download error report (CSV)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Import Another File
                </button>
                <Link
                  href={`/assessments/${assessmentId}/items`}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  View Assessment
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS'];

export const getServerSideProps: GetServerSideProps<ImportPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }

  try {
    const assessment = await getAssessment(session.accessToken, id);
    return {
      props: {
        assessmentId: id,
        assessmentName: assessment.name,
        editable: EDITABLE_STATUSES.includes(assessment.status),
        accessToken: session.accessToken,
        errorMessage: null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { notFound: true };
    }
    const message = error instanceof ApiError ? error.message : 'Failed to load this assessment.';
    return {
      props: { assessmentId: id, assessmentName: '', editable: false, accessToken: session.accessToken, errorMessage: message },
    };
  }
};
