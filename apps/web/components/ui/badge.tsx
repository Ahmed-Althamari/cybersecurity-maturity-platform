import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-slate-700 text-slate-200',
      critical: 'bg-red-950 text-red-300 border border-red-800',
      high: 'bg-orange-950 text-orange-300 border border-orange-800',
      medium: 'bg-yellow-950 text-yellow-300 border border-yellow-800',
      low: 'bg-blue-950 text-blue-300 border border-blue-800',
      minimal: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const RISK_LEVEL_VARIANT: Record<string, BadgeProps['variant']> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  MINIMAL: 'minimal',
};

export function RiskLevelBadge({ level }: { level: string }) {
  return <Badge variant={RISK_LEVEL_VARIANT[level] ?? 'default'}>{level}</Badge>;
}
