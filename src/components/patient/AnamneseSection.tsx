import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BrandButton } from '@/components/ui/brand-button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Eye, FileText, ClipboardEdit, AlertTriangle } from 'lucide-react';
import { format, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AnamnesisFormModal from './AnamnesisFormModal';

interface AnamneseSectionProps {
  patientId: string;
  clinicId: string;
}

export type AnamneseStatus = 'none' | 'valid' | 'expiring' | 'expired';

export function getAnamneseStatus(
  uploadedAt: string | null | undefined,
  validityDays: number
): AnamneseStatus {
  if (!uploadedAt) return 'none';
  const uploaded = new Date(uploadedAt);
  const expireDate = addDays(uploaded, validityDays);
  const now = new Date();
  const daysLeft = differenceInDays(expireDate, now);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'expiring';
  return 'valid';
}

export function AnamneseBadge({ status }: { status: AnamneseStatus }) {
  const config: Record<AnamneseStatus, { label: string; className: string }> = {
    none: { label: 'Sem anamnese', className: 'bg-muted text-muted-foreground' },
    valid: { label: 'Válida', className: 'bg-green-100 text-green-700' },
    expiring: { label: 'Próxima do vencimento', className: 'bg-yellow-100 text-yellow-700' },
    expired: { label: 'Vencida', className: 'bg-red-100 text-red-700' },
  };
  const c = config[status];
  return <Badge className={c.className}>{c.label}</Badge>;
}

/** Compact alert banner for use in appointments/sessions */
export function AnamneseAlert({ status, patientName }: { status: AnamneseStatus; patientName?: string }) {
  if (status === 'valid' || status === 'none') return null;
  
  const isExpired = status === 'expired';
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
      isExpired 
        ? 'bg-destructive/10 text-destructive border border-destructive/20' 
        : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
    }`}>
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {isExpired 
          ? `Anamnese vencida${patientName ? ` — ${patientName}` : ''}. Solicite atualização antes de prosseguir.`
          : `Anamnese próxima do vencimento${patientName ? ` — ${patientName}` : ''}.`
        }
      </span>
    </div>
  );
}

export default function AnamneseSection({ patientId, clinicId }: AnamneseSectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: anamnese } = useQuery({
    queryKey: ['patient-anamnese', patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('patient_anamneses' as any)
        .select('*')
        .eq('patient_id', patientId)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    enabled: !!patientId,
  });

  const { data: validityDays = 45 } = useQuery({
    queryKey: ['anamnese-validity', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clinic_settings' as any)
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', 'anamnese_validity_days')
        .maybeSingle();
      return data ? parseInt((data as any).value) || 45 : 45;
    },
    enabled: !!clinicId,
  });

  const status = getAnamneseStatus(anamnese?.uploaded_at, validityDays);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Tipo de arquivo inválido', description: 'Envie PDF ou imagem (JPG, PNG, WebP)', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const timestamp = Date.now();
      const filePath = `${clinicId}/${patientId}/docs/anamnese_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('patient-files').getPublicUrl(filePath);

      const validUntil = addDays(new Date(), validityDays);

      const { error: insertError } = await supabase.from('patient_anamneses' as any).insert({
        clinic_id: clinicId,
        patient_id: patientId,
        file_url: publicUrl,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id,
        valid_until: validUntil.toISOString().split('T')[0],
        status: 'valid',
      } as any);
      if (insertError) throw insertError;

      qc.invalidateQueries({ queryKey: ['patient-anamnese', patientId] });
      toast({ title: 'Anamnese enviada com sucesso!' });
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mt-6 pt-6 border-t">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" /> Anamnese
        </h4>
        <AnamneseBadge status={status} />
      </div>

      {/* Alert for expired/expiring */}
      {(status === 'expired' || status === 'expiring') && (
        <AnamneseAlert status={status} />
      )}

      {anamnese?.uploaded_at && (
        <p className="text-xs text-muted-foreground mb-3 mt-2">
          Último preenchimento: {format(new Date(anamnese.uploaded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          {anamnese.valid_until && (
            <span className="ml-2">• Válida até: {format(new Date(anamnese.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        <BrandButton variant="outline" size="sm" onClick={() => setFormOpen(true)}>
          <ClipboardEdit className="w-3 h-3" /> Preencher digitalmente
        </BrandButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
        />
        <BrandButton variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-3 h-3" /> {uploading ? 'Enviando...' : 'Upload de documento'}
        </BrandButton>
        {anamnese?.file_url && (
          <BrandButton variant="outline" size="sm" onClick={() => window.open(anamnese.file_url, '_blank')}>
            <Eye className="w-3 h-3" /> Visualizar documento
          </BrandButton>
        )}
      </div>

      <AnamnesisFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        patientId={patientId}
        clinicId={clinicId}
        validityDays={validityDays}
      />
    </div>
  );
}
