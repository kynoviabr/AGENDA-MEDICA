import type { LucideIcon } from 'lucide-react';

type AgendaStatCardProps = {
  value: number;
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

const tones = {
  default: 'bg-primary/8 text-primary',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
};

export function AgendaStatCard({ value, label, icon: Icon, tone = 'default' }: AgendaStatCardProps) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>
        <p className="mt-1.5 text-xs leading-tight text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

