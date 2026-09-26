import React from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StrategicMonthlyTrendPoint } from '../../lib/api';
import { SERIES_COLORS } from '../../lib/maturity-scale';

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function StrategicTrendChart({ series }: { series: StrategicMonthlyTrendPoint[] }) {
  const data = series.map((point) => ({ month: formatMonth(point.month), Actual: point.actual, Planned: point.planned ?? undefined }));

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Monthly Progress: Planned vs Actual</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -12 }}>
            <CartesianGrid stroke="#2c2c2a" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#898781', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#898781', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1a1a19', border: '1px solid #383835', color: '#ffffff' }} />
            <Legend wrapperStyle={{ color: '#c3c2b7' }} />
            <Line type="monotone" dataKey="Actual" stroke={SERIES_COLORS.current} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line
              type="monotone"
              dataKey="Planned"
              stroke={SERIES_COLORS.target}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
