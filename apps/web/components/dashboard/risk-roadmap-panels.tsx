import type { RiskSummary, RoadmapStatus } from '@cmmp/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskLevelBadge } from '@/components/ui/badge';

export function RiskSummaryPanel({ summary }: { summary: RiskSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Summary</CardTitle>
        <CardDescription>{summary.totalRisks} risk{summary.totalRisks === 1 ? '' : 's'} linked to this assessment</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.byRiskLevel)
            .filter(([, count]) => count > 0)
            .map(([level, count]) => (
              <div key={level} className="flex items-center gap-1.5">
                <RiskLevelBadge level={level} />
                <span className="text-sm text-slate-400">{count}</span>
              </div>
            ))}
        </div>
        <ul className="space-y-2">
          {summary.topRisks.slice(0, 5).map((risk) => (
            <li key={risk.id} className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 text-sm last:border-0">
              <div>
                <p className="font-medium text-slate-200">{risk.title}</p>
                <p className="text-xs text-slate-500">{risk.owner ?? 'Unassigned'} &middot; {risk.status}</p>
              </div>
              <RiskLevelBadge level={risk.riskLevel} />
            </li>
          ))}
          {summary.topRisks.length === 0 && <p className="text-sm text-slate-500">No risks recorded.</p>}
        </ul>
      </CardContent>
    </Card>
  );
}

export function RoadmapPanel({ status }: { status: RoadmapStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Remediation Roadmap</CardTitle>
        <CardDescription>{status.totalInitiatives} initiative{status.totalInitiatives === 1 ? '' : 's'} tracked</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm text-slate-300">
          {Object.entries(status.byStatus).map(([label, count]) => (
            <div key={label} className="rounded-md bg-slate-700/50 px-2.5 py-1">
              <span className="font-semibold text-white">{count}</span> {label.replace('_', ' ').toLowerCase()}
            </div>
          ))}
        </div>
        <ul className="space-y-2">
          {status.upcoming.slice(0, 5).map((initiative) => (
            <li key={initiative.id} className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 text-sm last:border-0">
              <div>
                <p className="font-medium text-slate-200">{initiative.title}</p>
                <p className="text-xs text-slate-500">{initiative.owner ?? 'Unassigned'} &middot; {initiative.status}</p>
              </div>
              {initiative.targetCompletionDate && (
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {new Date(initiative.targetCompletionDate).toLocaleDateString()}
                </span>
              )}
            </li>
          ))}
          {status.upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing upcoming.</p>}
        </ul>
      </CardContent>
    </Card>
  );
}
