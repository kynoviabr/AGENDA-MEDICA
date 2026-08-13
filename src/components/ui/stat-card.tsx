import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: 'default' | 'primary' | 'accent' | 'success';
}

/**
 * Stripe-style metric card. Variants now map to soft tinted surfaces
 * — gradient is reserved for hero/marketing only.
 */
const variantStyles: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: 'bg-card border-border',
  primary: 'bg-primary-light border-[hsl(var(--primary)/0.18)]',
  accent: 'bg-[hsl(var(--accent)/0.08)] border-[hsl(var(--accent)/0.2)]',
  success: 'bg-[hsl(var(--success-bg))] border-[hsl(var(--success)/0.2)]',
};

const iconVariantStyles: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: 'bg-primary-light text-primary-dark',
  primary: 'bg-card text-primary-dark',
  accent: 'bg-card text-[hsl(var(--accent))]',
  success: 'bg-card text-[hsl(var(--success))]',
};

const valueColors: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary-dark',
  accent: 'text-foreground',
  success: 'text-[hsl(var(--success))]',
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = 'default' }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card border p-5 shadow-stripe-sm transition-all duration-200 ease-stripe',
        'hover:-translate-y-0.5 hover:shadow-stripe-md animate-fade-in',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-btn flex items-center justify-center', iconVariantStyles[variant])}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-semibold px-1.5 py-0.5 rounded-chip',
              trend.value >= 0
                ? 'bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]'
                : 'bg-[hsl(var(--danger-bg))] text-[hsl(var(--danger-text))]'
            )}
          >
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <p className="label-stripe mb-1.5">{title}</p>
      <p className={cn('font-heading text-3xl font-bold tracking-tight', valueColors[variant])}>{value}</p>
      {subtitle && <p className="text-xs mt-1 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
