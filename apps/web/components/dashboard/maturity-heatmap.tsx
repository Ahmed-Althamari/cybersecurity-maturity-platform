import type { MaturityHeatmap as MaturityHeatmapData } from '@cmmp/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const RISK_CELL_CLASS: Record<string, string> = {
  CRITICAL: 'bg-red-900/80 border-red-700 text-red-100',
  HIGH: 'bg-orange-900/80 border-orange-700 text-orange-100',
  MEDIUM: 'bg-yellow-900/80 border-yellow-700 text-yellow-100',
  LOW: 'bg-blue-900/80 border-blue-700 text-blue-100',
  MINIMAL: 'bg-emerald-900/80 border-emerald-700 text-emerald-100',
};

export function MaturityHeatmap({ heatmap }: { heatmap: MaturityHeatmapData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Maturity Heatmap</CardTitle>
        <CardDescription>
          Every category, colored by gap severity -- darker red means further from target
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {heatmap.functions.map((fn) => (
          <div key={fn.id}>
            <p className="mb-2 text-sm font-medium text-slate-300">
              {fn.code} &middot; {fn.name}
              {fn.currentScore !== null && fn.targetScore !== null && (
                <span className="ml-2 text-xs text-slate-500">
                  {fn.currentScore.toFixed(1)} / {fn.targetScore.toFixed(1)}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {fn.categories.map((category) => (
                <div
                  key={category.id}
                  title={`${category.code} ${category.name}: current ${category.currentScore?.toFixed(1) ?? 'n/a'}, target ${category.targetScore?.toFixed(1) ?? 'n/a'}, gap ${category.gap?.toFixed(1) ?? 'n/a'}`}
                  className={`min-w-[110px] flex-1 rounded-md border p-2 text-xs ${RISK_CELL_CLASS[category.riskLevel] ?? 'bg-slate-800 border-slate-700 text-slate-300'}`}
                >
                  <p className="font-semibold">{category.code}</p>
                  <p className="truncate opacity-90">{category.name}</p>
                  <p className="mt-1 opacity-75">
                    {category.currentScore !== null ? category.currentScore.toFixed(1) : '—'} /{' '}
                    {category.targetScore !== null ? category.targetScore.toFixed(1) : '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
