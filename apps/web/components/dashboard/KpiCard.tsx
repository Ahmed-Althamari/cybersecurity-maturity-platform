import type { LucideIcon } from 'lucide-react';
import React from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  accentColor?: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** 0-100. When given, renders a slim meter bar under the value, filled in accentColor. */
  meterPercent?: number;
}

export function KpiCard({ title, value, accentColor, subtitle, icon: Icon, meterPercent }: KpiCardProps) {
  const color = accentColor ?? '#ffffff';
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-sm">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />}
      </div>
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      {subtitle && <p className="text-slate-500 text-xs mt-2">{subtitle}</p>}
      {meterPercent !== undefined && (
        <div className="mt-3 rounded-full bg-[#383835] overflow-hidden h-1.5">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, meterPercent))}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}
