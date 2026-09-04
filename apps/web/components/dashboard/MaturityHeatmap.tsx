import React from 'react';

import type { ScoredNode } from '../../lib/api';
import { maturityBand, STATUS_COLORS } from '../../lib/maturity-scale';

interface MaturityHeatmapProps {
  functions: ScoredNode[];
}

/**
 * One row per function, one cell per category within it — rows are
 * naturally ragged (functions have different category counts), which is
 * why this isn't a strict matrix table. Color is the status band; the
 * score is always printed on the cell too, so color is never the only
 * signal.
 */
export function MaturityHeatmap({ functions }: MaturityHeatmapProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Security Maturity Heatmap</h3>
      <div className="space-y-3">
        {functions.map((fn) => (
          <div key={fn.code} className="flex items-center gap-3">
            <div className="w-12 shrink-0 text-slate-300 text-sm font-medium">{fn.code}</div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {fn.children.map((category) => {
                const band = maturityBand(category.score.current);
                return (
                  <div
                    key={category.code}
                    title={`${category.label}: ${category.score.current.toFixed(1)} (${band.label})`}
                    className="flex flex-col items-center justify-center rounded px-2 py-1.5 min-w-[64px]"
                    style={{ backgroundColor: `${band.color}33`, border: `1px solid ${band.color}` }}
                  >
                    <span className="text-[10px] text-slate-300 leading-tight">{category.code}</span>
                    <span className="text-sm font-bold" style={{ color: band.color }}>
                      {category.score.current.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700 text-xs text-slate-400">
        {(
          [
            ['Critical', STATUS_COLORS.critical],
            ['Serious', STATUS_COLORS.serious],
            ['Warning', STATUS_COLORS.warning],
            ['Good', STATUS_COLORS.good],
          ] as const
        ).map(([label, color]) => {
          return (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: color }} />
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
