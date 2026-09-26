import Link from 'next/link';
import React, { useMemo } from 'react';

import { isInitiativeOverdue, strategicStatusColor } from '../../lib/strategic-plan';

interface TimelineInitiative {
  id: string;
  code: string;
  title: string;
  status: string;
  percentComplete: number;
  startDate: string | null;
  targetDate: string | null;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * A lightweight CSS-grid Gantt (no charting library draws this shape) -- each row is a two-column
 * grid line (label, track) so every row's track aligns to the exact same horizontal scale as the
 * month-header row above it, without the calc()-mixing-% -and-rem bugs a flex/absolute-overlay
 * version of a "now" line would invite. Overdue bars get a dashed red outline instead, which
 * answers the same "spot it quickly" need without that complexity.
 */
export function StrategicTimeline({ initiatives }: { initiatives: TimelineInitiative[] }) {
  const scheduled = useMemo(() => initiatives.filter((i) => i.startDate && i.targetDate), [initiatives]);

  const { rangeStart, totalMonths, monthLabels } = useMemo(() => {
    const now = new Date();
    if (scheduled.length === 0) {
      return { rangeStart: new Date(now.getFullYear(), now.getMonth(), 1), totalMonths: 6, monthLabels: [] as string[] };
    }
    const starts = scheduled.map((i) => new Date(i.startDate!));
    const ends = scheduled.map((i) => new Date(i.targetDate!));
    const minStart = new Date(Math.min(...starts.map((d) => d.getTime()), now.getTime()));
    const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime()), now.getTime()));
    const start = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
    const end = new Date(maxEnd.getFullYear(), maxEnd.getMonth() + 1, 1);
    const months = Math.max(1, monthsBetween(start, end));
    const labels = Array.from({ length: months }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });
    return { rangeStart: start, totalMonths: months, monthLabels: labels };
  }, [scheduled]);

  if (scheduled.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-white font-semibold mb-2">Roadmap Timeline</h3>
        <p className="text-sm text-slate-500">No initiatives have both a start and target date yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 overflow-x-auto">
      <h3 className="text-white font-semibold mb-4">Roadmap Timeline</h3>
      <div
        className="grid gap-x-3 gap-y-2 items-center"
        style={{ gridTemplateColumns: `13rem repeat(${totalMonths}, minmax(56px, 1fr))`, minWidth: `${13 + totalMonths * 3.5}rem` }}
      >
        <div />
        {monthLabels.map((label, i) => (
          <div key={i} className="text-center text-xs text-slate-500 border-b border-slate-700 pb-2">
            {label}
          </div>
        ))}

        {scheduled.map((initiative) => {
          const start = new Date(initiative.startDate!);
          const end = new Date(initiative.targetDate!);
          const startCol = Math.max(1, monthsBetween(rangeStart, start) + 1);
          const spanMonths = Math.max(1, monthsBetween(start, end) + 1);
          const overdue = isInitiativeOverdue(initiative.status, initiative.targetDate);
          const color = strategicStatusColor(initiative.status);

          return (
            <React.Fragment key={initiative.id}>
              <Link
                href={`/strategic-plan/${initiative.id}`}
                className="truncate text-sm text-slate-300 hover:text-white transition-colors"
                title={`${initiative.code} — ${initiative.title}`}
              >
                {initiative.code} — {initiative.title}
              </Link>
              <div
                className="relative h-6 rounded flex items-center px-1.5 overflow-hidden"
                style={{
                  gridColumn: `${startCol + 1} / span ${spanMonths}`,
                  backgroundColor: `${color}26`,
                  border: overdue ? '1px dashed #e66767' : `1px solid ${color}`,
                }}
                title={`${initiative.percentComplete}% complete${overdue ? ' — overdue' : ''}`}
              >
                <div className="h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${initiative.percentComplete}%`, backgroundColor: color }} />
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-4">Dashed red outline = past its target date and not yet completed or cancelled.</p>
    </div>
  );
}
