import type { LucideIcon } from 'lucide-react';

type AgendaStatCardProps = {
  value: number;
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

const tones = {
  default: 'bg-primary-light text-primary-dark',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

export function AgendaStatCard({ value, label, icon: Icon, tone = 'default' }: AgendaStatCardProps) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-xl border bg-card px-3.5 py-2 shadow-sm">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-none text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-tight text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
