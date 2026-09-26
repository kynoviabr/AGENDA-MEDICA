import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Pencil, Plus, Stethoscope } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Service = Database['public']['Tables']['treatments']['Row'];

type ServiceForm = {
  name: string;
  description: string;
  category_id: string;
  duration_minutes: string;
  default_price: string;
  requires_evaluation: boolean;
  show_price_to_patient: boolean;
  show_price_to_ai: boolean;
  can_be_scheduled_by_ai: boolean;
  can_be_scheduled_online: boolean;
  is_active: boolean;
};

const emptyForm: ServiceForm = {
  name: '', description: '', category_id: 'none', duration_minutes: '30', default_price: '',
  requires_evaluation: false, show_price_to_patient: false, show_price_to_ai: false,
  can_be_scheduled_by_ai: true, can_be_scheduled_online: true, is_active: true,
};

export default function ServicesPage({ embedded = false, readOnly = false }: { embedded?: boolean; readOnly?: boolean }) {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const canEdit = !readOnly && role === 'admin';

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['active-services', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatments').select('*').eq('clinic_id', clinicId!).order('name');
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!clinicId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['service-categories', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('treatment_categories').select('id,name').eq('clinic_id', clinicId!).eq('status', 'active').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !form.name.trim()) throw new Error('Informe o nome do serviço.');
      const payload = {
        clinic_id: clinicId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id === 'none' ? null : form.category_id,
        duration_minutes: Math.max(5, Number(form.duration_minutes) || 30),
        default_price: form.default_price ? Number(form.default_price) : null,
        price: form.default_price ? Number(form.default_price) : 0,
        requires_evaluation: form.requires_evaluation,
        show_price_to_patient: form.show_price_to_patient,
        show_price_to_ai: form.show_price_to_ai,
        can_be_scheduled_by_ai: form.can_be_scheduled_by_ai,
        can_be_scheduled_online: form.can_be_scheduled_online,
        is_active: form.is_active,
      };
      const query = editingId
        ? supabase.from('treatments').update(payload).eq('id', editingId).eq('clinic_id', clinicId)
        : supabase.from('treatments').insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['active-services', clinicId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: 'Serviço salvo' });
    },
    onError: (error: Error) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (service: Service) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description || '',
      category_id: service.category_id || 'none',
      duration_minutes: String(service.duration_minutes || 30),
      default_price: service.default_price == null ? '' : String(service.default_price),
      requires_evaluation: service.requires_evaluation,
      show_price_to_patient: service.show_price_to_patient,
      show_price_to_ai: service.show_price_to_ai,
      can_be_scheduled_by_ai: service.can_be_scheduled_by_ai,
      can_be_scheduled_online: service.can_be_scheduled_online,
      is_active: service.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      {!embedded && <PageHeader title="Serviços" description="Serviços disponíveis para recepção, agenda e IA" />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Duração e regras específicas por profissional continuam em Configurações → Regras.</p>
        {canEdit && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo serviço</Button>}
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Catálogo administrativo</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr><th className="p-3">Serviço</th><th className="p-3">Duração</th><th className="p-3">Agendamento</th><th className="p-3">Preço informado</th><th className="p-3">Status</th>{canEdit && <th className="p-3 text-right">Ações</th>}</tr>
              </thead>
              <tbody>
                {isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Carregando serviços...</td></tr>}
                {!isLoading && services.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Nenhum serviço cadastrado.</td></tr>}
                {services.map((service) => (
                  <tr key={service.id} className="border-b last:border-0">
                    <td className="p-3"><div className="font-medium">{service.name}</div>{service.description && <div className="max-w-md truncate text-xs text-muted-foreground">{service.description}</div>}</td>
                    <td className="p-3"><span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" />{service.duration_minutes} min</span></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1"><Badge variant="outline">{service.can_be_scheduled_by_ai ? 'IA habilitada' : 'IA bloqueada'}</Badge>{service.requires_evaluation && <Badge variant="outline">Avaliação prévia</Badge>}</div></td>
                    <td className="p-3">{service.show_price_to_patient || service.show_price_to_ai ? (service.default_price == null ? 'Sem valor' : `R$ ${Number(service.default_price).toFixed(2)}`) : 'Oculto'}</td>
                    <td className="p-3"><Badge variant={service.is_active ? 'default' : 'secondary'}>{service.is_active ? 'Ativo' : 'Inativo'}</Badge></td>
                    {canEdit && <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => openEdit(service)}><Pencil className="h-4 w-4" /></Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? 'Editar serviço' : 'Novo serviço'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Descrição administrativa</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Categoria</Label><Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Duração padrão (min)</Label><Input type="number" min="5" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
            <div className="space-y-2"><Label>Preço particular padrão</Label><Input type="number" min="0" step="0.01" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} /></div>
            <div className="space-y-3 rounded-lg border p-3 md:col-span-2">
              {([
                ['requires_evaluation', 'Exige avaliação prévia'],
                ['can_be_scheduled_by_ai', 'Pode ser agendado pela IA'],
                ['can_be_scheduled_online', 'Pode ser agendado online'],
                ['show_price_to_ai', 'IA pode informar preço'],
                ['show_price_to_patient', 'Exibir preço ao paciente'],
                ['is_active', 'Serviço ativo'],
              ] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3"><Label>{label}</Label><Switch checked={form[key]} onCheckedChange={(checked) => setForm({ ...form, [key]: checked })} /></div>)}
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><CheckCircle2 className="mr-2 h-4 w-4" />Salvar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
