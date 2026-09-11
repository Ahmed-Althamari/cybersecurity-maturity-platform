import React from 'react';

interface ChartDataTableProps {
  categories: string[];
  series: { name: string; values: number[] }[];
}

/** The real numbers behind a chart — only ever rendered for a chart that actually carries known
 * plotted data (an extracted workbook dashboard-sheet chart), never for an AutoViz/PandasAI
 * generated image, which has no recoverable structure to show here. */
export function ChartDataTable({ categories, series }: ChartDataTableProps) {
  const rowCount = Math.max(categories.length, ...series.map((s) => s.values.length), 0);

  return (
    <div className="overflow-x-auto mt-3 border-t border-slate-700 pt-3">
      <table className="w-full text-xs text-left text-slate-300">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="py-1.5 pr-4 font-medium text-slate-400">Category</th>
            {series.map((s) => (
              <th key={s.name} className="py-1.5 pr-4 font-medium text-slate-400">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className="border-b border-slate-800/60 last:border-0">
              <td className="py-1.5 pr-4">{categories[i] ?? '—'}</td>
              {series.map((s) => (
                <td key={s.name} className="py-1.5 pr-4">
                  {s.values[i] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
