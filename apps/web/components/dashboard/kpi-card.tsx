import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  hint?: string;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'text-white',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  success: 'text-emerald-400',
};

export function KpiCard({ label, value, tone = 'neutral', hint }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="mb-2 text-sm text-slate-400">{label}</p>
        <p className={cn('text-3xl font-bold', TONE_CLASSES[tone])}>{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}
