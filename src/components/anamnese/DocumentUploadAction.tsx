import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BrandButton } from '@/components/ui/brand-button';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';

interface Props {
  anamneseId: string;
  patientId: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'outline' | 'primary' | 'ghost';
}

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function DocumentUploadAction({ anamneseId, patientId, size = 'sm', variant = 'outline' }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Arquivo excede o limite de 10MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${patientId}/${anamneseId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('patient-anamneses').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('patient-anamneses').getPublicUrl(path);

      const { error: dbErr } = await supabase.from('patient_anamneses').update({
        document_url: publicUrl,
        document_name: file.name,
        document_mime_type: file.type,
        document_uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id,
      } as any).eq('id', anamneseId);
      if (dbErr) throw dbErr;

      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      toast.success('Documento anexado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} className="hidden" />
      <BrandButton size={size} variant={variant} onClick={() => ref.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {uploading ? 'Enviando...' : 'Anexar'}
      </BrandButton>
    </>
  );
}
