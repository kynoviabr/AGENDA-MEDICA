import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  patientId: string;
  clinicId: string;
}

type AnamneseTemplate = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  active: boolean;
  basic_questions: string[];
  specific_questions: string[];
  notes: string;
};

const SETTINGS_KEY = 'anamnese_templates';

const sourceOptions = [
  { value: 'digital', label: 'Digital' },
  { value: 'portal', label: 'Portal do paciente' },
  { value: 'manual_upload', label: 'Upload manual' },
  { value: 'internal_manual', label: 'Preenchimento interno' },
];

export default function NewAnamneseModal({ open, onOpenChange, patientId, clinicId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    category_id: '',
    template_id: '',
    title: '',
    description: '',
    source_type: 'digital',
    filled_at: '',
    validity_days: '180',
    notes: '',
  });

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['clinic-settings', clinicId, SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_settings' as unknown)
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      if (!(data as { value?: string } | null)?.value) return [];
      try {
        const parsed = JSON.parse((data as { value: string }).value);
        return Array.isArray(parsed) ? parsed.filter((template: AnamneseTemplate) => template.active) as AnamneseTemplate[] : [];
      } catch {
        return [];
      }
    },
    enabled: open && !!clinicId,
  });

  const categories = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    templates.forEach((template) => {
      if (template.category_id && !byId.has(template.category_id)) {
        byId.set(template.category_id, { id: template.category_id, name: template.category_name || 'Tipo sem nome' });
      }
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [templates]);

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.category_id === form.category_id),
    [form.category_id, templates],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.template_id) || null,
    [form.template_id, templates],
  );

  useEffect(() => {
    if (!open) return;
    if (form.category_id || categories.length === 0) return;
    setForm((current) => ({ ...current, category_id: categories[0].id }));
  }, [categories, form.category_id, open]);

  useEffect(() => {
    if (!open || form.template_id || filteredTemplates.length === 0) return;
    const firstTemplate = filteredTemplates[0];
    setForm((current) => ({
      ...current,
      template_id: firstTemplate.id,
      title: current.title || firstTemplate.name,
      description: current.description || `Modelo ${firstTemplate.category_name}`,
    }));
  }, [filteredTemplates, form.template_id, open]);

  const handleCategoryChange = (categoryId: string) => {
    const firstTemplate = templates.find((template) => template.category_id === categoryId) || null;
    setForm((current) => ({
      ...current,
      category_id: categoryId,
      template_id: firstTemplate?.id || '',
      title: firstTemplate?.name || '',
      description: firstTemplate ? `Modelo ${firstTemplate.category_name}` : '',
    }));
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setForm((current) => ({
      ...current,
      template_id: templateId,
      title: template?.name || current.title,
      description: template ? `Modelo ${template.category_name}` : current.description,
    }));
  };

  const resetForm = () => {
    setForm({
      category_id: '',
      template_id: '',
      title: '',
      description: '',
      source_type: 'digital',
      filled_at: '',
      validity_days: '180',
      notes: '',
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const validityDays = parseInt(form.validity_days);
      if (!validityDays || validityDays < 1) throw new Error('Validade deve ser no mínimo 1 dia');
      if (templates.length > 0 && !form.category_id) throw new Error('Selecione o tipo de tratamento.');
      if (templates.length > 0 && !form.template_id) throw new Error('Selecione o modelo de anamnese.');
      const payload: Record<string, unknown> = {
        clinic_id: clinicId,
        patient_id: patientId,
        title: form.title.trim() || selectedTemplate?.name || null,
        description: form.description.trim() || (selectedTemplate ? `Modelo ${selectedTemplate.category_name}` : null),
        source_type: form.source_type,
        validity_days: validityDays,
        notes: form.notes.trim() || null,
        status: 'pending',
        created_by: user?.id,
        form_data: selectedTemplate ? {
          template_id: selectedTemplate.id,
          template_name: selectedTemplate.name,
          category_id: selectedTemplate.category_id,
          category_name: selectedTemplate.category_name,
          basic_questions: selectedTemplate.basic_questions,
          specific_questions: selectedTemplate.specific_questions,
          template_notes: selectedTemplate.notes,
        } : null,
      };
      if (form.filled_at) {
        payload.filled_at = new Date(form.filled_at).toISOString();
      }
      const { error } = await supabase.from('patient_anamneses').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast.success('Anamnese criada com sucesso!');
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao criar anamnese'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Anamnese</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          {templates.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo de tratamento *</Label>
                <Select value={form.category_id} onValueChange={handleCategoryChange} disabled={isLoadingTemplates}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo de anamnese *</Label>
                <Select value={form.template_id} onValueChange={handleTemplateChange} disabled={!form.category_id || filteredTemplates.length === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-secondary/30 p-3 text-sm text-muted-foreground">
              Nenhum modelo ativo configurado. Cadastre modelos em Configurações &gt; Anamnese para selecionar por tipo de tratamento.
            </div>
          )}

          {selectedTemplate && (
            <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{selectedTemplate.name}</p>
                <span className="text-xs text-muted-foreground">{selectedTemplate.category_name}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedTemplate.basic_questions.length} perguntas básicas + {selectedTemplate.specific_questions.length} perguntas específicas.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Anamnese inicial" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Descrição breve" />
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
            <Label>Data de preenchimento</Label>
            <Input type="datetime-local" value={form.filled_at} onChange={e => setForm({ ...form, filled_at: e.target.value })} />
            <p className="text-xs text-muted-foreground">Deixe em branco se ainda não foi preenchida</p>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</BrandButton>
            <BrandButton type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Criar Anamnese'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
