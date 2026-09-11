import { Check, Lock, Pin, ShieldHalf, Sparkles } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

import { ChartDataTable } from '../../components/data-analysis/ChartDataTable';
import { AppHeader } from '../../components/layout/AppHeader';
import { EmptyState } from '../../components/layout/EmptyState';
import {
  analyzeSpreadsheet,
  ApiError,
  createPinnedInsight,
  getWorkbookSheets,
  listLlmProviderSettings,
  type AnalysisMode,
  type AnalysisResult,
  type ExtractedChart,
  type LlmProviderSettingView,
  type WorkbookSheetsResult,
} from '../../lib/api';
import { getAuthSession } from '../../lib/auth';

interface DataAnalysisPageProps {
  accessToken: string;
  userEmail: string;
  organisationId: string;
  configuredSlots: LlmProviderSettingView[];
}

type Step = 'select' | 'reading' | 'sheets' | 'analyzing' | 'result';

/**
 * A new, isolated feature: upload a spreadsheet and get either a zero-LLM, fully offline
 * AutoViz chart set ("local" — data never leaves the platform) or a PandasAI-driven
 * natural-language analysis ("ai" — data is sent to whichever LLM chain the server has
 * configured). Deliberately its own page/route, not folded into the assessments import wizard —
 * this analyzes an arbitrary spreadsheet, not an assessment-shaped one.
 *
 * A real workbook is rarely one clean table: it commonly mixes data sheets with sheets someone
 * already built as a dashboard (native charts/pivot tables). For an .xlsx/.xls with more than
 * one sheet, or any dashboard sheet, this shows a sheet picker before analyzing — dashboard
 * sheets' own charts are extracted with their real plotted data (not just a picture) and shown
 * immediately, while a single ordinary table sheet skips the picker entirely to keep the
 * one-click feel for the common case.
 */
export default function DataAnalysisPage({ accessToken, userEmail, organisationId, configuredSlots }: DataAnalysisPageProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AnalysisMode>('local');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('');
  const [slot, setSlot] = useState<number | undefined>(undefined);
  const [step, setStep] = useState<Step>('select');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const [sheetsResult, setSheetsResult] = useState<WorkbookSheetsResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [expandedChartKey, setExpandedChartKey] = useState<string | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);

  async function runAnalysis(sheetName: string | undefined) {
    if (!file) return;
    setStep('analyzing');
    setStepError(null);
    try {
      const response = await analyzeSpreadsheet(
        accessToken,
        file,
        mode,
        mode === 'ai' ? question || undefined : undefined,
        mode === 'ai' ? slot : undefined,
        sheetName,
      );
      setResult(response);
      setStep('result');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Analysis failed.');
      setStep(sheetsResult ? 'sheets' : 'select');
    }
  }

  async function handleContinue() {
    if (!file) return;
    setStepError(null);

    if (file.name.toLowerCase().endsWith('.csv')) {
      await runAnalysis(undefined);
      return;
    }

    setStep('reading');
    try {
      const sheets = await getWorkbookSheets(accessToken, file);
      const tableSheets = sheets.sheets.filter((s) => s.type === 'TABLE');
      if (sheets.sheets.length === 1 && tableSheets.length === 1) {
        // The common case — one ordinary table sheet, nothing to pick — skips straight to
        // analysis rather than showing a picker with only one option in it.
        await runAnalysis(tableSheets[0].name);
        return;
      }
      setSheetsResult(sheets);
      setSelectedSheet(tableSheets[0]?.name ?? null);
      setStep('sheets');
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Failed to read the workbook.');
      setStep('select');
    }
  }

  function handleReset() {
    setFile(null);
    setQuestion('');
    setSlot(undefined);
    setResult(null);
    setStepError(null);
    setSheetsResult(null);
    setSelectedSheet(null);
    setExpandedChartKey(null);
    setPinnedKeys(new Set());
    setStep('select');
  }

  async function handlePin(key: string, title: string, imageBase64: string, chartData?: { categories: string[]; series: { name: string; values: number[] }[] }) {
    setPinBusyKey(key);
    setStepError(null);
    try {
      await createPinnedInsight(accessToken, {
        organisationId,
        title,
        imageBase64,
        chartData: chartData ? JSON.stringify(chartData) : undefined,
        sourceFileName: file?.name,
      });
      setPinnedKeys((prev) => new Set(prev).add(key));
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : 'Failed to pin this chart to the dashboard.');
    } finally {
      setPinBusyKey(null);
    }
  }

  function handleAddToRiskRegister() {
    if (!result?.answer) return;
    const firstLine = result.answer.split('\n')[0].slice(0, 100);
    router.push({
      pathname: '/risks/new',
      query: { prefillTitle: `Finding from Data Analysis: ${firstLine}`, prefillDescription: result.answer },
    });
  }

  function PinButton({ pinKey, title, imageBase64, chartData }: { pinKey: string; title: string; imageBase64: string; chartData?: { categories: string[]; series: { name: string; values: number[] }[] } }) {
    const isPinned = pinnedKeys.has(pinKey);
    return (
      <button
        type="button"
        onClick={() => handlePin(pinKey, title, imageBase64, chartData)}
        disabled={isPinned || pinBusyKey === pinKey}
        className="flex items-center gap-1 text-xs text-slate-300 hover:text-white disabled:opacity-60 disabled:cursor-default transition-colors"
      >
        {isPinned ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" /> Pinned to Dashboard
          </>
        ) : (
          <>
            <Pin className="h-3 w-3" /> Pin to Dashboard
          </>
        )}
      </button>
    );
  }

  function ExtractedChartCard({ chart, index }: { chart: ExtractedChart; index: number }) {
    const key = `extracted-${chart.sheetName}-${index}`;
    const isExpanded = expandedChartKey === key;
    return (
      <div className="bg-slate-900/60 rounded-md p-3 border border-slate-700">
        <p className="text-slate-300 text-xs font-medium mb-2">
          {chart.title} <span className="text-slate-500">· {chart.sheetName}</span>
        </p>
        <button type="button" onClick={() => setExpandedChartKey(isExpanded ? null : key)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${chart.imageBase64}`}
            alt={chart.title}
            className="w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
          />
        </button>
        <div className="flex items-center justify-between mt-2">
          <button type="button" onClick={() => setExpandedChartKey(isExpanded ? null : key)} className="text-xs text-blue-400 hover:text-blue-300">
            {isExpanded ? 'Hide data' : 'View underlying data'}
          </button>
          <PinButton pinKey={key} title={chart.title} imageBase64={chart.imageBase64} chartData={{ categories: chart.categories, series: chart.series }} />
        </div>
        {isExpanded && <ChartDataTable categories={chart.categories} series={chart.series} />}
      </div>
    );
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

              {mode === 'ai' && configuredSlots.length > 0 && (
                <div>
                  <label htmlFor="slot-input" className="block text-sm font-medium text-slate-300 mb-2">
                    Provider <span className="text-slate-500 font-normal">(optional — defaults to trying each configured slot in order)</span>
                  </label>
                  <select
                    id="slot-input"
                    value={slot ?? ''}
                    onChange={(e) => setSlot(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Auto (all configured, in order)</option>
                    {configuredSlots.map((s) => (
                      <option key={s.slot} value={s.slot}>
                        Slot {s.slot} — {s.format === 'anthropic' ? 'Claude' : 'OpenAI-compatible'} ({s.model})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {stepError && <p className="text-sm text-red-400">{stepError}</p>}

              <button
                onClick={handleContinue}
                disabled={!file}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Analyze
              </button>
            </div>
          )}

          {step === 'reading' && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
              Reading the workbook&apos;s sheets…
            </div>
          )}

          {step === 'sheets' && sheetsResult && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-white font-semibold mb-1">Choose a sheet to analyze</h2>
                <p className="text-slate-400 text-sm mb-4">
                  This workbook has {sheetsResult.sheets.length} sheets. Dashboard sheets already contain their own charts, shown
                  below as-is; pick one of the data table sheets to run {mode === 'local' ? 'AutoViz' : 'AI'} analysis on.
                </p>

                <div className="space-y-2 mb-4">
                  {sheetsResult.sheets.map((sheet) => (
                    <label
                      key={sheet.name}
                      className={`flex items-center justify-between rounded-md border p-3 ${sheet.type === 'TABLE' ? 'cursor-pointer' : 'cursor-default opacity-80'} ${
                        selectedSheet === sheet.name ? 'border-blue-500 bg-blue-950/20' : 'border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {sheet.type === 'TABLE' && (
                          <input
                            type="radio"
                            name="sheet"
                            checked={selectedSheet === sheet.name}
                            onChange={() => setSelectedSheet(sheet.name)}
                          />
                        )}
                        <div>
                          <p className="text-white text-sm font-medium">{sheet.name}</p>
                          <p className="text-slate-500 text-xs">
                            ~{sheet.rowCount} rows · {sheet.columnCount} columns
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                          sheet.type === 'DASHBOARD'
                            ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-800'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {sheet.type === 'DASHBOARD' ? 'Dashboard sheet' : 'Data table'}
                      </span>
                    </label>
                  ))}
                </div>

                {stepError && <p className="text-sm text-red-400 mb-3">{stepError}</p>}

                <div className="flex items-center gap-2">
                  {sheetsResult.sheets.some((s) => s.type === 'TABLE') ? (
                    <button
                      onClick={() => runAnalysis(selectedSheet ?? undefined)}
                      disabled={!selectedSheet}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                    >
                      Analyze &quot;{selectedSheet}&quot;
                    </button>
                  ) : (
                    <p className="text-slate-500 text-sm">No data table sheet found — only this workbook&apos;s own charts are shown below.</p>
                  )}
                  <button
                    onClick={handleReset}
                    className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>

              {sheetsResult.extractedCharts.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <h2 className="text-white font-semibold mb-4">Charts already in this workbook</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sheetsResult.extractedCharts.map((chart, i) => (
                      <ExtractedChartCard key={`${chart.sheetName}-${i}`} chart={chart} index={i} />
                    ))}
                  </div>
                </div>
              )}
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
                  <div className="bg-slate-900/60 rounded-md p-4 mb-4">
                    <p className="text-slate-200 text-sm whitespace-pre-wrap">{result.answer}</p>
                    <button
                      type="button"
                      onClick={handleAddToRiskRegister}
                      className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ShieldHalf className="h-3.5 w-3.5" />
                      Add to Risk Register
                    </button>
                  </div>
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
                    {result.charts.map((chart, i) => {
                      const key = `generated-${i}`;
                      return (
                        <div key={i} className="bg-slate-900/60 rounded-md p-3 border border-slate-700">
                          <p className="text-slate-300 text-xs font-medium mb-2">{chart.title}</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:image/png;base64,${chart.imageBase64}`} alt={chart.title} className="w-full rounded" />
                          {/* No click-to-expand here — AutoViz/PandasAI hand back a rendered image only, with no
                              way to recover which exact data points it plotted, unlike a workbook's own embedded
                              dashboard-sheet charts above. */}
                          <div className="mt-2">
                            <PinButton pinKey={key} title={chart.title} imageBase64={chart.imageBase64} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stepError && <p className="text-sm text-red-400 mt-4">{stepError}</p>}
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

  // Best-effort: the slot picker is a convenience, not required for "ai" mode to work (it still
  // falls back to trying every configured slot in order) — a failed lookup here just means the
  // picker doesn't render, not a broken page.
  let configuredSlots: LlmProviderSettingView[] = [];
  try {
    const settings = await listLlmProviderSettings(session.accessToken);
    configuredSlots = settings.filter((s) => s.configured);
  } catch {
    configuredSlots = [];
  }

  return {
    props: {
      accessToken: session.accessToken,
      userEmail: session.user?.email ?? '',
      organisationId: session.organisationId ?? '',
      configuredSlots,
    },
  };
};
