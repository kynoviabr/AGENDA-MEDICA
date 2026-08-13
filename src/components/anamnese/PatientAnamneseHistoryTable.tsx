import { BrandButton } from '@/components/ui/brand-button';
import { AnamneseStatusBadge } from './AnamneseStatusBadge';
import DocumentUploadAction from './DocumentUploadAction';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, CheckCircle, Archive, Pencil } from 'lucide-react';

const sourceLabels: Record<string, string> = {
  digital: 'Digital',
  portal: 'Portal',
  manual_upload: 'Upload',
  internal_manual: 'Interno',
};

interface Props {
  anamneses: any[];
  patientId: string;
  onValidate: (id: string) => void;
  onArchive: (id: string) => void;
  onEdit?: (anamnese: any) => void;
  onView?: (anamnese: any) => void;
}

function fmtShort(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yy', { locale: ptBR });
}

export default function PatientAnamneseHistoryTable({ anamneses, patientId, onValidate, onArchive, onEdit, onView }: Props) {
  if (anamneses.length === 0) return null;

  return (
    <div className="rounded-xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs">Nº</TableHead>
            <TableHead className="text-xs">Criação</TableHead>
            <TableHead className="text-xs">Preenchida</TableHead>
            <TableHead className="text-xs">Vencimento</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Origem</TableHead>
            <TableHead className="text-xs">Doc</TableHead>
            <TableHead className="text-xs text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {anamneses.map((a: any) => (
            <TableRow key={a.id} className={a.is_current ? 'bg-primary/[0.03]' : ''}>
              <TableCell className="text-xs font-mono font-medium">{a.anamnese_number}</TableCell>
              <TableCell className="text-xs">{fmtShort(a.created_at)}</TableCell>
              <TableCell className="text-xs">{fmtShort(a.filled_at)}</TableCell>
              <TableCell className="text-xs">{fmtShort(a.expires_at)}</TableCell>
              <TableCell><AnamneseStatusBadge status={a.status} /></TableCell>
              <TableCell className="text-xs">{sourceLabels[a.source_type] || a.source_type}</TableCell>
              <TableCell>
                {a.document_url ? (
                  <BrandButton size="sm" variant="outline" className="h-7 px-2" onClick={() => window.open(a.document_url, '_blank')}>
                    <Eye className="w-3 h-3" />
                  </BrandButton>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {onView && (
                    <BrandButton size="sm" variant="outline" className="h-7 px-2" onClick={() => onView(a)} title="Ver detalhes">
                      <Eye className="w-3 h-3" />
                    </BrandButton>
                  )}
                  {onEdit && !['archived', 'cancelled'].includes(a.status) && (
                    <BrandButton size="sm" variant="outline" className="h-7 px-2" onClick={() => onEdit(a)} title="Editar">
                      <Pencil className="w-3 h-3" />
                    </BrandButton>
                  )}
                  <DocumentUploadAction anamneseId={a.id} patientId={patientId} size="sm" />
                  {!['validated', 'archived', 'cancelled'].includes(a.status) && (
                    <BrandButton size="sm" variant="outline" className="h-7 px-2" onClick={() => onValidate(a.id)}>
                      <CheckCircle className="w-3 h-3" />
                    </BrandButton>
                  )}
                  {!['archived', 'cancelled'].includes(a.status) && (
                    <BrandButton size="sm" variant="outline" className="h-7 px-2" onClick={() => onArchive(a.id)}>
                      <Archive className="w-3 h-3" />
                    </BrandButton>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
