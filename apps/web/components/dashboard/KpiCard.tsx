import React from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  accentColor?: string;
  subtitle?: string;
}

export function KpiCard({ title, value, accentColor, subtitle }: KpiCardProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <p className="text-slate-400 text-sm mb-2">{title}</p>
      <p className="text-3xl font-bold" style={accentColor ? { color: accentColor } : { color: '#ffffff' }}>
        {value}
      </p>
      {subtitle && <p className="text-slate-500 text-xs mt-2">{subtitle}</p>}
    </div>
  );
}
