import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { AnamneseStatusBadge } from './AnamneseStatusBadge';
import DocumentUploadAction from './DocumentUploadAction';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Eye, CheckCircle, Archive, Calendar, Hash, Clock, User as UserIcon, Paperclip, Pencil } from 'lucide-react';

const sourceLabels: Record<string, string> = {
  digital: 'Digital',
  portal: 'Portal',
  manual_upload: 'Upload manual',
  internal_manual: 'Interno',
};

interface Props {
  anamnese: any;
  patientId: string;
  onValidate: (id: string) => void;
  onArchive: (id: string) => void;
  onEdit?: (anamnese: any) => void;
  onView?: (anamnese: any) => void;
  validating?: boolean;
  archiving?: boolean;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function fmtDateShort(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR });
}

export default function CurrentAnamneseCard({ anamnese, patientId, onValidate, onArchive, onEdit, onView, validating, archiving }: Props) {
  const a = anamnese;

  return (
    <Card className="shadow-card border-primary/20 bg-gradient-to-br from-background to-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Anamnese Vigente
          </CardTitle>
          <AnamneseStatusBadge status={a.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />Número</p>
            <p className="font-medium text-foreground">{a.anamnese_number}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Criada em</p>
            <p className="font-medium text-foreground">{fmtDateShort(a.created_at)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Preenchida em</p>
            <p className="font-medium text-foreground">{fmtDate(a.filled_at)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Vencimento</p>
            <p className="font-medium text-foreground">{fmtDateShort(a.expires_at)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Validade</p>
            <p className="font-medium text-foreground">{a.validity_days} dias</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><UserIcon className="w-3 h-3" />Origem</p>
            <p className="font-medium text-foreground">{sourceLabels[a.source_type] || a.source_type}</p>
          </div>
        </div>

        {a.document_url && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-sm">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1 text-foreground">{a.document_name || 'Documento'}</span>
            <BrandButton size="sm" variant="outline" onClick={() => window.open(a.document_url, '_blank')}>
              <Eye className="w-3 h-3" /> Ver
            </BrandButton>
          </div>
        )}

        {a.notes && (
          <p className="text-sm text-muted-foreground border-t pt-3">{a.notes}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {onView && (
            <BrandButton size="sm" variant="outline" onClick={() => onView(a)}>
              <Eye className="w-3.5 h-3.5" /> Detalhes
            </BrandButton>
          )}
          {onEdit && !['archived', 'cancelled'].includes(a.status) && (
            <BrandButton size="sm" variant="outline" onClick={() => onEdit(a)}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </BrandButton>
          )}
          <DocumentUploadAction anamneseId={a.id} patientId={patientId} />
          {!['validated', 'archived', 'cancelled'].includes(a.status) && (
            <BrandButton size="sm" variant="outline" onClick={() => onValidate(a.id)} disabled={validating}>
              <CheckCircle className="w-3.5 h-3.5" /> Validar
            </BrandButton>
          )}
          {!['archived', 'cancelled'].includes(a.status) && (
            <BrandButton size="sm" variant="outline" onClick={() => onArchive(a.id)} disabled={archiving}>
              <Archive className="w-3.5 h-3.5" /> Arquivar
            </BrandButton>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
