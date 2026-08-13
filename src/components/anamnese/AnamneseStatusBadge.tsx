import { Badge } from '@/components/ui/badge';

export type AnamneseStatusType = 'valid' | 'expired' | 'pending' | 'none' | 'in_progress' | 'filled' | 'validated' | 'cancelled' | 'archived';

/**
 * Stripe-style anamnese status badge. Soft bg + dark text, no colored borders.
 */
const statusConfig: Record<string, { label: string; className: string }> = {
  valid:       { label: 'Válida',       className: 'bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]' },
  validated:   { label: 'Validada',     className: 'bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]' },
  filled:      { label: 'Preenchida',   className: 'bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]' },
  expired:     { label: 'Vencida',      className: 'bg-[hsl(var(--danger-bg))] text-[hsl(var(--danger-text))]' },
  pending:     { label: 'Pendente',     className: 'bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]' },
  in_progress: { label: 'Em andamento', className: 'bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]' },
  cancelled:   { label: 'Cancelada',    className: 'bg-bg-subtle text-[hsl(var(--text-secondary))]' },
  archived:    { label: 'Arquivada',    className: 'bg-bg-subtle text-[hsl(var(--text-secondary))]' },
  none:        { label: 'Sem anamnese', className: 'bg-[hsl(var(--danger-bg))] text-[hsl(var(--danger-text))]' },
};

export function AnamneseStatusBadge({ status }: { status: string | null | undefined }) {
  const key = status || 'none';
  const config = statusConfig[key] || statusConfig.none;
  return (
    <Badge variant="outline" className={`${config.className} border-0`}>
      {config.label}
    </Badge>
  );
}
