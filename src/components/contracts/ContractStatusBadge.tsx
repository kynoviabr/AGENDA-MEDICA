import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';

export const processStatusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  pending_upload: { label: 'Gerado', badge: 'draft' },
  pending_confirmation: { label: 'Assinado Recebido', badge: 'pending' },
  overdue: { label: 'Revisar Documento', badge: 'overdue' },
  confirmed: { label: 'Ativo', badge: 'approved' },
  cancelled: { label: 'Cancelado', badge: 'cancelled' },
};

export function ContractStatusBadge({ status }: { status: string }) {
  const sm = processStatusMap[status] || { label: status, badge: 'default' as BadgeStatus };
  return <BrandBadge status={sm.badge}>{sm.label}</BrandBadge>;
}
