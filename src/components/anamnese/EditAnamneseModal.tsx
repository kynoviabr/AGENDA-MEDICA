import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anamnese: any;
  patientId: string;
}

const sourceOptions = [
  { value: 'digital', label: 'Digital' },
  { value: 'portal', label: 'Portal do paciente' },
  { value: 'manual_upload', label: 'Upload manual' },
  { value: 'internal_manual', label: 'Preenchimento interno' },
];

export default function EditAnamneseModal({ open, onOpenChange, anamnese, patientId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    description: '',
    source_type: 'digital',
    validity_days: '180',
    notes: '',
  });

  useEffect(() => {
    if (anamnese && open) {
      setForm({
        title: anamnese.title || '',
        description: anamnese.description || '',
        source_type: anamnese.source_type || 'digital',
        validity_days: String(anamnese.validity_days || 180),
        notes: anamnese.notes || '',
      });
    }
  }, [anamnese, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const validityDays = parseInt(form.validity_days);
      if (!validityDays || validityDays < 1) throw new Error('Validade deve ser no mínimo 1 dia');
      const { error } = await supabase.from('patient_anamneses').update({
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        source_type: form.source_type,
        validity_days: validityDays,
        notes: form.notes.trim() || null,
        updated_by: user?.id,
      } as any).eq('id', anamnese.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast.success('Anamnese atualizada!');
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao atualizar'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Anamnese — {anamnese?.anamnese_number}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Anamnese inicial" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sourceOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validade (dias)</Label>
              <Input type="number" min="1" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</BrandButton>
            <BrandButton type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
