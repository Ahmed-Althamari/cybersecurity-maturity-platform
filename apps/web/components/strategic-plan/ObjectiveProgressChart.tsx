import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StrategicObjectiveProgress } from '../../lib/api';
import { SERIES_COLORS } from '../../lib/maturity-scale';

export function ObjectiveProgressChart({ objectives }: { objectives: StrategicObjectiveProgress[] }) {
  const data = objectives.map((o) => ({ name: o.objective, Progress: o.progress, count: o.count }));

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Progress by Strategic Objective</h3>
      <div style={{ height: Math.max(160, data.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 12 }}>
            <CartesianGrid stroke="#2c2c2a" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#898781', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fill: '#c3c2b7', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1a1a19', border: '1px solid #383835', color: '#ffffff' }}
              formatter={(value, _name, entry) => {
                const count = (entry?.payload as { count?: number } | undefined)?.count ?? 0;
                return [`${value}% (${count} initiative${count === 1 ? '' : 's'})`, 'Progress'];
              }}
            />
            <Bar dataKey="Progress" fill={SERIES_COLORS.current} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
