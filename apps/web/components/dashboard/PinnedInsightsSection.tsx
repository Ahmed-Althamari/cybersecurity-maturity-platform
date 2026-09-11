import { Pin, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { ApiError, deletePinnedInsight, type PinnedInsightRecord } from '../../lib/api';
import { ChartDataTable } from '../data-analysis/ChartDataTable';

interface PinnedInsightsSectionProps {
  accessToken: string;
  canDelete: boolean;
  insights: PinnedInsightRecord[];
}

interface ParsedChartData {
  categories: string[];
  series: { name: string; values: number[] }[];
}

function parseChartData(raw: string | null): ParsedChartData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedChartData;
    if (Array.isArray(parsed.categories) && Array.isArray(parsed.series)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Charts explicitly pinned from the Data Analysis page — see apps/api/src/pinned-insights.
 * Never populated automatically; this section simply doesn't render when nothing has been
 * pinned yet, same as any other empty dashboard widget. */
export function PinnedInsightsSection({ accessToken, canDelete, insights }: PinnedInsightsSectionProps) {
  const [items, setItems] = useState(insights);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return null;
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deletePinnedInsight(accessToken, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove this pinned insight.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="flex items-center gap-1.5 text-white font-semibold text-lg mb-4">
        <Pin className="h-4 w-4 text-slate-400" />
        Pinned Insights
      </h2>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((insight) => {
          const chartData = parseChartData(insight.chartData);
          const isExpanded = expandedId === insight.id;
          return (
            <div key={insight.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-white text-sm font-medium">{insight.title}</p>
                  {insight.sourceFileName && <p className="text-slate-500 text-xs mt-0.5">from {insight.sourceFileName}</p>}
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(insight.id)}
                    disabled={busyId === insight.id}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50 shrink-0"
                    aria-label="Remove pinned insight"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {chartData ? (
                <button type="button" onClick={() => setExpandedId(isExpanded ? null : insight.id)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${insight.imageBase64}`}
                    alt={insight.title}
                    className="w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/png;base64,${insight.imageBase64}`} alt={insight.title} className="w-full rounded" />
              )}
              {chartData && (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  {isExpanded ? 'Hide data' : 'View underlying data'}
                </button>
              )}
              {chartData && isExpanded && <ChartDataTable categories={chartData.categories} series={chartData.series} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
