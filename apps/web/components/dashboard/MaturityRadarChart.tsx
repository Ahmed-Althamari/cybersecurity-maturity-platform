import React from 'react';
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { FunctionMaturity } from '../../lib/api';
import { SERIES_COLORS } from '../../lib/maturity-scale';

interface MaturityRadarChartProps {
  functions: FunctionMaturity[];
}

export function MaturityRadarChart({ functions }: MaturityRadarChartProps) {
  const data = functions.map((fn) => ({
    code: fn.code,
    Current: fn.currentMaturity,
    Target: fn.targetMaturity,
  }));

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Function Maturity — Current vs Target</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#383835" />
            <PolarAngleAxis dataKey="code" tick={{ fill: '#c3c2b7', fontSize: 13 }} />
            <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: '#898781', fontSize: 10 }} axisLine={false} tickCount={6} />
            <Radar name="Current" dataKey="Current" stroke={SERIES_COLORS.current} fill={SERIES_COLORS.current} fillOpacity={0.35} />
            <Radar name="Target" dataKey="Target" stroke={SERIES_COLORS.target} fill={SERIES_COLORS.target} fillOpacity={0.15} />
            <Legend wrapperStyle={{ color: '#c3c2b7' }} />
            <Tooltip contentStyle={{ background: '#1a1a19', border: '1px solid #383835', color: '#ffffff' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
