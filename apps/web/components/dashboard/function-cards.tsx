import type { FunctionMaturity } from '@cmmp/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function FunctionCards({ functions }: { functions: FunctionMaturity[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {functions.map((fn) => (
        <Card key={fn.code}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{fn.name}</span>
              <span className="text-xs font-normal text-slate-500">{fn.code}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-white">{fn.currentMaturity.toFixed(1)}</span>
              <span className="text-sm text-slate-500">/ {fn.targetMaturity.toFixed(1)} target</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.min(100, (fn.currentMaturity / 5) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{fn.completionPercentage}% assessed</span>
              {fn.highRiskGaps > 0 && <Badge variant="high">{fn.highRiskGaps} high-risk gap{fn.highRiskGaps === 1 ? '' : 's'}</Badge>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
