import React from 'react';

import type { GapAnalysisEntry } from '../../lib/api';
import { riskLevelColor } from '../../lib/maturity-scale';

interface TopGapsTableProps {
  gaps: GapAnalysisEntry[];
}

export function TopGapsTable({ gaps }: TopGapsTableProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Top {gaps.length} Maturity Gaps</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 pr-4">Function</th>
              <th className="pb-2 pr-4">Current</th>
              <th className="pb-2 pr-4">Target</th>
              <th className="pb-2 pr-4">Gap</th>
              <th className="pb-2 pr-4">Risk</th>
              <th className="pb-2">Affected Controls</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={gap.functionCode} className="border-b border-slate-700/50 last:border-0">
                <td className="py-2.5 pr-4 text-white font-medium">{gap.functionName}</td>
                <td className="py-2.5 pr-4 text-slate-300">{gap.currentMaturity.toFixed(2)}</td>
                <td className="py-2.5 pr-4 text-slate-300">{gap.targetMaturity.toFixed(2)}</td>
                <td className="py-2.5 pr-4 text-white font-semibold">{gap.gap.toFixed(2)}</td>
                <td className="py-2.5 pr-4">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ color: riskLevelColor(gap.riskLevel), backgroundColor: `${riskLevelColor(gap.riskLevel)}22` }}
                  >
                    {gap.riskLevel}
                  </span>
                </td>
                <td className="py-2.5 text-slate-300">{gap.affectedControls}</td>
              </tr>
            ))}
            {gaps.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No gaps recorded for this assessment yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
