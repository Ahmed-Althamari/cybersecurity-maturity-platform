import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { FunctionMaturity } from '../../lib/api';
import { maturityBand } from '../../lib/maturity-scale';

interface FunctionGapBarChartProps {
  functions: FunctionMaturity[];
}

export function FunctionGapBarChart({ functions }: FunctionGapBarChartProps) {
  const data = [...functions]
    .sort((a, b) => b.gap - a.gap)
    .map((fn) => ({ code: fn.code, gap: fn.gap, currentMaturity: fn.currentMaturity }));

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Maturity Gap by Function</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid stroke="#2c2c2a" horizontal={false} />
            <XAxis type="number" domain={[0, 5]} tick={{ fill: '#898781', fontSize: 11 }} />
            <YAxis type="category" dataKey="code" tick={{ fill: '#c3c2b7', fontSize: 13 }} width={40} />
            <Tooltip
              contentStyle={{ background: '#1a1a19', border: '1px solid #383835', color: '#ffffff' }}
              formatter={(value: number) => [value.toFixed(2), 'Gap']}
            />
            <Bar dataKey="gap" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                // Colored by the function's actual current maturity band (low current maturity -> more severe), not by the bar's own length — the axis already shows that.
                <Cell key={entry.code} fill={maturityBand(entry.currentMaturity).color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
