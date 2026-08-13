import { AlertTriangle, FileText, Plus } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AnamneseAlertBannerProps {
  status: string | null | undefined;
  expiresAt?: string | null;
  patientId?: string;
  patientName?: string;
  showActions?: boolean;
}

export function AnamneseAlertBanner({ status, expiresAt, patientId, patientName, showActions = true }: AnamneseAlertBannerProps) {
  const navigate = useNavigate();

  if (status === 'valid' || !status) return null;
  if (status !== 'none' && status !== 'expired' && status !== 'pending') return null;

  const config = {
    none: {
      message: `Atenção: ${patientName ? `${patientName} não` : 'este paciente não'} possui anamnese cadastrada.`,
      className: 'bg-muted/60 text-muted-foreground border border-border',
      iconClass: 'text-muted-foreground',
    },
    expired: {
      message: `Atenção: a anamnese ${patientName ? `de ${patientName} ` : 'deste paciente '}está vencida${expiresAt ? ` desde ${format(new Date(expiresAt), 'dd/MM/yyyy', { locale: ptBR })}` : ''}.`,
      className: 'bg-destructive/10 text-destructive border border-destructive/20',
      iconClass: 'text-destructive',
    },
    pending: {
      message: `Atenção: ${patientName ? `${patientName} possui` : 'este paciente possui'} anamnese pendente ou incompleta.`,
      className: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
      iconClass: 'text-yellow-600',
    },
  };

  const c = config[status as keyof typeof config];
  if (!c) return null;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm ${c.className}`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${c.iconClass}`} />
      <div className="flex-1">
        <p>{c.message}</p>
        {showActions && patientId && (
          <div className="flex gap-2 mt-2">
            <BrandButton
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => navigate(`/clinic/patients/${patientId}?tab=anamnese`)}
            >
              <FileText className="w-3 h-3" /> Ir para Anamnese
            </BrandButton>
            <BrandButton
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => navigate(`/clinic/patients/${patientId}?tab=anamnese&action=new`)}
            >
              <Plus className="w-3 h-3" /> Criar nova anamnese
            </BrandButton>
          </div>
        )}
      </div>
    </div>
  );
}
