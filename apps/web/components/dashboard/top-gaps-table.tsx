import type { GapAnalysis } from '@cmmp/shared';

import { RiskLevelBadge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TopGapsTable({ gaps }: { gaps: GapAnalysis[] }) {
  const sorted = [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Gaps</CardTitle>
        <CardDescription>Functions with the largest current-to-target maturity gap</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500">No gaps to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Function</th>
                  <th className="py-2 pr-4 font-medium">Current</th>
                  <th className="py-2 pr-4 font-medium">Target</th>
                  <th className="py-2 pr-4 font-medium">Gap</th>
                  <th className="py-2 pr-4 font-medium">Risk</th>
                  <th className="py-2 font-medium">Affected Controls</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((gap) => (
                  <tr key={gap.functionCode} className="border-b border-slate-800 text-slate-200">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{gap.functionName}</span>{' '}
                      <span className="text-slate-500">({gap.functionCode})</span>
                    </td>
                    <td className="py-2 pr-4">{gap.currentMaturity.toFixed(1)}</td>
                    <td className="py-2 pr-4">{gap.targetMaturity.toFixed(1)}</td>
                    <td className="py-2 pr-4 font-semibold">{gap.gap.toFixed(1)}</td>
                    <td className="py-2 pr-4">
                      <RiskLevelBadge level={gap.riskLevel} />
                    </td>
                    <td className="py-2">{gap.affectedControls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
