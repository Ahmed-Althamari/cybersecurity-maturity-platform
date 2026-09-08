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

type Step = 'select' | 'previewing' | 'choose-sheets' | 'preview' | 'importing' | 'result';

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

/**
 * Combines one `ImportResult` per imported sheet into a single summary. There's no API
 * support for importing several sheets in one request — each sheet is a separate
 * `POST .../import` call under the hood — so this just sums the counts and stitches the
 * per-sheet error-report CSVs together (each section labelled with its sheet name) into
 * one downloadable report.
 */
function combineImportResults(sheetNames: string[], results: ImportResult[]): ImportResult {
  const sum = (key: 'totalRows' | 'importedCount' | 'validCount' | 'warningCount' | 'invalidCount' | 'duplicateCount') =>
    results.reduce((total, r) => total + r[key], 0);
  const errorReportCsv = results
    .map((r, i) => (r.errorReportCsv.trim() ? `# Sheet: ${sheetNames[i]}\n${r.errorReportCsv}` : ''))
    .filter(Boolean)
    .join('\n\n');
  return {
    totalRows: sum('totalRows'),
    importedCount: sum('importedCount'),
    validCount: sum('validCount'),
    warningCount: sum('warningCount'),
    invalidCount: sum('invalidCount'),
    duplicateCount: sum('duplicateCount'),
    columnMapping: Object.assign({}, ...results.map((r) => r.columnMapping)),
    unmappedColumns: Array.from(new Set(results.flatMap((r) => r.unmappedColumns))),
    errorReportCsv,
  };
}

/** One line of at-a-glance stats for a sheet in the picker — lets a user tell a real data sheet apart from a cover/notes tab without opening the file, using the same auto-mapping the import itself would use (no extra service, nothing to configure). */
function SheetStatsLine({ preview }: { preview: ImportPreviewResult }) {
  const mappedCount = Object.keys(preview.columnMapping).length;
  if (mappedCount === 0) {
    return <span className="text-red-400">0 columns recognized — probably not assessment data</span>;
  }
  return (
    <span className="text-slate-400">
      {mappedCount} column{mappedCount === 1 ? '' : 's'} mapped · {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} ·{' '}
      <span className="text-white">{preview.validCount} valid</span>, {preview.warningCount} warning, {preview.invalidCount}{' '}
      invalid, {preview.duplicateCount} duplicate
    </span>
  );
}

export default function ImportPage({ assessmentId, assessmentName, editable, accessToken, errorMessage }: ImportPageProps) {
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [sheetPreviews, setSheetPreviews] = useState<Record<string, ImportPreviewResult>>({});
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) return;
    setStep('previewing');
    setStepError(null);
    try {
      const first = await previewAssessmentImport(accessToken, assessmentId, file);
      if (first.sheetNames.length <= 1) {
        setPreview(first);
        setMapping(first.columnMapping);
        // '' (not a real sheet name) stands for "no worksheet param" — CSV uploads report
        // no sheet names at all, and a single-sheet workbook needs no explicit name either.
        setSelectedSheets(['']);
        setStep('preview');
        return;
      }

      // Multiple sheets: preview every one so the picker can show real per-sheet
      // stats instead of asking the user to guess which tab has the real data.
      const entries = await Promise.all(
        first.sheetNames.map(async (name) => [name, await previewAssessmentImport(accessToken, assessmentId, file, name)] as const),
      );
      const bySheet = Object.fromEntries(entries) as Record<string, ImportPreviewResult>;
      setSheetPreviews(bySheet);
      const defaultSelected = first.sheetNames.filter((name) => Object.keys(bySheet[name].columnMapping).length > 0);
      setSelectedSheets(defaultSelected.length > 0 ? defaultSelected : [first.sheetNames[0]]);
      setStep('choose-sheets');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Could not read this file.');
      setStep('select');
    }
  }

  function toggleSheet(name: string) {
    setSelectedSheets((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  }

  function handleReviewSingleSheetMapping(name: string) {
    const p = sheetPreviews[name];
    if (!p) return;
    setPreview(p);
    setMapping(p.columnMapping);
    setSelectedSheets([name]);
    setStep('preview');
  }

  async function handleImportSheets(sheets: string[]) {
    if (!file || sheets.length === 0) return;
    setStep('importing');
    setStepError(null);
    try {
      const results: ImportResult[] = [];
      for (const sheetName of sheets) {
        // A manually-edited mapping only ever applies when it was reviewed for
        // exactly that one sheet; every other sheet imports on its own auto-mapping.
        const columnMappingForSheet = sheets.length === 1 ? mapping : undefined;
        // Each sheet's import must commit before the next one starts.
        const response = await importAssessmentFile(accessToken, assessmentId, file, columnMappingForSheet, sheetName);
        results.push(response);
      }
      setResult(sheets.length === 1 ? results[0] : combineImportResults(sheets, results));
      setStep('result');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Import failed.');
      setStep(sheets.length > 1 ? 'choose-sheets' : 'preview');
    }
  }

  function handleReset() {
    setFile(null);
    setSheetPreviews({});
    setSelectedSheets([]);
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
                mapping before anything is written. If the workbook has more than one sheet, you&apos;ll be asked which
                one(s) to import.
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

          {step === 'choose-sheets' && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-white font-semibold mb-1">Choose Sheets to Import</h2>
                <p className="text-slate-400 text-sm mb-4">
                  This workbook has {Object.keys(sheetPreviews).length} sheets. Each is imported separately (they don&apos;t
                  need matching columns), so pick as many as you want — sheets that recognized zero columns are unchecked
                  by default.
                </p>
                <div className="space-y-3">
                  {Object.keys(sheetPreviews).map((name) => (
                    <div key={name} className="flex items-start gap-3 rounded-md border border-slate-700 p-3">
                      <input
                        type="checkbox"
                        id={`sheet-${name}`}
                        checked={selectedSheets.includes(name)}
                        onChange={() => toggleSheet(name)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`sheet-${name}`} className="text-white text-sm font-medium block">
                          {name}
                        </label>
                        <p className="text-xs mt-0.5">
                          <SheetStatsLine preview={sheetPreviews[name]} />
                        </p>
                      </div>
                      <button
                        onClick={() => handleReviewSingleSheetMapping(name)}
                        className="text-xs text-blue-400 hover:text-blue-300 underline shrink-0"
                      >
                        Review mapping
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-slate-500 text-xs mt-4">
                  &quot;Review mapping&quot; lets you fix the column mapping for one sheet before importing it. Importing
                  more than one sheet at once uses each sheet&apos;s automatic mapping as-is.
                </p>
              </div>

              {stepError && <p className="text-sm text-red-400">{stepError}</p>}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleImportSheets(selectedSheets)}
                  disabled={selectedSheets.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Import {selectedSheets.length} Selected Sheet{selectedSheets.length === 1 ? '' : 's'}
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

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">
                    Review Column Mapping
                    {selectedSheets.length === 1 && preview.sheetNames.length > 1 && (
                      <span className="text-slate-400 font-normal"> — {selectedSheets[0]}</span>
                    )}
                  </h2>
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
                  onClick={() => handleImportSheets(selectedSheets)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Confirm &amp; Import
                </button>
                <button
                  onClick={() => (preview.sheetNames.length > 1 ? setStep('choose-sheets') : handleReset())}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                >
                  {preview.sheetNames.length > 1 ? 'Back to Sheet List' : 'Choose a Different File'}
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
                <h2 className="text-white font-semibold mb-4">
                  Import Results
                  {selectedSheets.length > 1 && (
                    <span className="text-slate-400 font-normal text-sm"> — {selectedSheets.length} sheets combined</span>
                  )}
                </h2>
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
