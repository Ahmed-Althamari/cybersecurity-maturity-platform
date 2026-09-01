import type { FunctionMaturity } from '@cmmp/shared';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function GapBarChart({ functions }: { functions: FunctionMaturity[] }) {
  const data = functions.map((fn) => ({
    function: fn.code,
    Current: fn.currentMaturity,
    Target: fn.targetMaturity,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maturity Gap by Function</CardTitle>
        <CardDescription>Where current maturity falls short of target</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="function" tick={{ fill: '#cbd5e1', fontSize: 13 }} />
              <YAxis domain={[0, 5]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              <Bar dataKey="Current" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Target" fill="#f59e0b" radius={[4, 4, 0, 0]} fillOpacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
