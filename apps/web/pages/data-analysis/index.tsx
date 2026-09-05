import { Lock, Sparkles } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import React, { useState } from 'react';

import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import { analyzeSpreadsheet, ApiError, type AnalysisMode, type AnalysisResult } from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface DataAnalysisPageProps {
  accessToken: string;
  userEmail: string;
}

type Step = 'select' | 'analyzing' | 'result';

/**
 * A new, isolated feature: upload a spreadsheet and get either a zero-LLM, fully offline
 * AutoViz chart set ("local" — data never leaves the platform) or a PandasAI-driven
 * natural-language analysis ("ai" — data is sent to whichever LLM chain the server has
 * configured). Deliberately its own page/route, not folded into the assessments import wizard —
 * this analyzes an arbitrary spreadsheet, not an assessment-shaped one.
 */
export default function DataAnalysisPage({ accessToken, userEmail }: DataAnalysisPageProps) {
  const [mode, setMode] = useState<AnalysisMode>('local');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('');
  const [step, setStep] = useState<Step>('select');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!file) return;
    setStep('analyzing');
    setStepError(null);
    try {
      const response = await analyzeSpreadsheet(accessToken, file, mode, mode === 'ai' ? question || undefined : undefined);
      setResult(response);
      setStep('result');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Analysis failed.');
      setStep('select');
    }
  }

  function handleReset() {
    setFile(null);
    setQuestion('');
    setResult(null);
    setStepError(null);
    setStep('select');
  }

  return (
    <>
      <Head>
        <title>Data Analysis - CMMP</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <AppHeader userEmail={userEmail} />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <h1 className="text-3xl font-bold text-white mb-1">Data Analysis</h1>
          <p className="text-slate-400 text-sm mb-8">
            Upload any spreadsheet (.xlsx, .xls, or .csv) and get automatic charts and insights — independent of the
            assessments/risks/frameworks workflow above.
          </p>

          {step === 'select' && (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-300 mb-2">Analysis mode</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('local')}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      mode === 'local' ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Lock className="h-4 w-4 text-emerald-400" />
                      Local / Privacy-Preserving
                    </div>
                    <p className="text-slate-400 text-xs mt-1.5">
                      Zero LLM calls. Your data never leaves the platform — charts are generated entirely offline.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('ai')}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      mode === 'ai' ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      AI-Powered
                    </div>
                    <p className="text-slate-400 text-xs mt-1.5">
                      Ask questions in plain English. Your data is sent to the platform&apos;s configured LLM provider.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="file-input" className="block text-sm font-medium text-slate-300 mb-2">
                  Spreadsheet
                </label>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-slate-700 file:text-white file:text-sm hover:file:bg-slate-600"
                />
              </div>

              {mode === 'ai' && (
                <div>
                  <label htmlFor="question-input" className="block text-sm font-medium text-slate-300 mb-2">
                    Question <span className="text-slate-500 font-normal">(optional — defaults to an executive summary)</span>
                  </label>
                  <input
                    id="question-input"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Which category has the highest average score?"
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                  />
                </div>
              )}

              {stepError && <p className="text-sm text-red-400">{stepError}</p>}

              <button
                onClick={handleAnalyze}
                disabled={!file}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Analyze
              </button>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
              {mode === 'local' ? 'Generating charts…' : 'Analyzing…'} This can take a little while on a large sheet.
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Results</h2>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      result.mode === 'local'
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-indigo-950/60 border-indigo-800 text-indigo-300'
                    }`}
                  >
                    {result.mode === 'local' ? 'Local / Privacy-Preserving' : 'AI-Powered'}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  {result.rowCount} rows, {result.columnCount} columns.
                </p>

                {result.error && <p className="text-sm text-red-400 mb-4">{result.error}</p>}

                {result.answer && (
                  <div className="bg-slate-900/60 rounded-md p-4 mb-4 text-slate-200 text-sm whitespace-pre-wrap">{result.answer}</div>
                )}

                {result.table && result.table.length > 0 && (
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-700">
                          {Object.keys(result.table[0]).map((col) => (
                            <th key={col} className="py-1.5 pr-4 font-medium text-slate-400">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.table.map((row, i) => (
                          <tr key={i} className="border-b border-slate-800/60">
                            {Object.values(row).map((value, j) => (
                              <td key={j} className="py-1.5 pr-4">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.charts.length === 0 && !result.answer && !result.table && !result.error && (
                  <EmptyState icon={Sparkles} title="No output" description="The analysis completed but produced nothing to show." />
                )}

                {result.charts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {result.charts.map((chart, i) => (
                      <div key={i} className="bg-slate-900/60 rounded-md p-3 border border-slate-700">
                        <p className="text-slate-300 text-xs font-medium mb-2">{chart.title}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`data:image/png;base64,${chart.imageBase64}`} alt={chart.title} className="w-full rounded" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleReset}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Analyze Another File
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<DataAnalysisPageProps> = async (context) => {
  const session = await getAuthSession(context);
  if (!session?.accessToken) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  return { props: { accessToken: session.accessToken, userEmail: session.user?.email ?? '' } };
};
