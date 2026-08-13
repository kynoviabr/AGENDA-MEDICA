import { cn } from '@/lib/utils';

/**
 * Stripe-style role chip. Soft bg + dark text, no colored borders.
 */
const roleConfig: Record<string, { label: string; className: string }> = {
  admin:        { label: 'Admin',         className: 'bg-primary-light text-primary-dark' },
  sales:        { label: 'Vendas',        className: 'bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]' },
  professional: { label: 'Profissional',  className: 'bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]' },
  receptionist: { label: 'Recepção',      className: 'bg-bg-subtle text-[hsl(var(--text-secondary))]' },
  owner:        { label: 'Proprietário',  className: 'bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]' },
};

interface RoleBadgeProps {
  role: string;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = roleConfig[role] || {
    label: role,
    className: 'bg-bg-subtle text-[hsl(var(--text-secondary))]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-semibold leading-5',
        config.className,
        className
      )}
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
