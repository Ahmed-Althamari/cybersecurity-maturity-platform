import type { LucideIcon } from 'lucide-react';
import React from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** A blank list is a valid state, not a broken one — this makes that visually obvious instead of leaving a bare sentence floating in a box. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-10 border border-dashed border-slate-700 text-center">
      <Icon className="h-9 w-9 mx-auto text-slate-600" strokeWidth={1.5} />
      <p className="text-slate-300 font-medium mt-3">{title}</p>
      {description && <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
