import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { FunctionMaturity } from '@cmmp/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function MaturityRadarChart({ functions }: { functions: FunctionMaturity[] }) {
  const data = functions.map((fn) => ({
    function: fn.code,
    Current: fn.currentMaturity,
    Target: fn.targetMaturity,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maturity by Function</CardTitle>
        <CardDescription>Current vs. target maturity across all NIST CSF functions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="75%">
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="function" tick={{ fill: '#cbd5e1', fontSize: 13 }} />
              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Radar name="Current" dataKey="Current" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
              <Radar name="Target" dataKey="Target" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
