import type { MaturityLevel } from '@cmmp/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Deliberately spelled out in scale order (not Object.entries' insertion
// order from the API, which isn't guaranteed) so the chart always reads
// low to high maturity, left to right.
const LEVEL_ORDER: MaturityLevel[] = [
  'NOT_APPLICABLE',
  'INITIAL',
  'DEVELOPING',
  'DEFINED',
  'MANAGED',
  'OPTIMISED',
] as MaturityLevel[];

const LEVEL_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'N/A',
  INITIAL: 'Initial',
  DEVELOPING: 'Developing',
  DEFINED: 'Defined',
  MANAGED: 'Managed',
  OPTIMISED: 'Optimised',
};

export function MaturityDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const data = LEVEL_ORDER.map((level) => ({
    level: LEVEL_LABEL[level] ?? level,
    count: distribution[level] ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maturity Distribution</CardTitle>
        <CardDescription>How many controls sit at each maturity level today</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="level" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="count" name="Controls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
