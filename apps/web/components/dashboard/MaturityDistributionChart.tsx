import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { ScoredNode } from '../../lib/api';
import { maturityBand } from '../../lib/maturity-scale';

const LEVEL_LABELS = ['N/A', 'Initial', 'Developing', 'Defined', 'Managed', 'Optimised'];

interface MaturityDistributionChartProps {
  functions: ScoredNode[];
}

function collectLeafScores(nodes: ScoredNode[]): number[] {
  const scores: number[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      if (node.score.applicableCount > 0) {
        scores.push(node.score.current);
      }
      continue;
    }
    scores.push(...collectLeafScores(node.children));
  }
  return scores;
}

/** How many subcategories currently sit at each maturity level (0 = not applicable/no data, 1-5 = INITIAL..OPTIMISED). */
export function MaturityDistributionChart({ functions }: MaturityDistributionChartProps) {
  const leafScores = collectLeafScores(functions);
  const counts = [0, 0, 0, 0, 0, 0];
  for (const score of leafScores) {
    counts[Math.max(0, Math.min(5, Math.round(score)))]++;
  }

  const data = LEVEL_LABELS.slice(1).map((label, index) => ({
    level: label,
    count: counts[index + 1],
    score: index + 1,
  }));

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Maturity Distribution</h3>
      <p className="text-slate-500 text-xs mb-3">Number of subcategories at each maturity level ({leafScores.length} scored)</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -16 }}>
            <CartesianGrid stroke="#2c2c2a" vertical={false} />
            <XAxis dataKey="level" tick={{ fill: '#c3c2b7', fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: '#898781', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1a1a19', border: '1px solid #383835', color: '#ffffff' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.level} fill={maturityBand(entry.score).color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
