import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Stethoscope, Trash2, DollarSign, Copy } from 'lucide-react';
import CombosTab from '@/components/treatments/CombosTab';

interface TreatmentForm {
  name: string;
  category_id: string;
  description: string;
  price: string;
  default_price: string;
  min_price: string;
  duration_minutes: string;
  num_sessions: string;
  renewal_enabled: boolean;
  renewal_trigger_days: string;
}

interface CostLineItem {
  id?: string;
  cost_item_id: string;
  quantity: string;
}

const emptyForm: TreatmentForm = {
  name: '', category_id: '', description: '', price: '',
  default_price: '', min_price: '', duration_minutes: '60', num_sessions: '1',
  renewal_enabled: true, renewal_trigger_days: '7',
};

interface TreatmentsPageProps {
  embedded?: boolean;
  readOnly?: boolean;
}

export default function TreatmentsPage({ embedded = false, readOnly = false }: TreatmentsPageProps = {}) {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TreatmentForm>(emptyForm);
  const [costLines, setCostLines] = useState<CostLineItem[]>([]);

  const isAdmin = role === 'admin';
  const canManage = isAdmin && !readOnly;

  const { data: treatments = [], isLoading } = useQuery({
    queryKey: ['treatments', clinicId, search, categoryFilter],
    queryFn: async () => {
      if (!clinicId) return [];
      let q = supabase.from('treatments').select('*, treatment_categories(name)').eq('clinic_id', clinicId).order('name');
      if (search) q = q.ilike('name', `%${search}%`);
      if (categoryFilter === 'uncategorized') {
        q = q.is('category_id', null);
      } else if (categoryFilter !== 'all') {
        q = q.eq('category_id', categoryFilter);
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['treatment-categories-active', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase.from('treatment_categories' as unknown).select('*').eq('clinic_id', clinicId).eq('status', 'active').order('name');
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  const { data: costItems = [] } = useQuery({
    queryKey: ['cost-items-active', clinicId],
    queryFn: async () => {
      if (!clinicId || !canManage) return [];
      const { data } = await supabase.from('cost_items' as unknown).select('*').eq('clinic_id', clinicId).eq('status', 'active').order('name');
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId && canManage,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: TreatmentForm) => {
      const payload: unknown = {
        name: data.name,
        category_id: data.category_id || null,
        description: data.description || null,
        price: parseFloat(data.price) || 0,
        default_price: data.default_price ? parseFloat(data.default_price) : null,
        min_price: data.min_price ? parseFloat(data.min_price) : null,
        duration_minutes: parseInt(data.duration_minutes) || 60,
        num_sessions: parseInt(data.num_sessions) || 1,
        renewal_enabled: data.renewal_enabled,
        renewal_trigger_days: Math.max(1, parseInt(data.renewal_trigger_days) || 7),
        clinic_id: clinicId!,
      };

      let treatmentId = editingId;

      if (editingId) {
        const { error } = await supabase.from('treatments').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('treatments').insert(payload).select('id').single();
        if (error) throw error;
        treatmentId = inserted.id;
      }

      // Save cost composition (admin only)
      if (canManage && treatmentId) {
        // Delete existing
        await supabase.from('treatment_cost_items' as unknown).delete().eq('treatment_id', treatmentId);
        // Insert new
        if (costLines.length > 0) {
          const items = costLines.filter(l => l.cost_item_id && parseFloat(l.quantity) > 0).map(l => ({
            treatment_id: treatmentId!,
            cost_item_id: l.cost_item_id,
            quantity: parseFloat(l.quantity) || 1,
          }));
          if (items.length > 0) {
            const { error } = await supabase.from('treatment_cost_items' as unknown).insert(items as unknown);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatments'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setCostLines([]);
      toast({ title: editingId ? 'Tratamento atualizado!' : 'Tratamento criado!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openEdit = async (t: unknown) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      category_id: t.category_id || '',
      description: t.description || '',
      price: String(t.price),
      default_price: t.default_price ? String(t.default_price) : '',
      min_price: t.min_price ? String(t.min_price) : '',
      duration_minutes: String(t.duration_minutes),
      num_sessions: String(t.num_sessions),
      renewal_enabled: t.renewal_enabled ?? true,
      renewal_trigger_days: String(t.renewal_trigger_days ?? 7),
    });

    if (canManage) {
      const { data } = await supabase.from('treatment_cost_items' as unknown).select('*').eq('treatment_id', t.id);
      setCostLines((data as unknown[] || []).map((d: unknown) => ({
        id: d.id,
        cost_item_id: d.cost_item_id,
        quantity: String(d.quantity),
      })));
    }

    setDialogOpen(true);
  };

  const openDuplicate = async (t: unknown) => {
    await openEdit(t);
    setEditingId(null);
    setForm((current) => ({
      ...current,
      name: current.name ? `${current.name} (Cópia)` : 'Novo tratamento (Cópia)',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.min_price && form.default_price && parseFloat(form.min_price) > parseFloat(form.default_price)) {
      toast({ title: 'Preço mínimo não pode ser maior que o preço padrão', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(form);
  };

  const addCostLine = () => setCostLines([...costLines, { cost_item_id: '', quantity: '1' }]);
  const removeCostLine = (idx: number) => setCostLines(costLines.filter((_, i) => i !== idx));
  const updateCostLine = (idx: number, field: string, value: string) => {
    const updated = [...costLines];
    (updated[idx] as unknown)[field] = value;
    setCostLines(updated);
  };

  const getCostItemById = (id: string) => costItems.find((c: unknown) => c.id === id);
  const totalCost = costLines.reduce((sum, l) => {
    const item = getCostItemById(l.cost_item_id);
    return sum + (item ? Number(item.unit_cost) * (parseFloat(l.quantity) || 0) : 0);
  }, 0);
  const grossPrice = parseFloat(form.price) || 0;
  const grossMarginPercent = grossPrice > 0 ? ((grossPrice - totalCost) / grossPrice) * 100 : null;
  const marginToneClass =
    grossMarginPercent === null
      ? 'text-muted-foreground'
      : grossMarginPercent >= 30
        ? 'text-emerald-700'
        : grossMarginPercent >= 15
          ? 'text-amber-700'
          : 'text-destructive';

  const [activeTab, setActiveTab] = useState('treatments');

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Tratamentos"
          description={readOnly ? 'Visualização dos tratamentos e combos da clínica' : 'Cadastre os tratamentos e combos da clínica'}
        >
          {activeTab === 'treatments' && canManage && (
            <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setCostLines([]); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Novo Tratamento
            </BrandButton>
          )}
        </PageHeader>
      )}

      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Tratamentos e Combos</h3>
            <p className="text-sm text-muted-foreground">Cadastro e configuração dos tratamentos da clínica.</p>
          </div>
          {activeTab === 'treatments' && canManage && (
            <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setCostLines([]); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Novo Tratamento
            </BrandButton>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="treatments">Tratamentos</TabsTrigger>
          <TabsTrigger value="combos">Combos</TabsTrigger>
        </TabsList>

        <TabsContent value="combos">
          <CombosTab readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="treatments">

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tratamento..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo de tratamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {categories.map((category: unknown) => (
              <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
            ))}
            <SelectItem value="uncategorized">Sem categoria</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
        </div>
      )}

      {!isLoading && treatments.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <Stethoscope className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum tratamento cadastrado</h3>
          <p className="text-sm text-muted-foreground mb-4">Cadastre os tratamentos oferecidos pela clínica</p>
          {canManage && (
            <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setCostLines([]); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Novo Tratamento
            </BrandButton>
          )}
        </div>
      )}

      {!isLoading && treatments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {treatments.map((t: unknown) => (
            <div key={t.id} className="bg-card rounded-xl shadow-card p-5 animate-fade-in hover:shadow-card-hover transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{t.name}</h3>
                  {t.treatment_categories?.name && (
                    <span className="text-xs text-muted-foreground">{t.treatment_categories.name}</span>
                  )}
                  {!t.treatment_categories?.name && t.category && (
                    <span className="text-xs text-muted-foreground">{t.category}</span>
                  )}
                </div>
                <BrandBadge status={t.is_active ? 'active' : 'cancelled'}>
                  {t.is_active ? 'Ativo' : 'Inativo'}
                </BrandBadge>
              </div>
              {t.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{t.description}</p>}
              <div className="text-sm border-t pt-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Preço</span>
                  <span className="font-bold text-foreground">R$ {Number(t.price).toFixed(2)}</span>
                </div>
                {t.default_price && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Preço Padrão</span>
                    <span className="text-foreground">R$ {Number(t.default_price).toFixed(2)}</span>
                  </div>
                )}
                {t.min_price && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Preço Mínimo</span>
                    <span className="text-foreground">R$ {Number(t.min_price).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Duração / Sessões</span>
                  <span className="text-foreground">{t.duration_minutes}min · {t.num_sessions} sessões</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Renovação</span>
                  <span className="text-foreground">
                    {t.renewal_enabled === false
                      ? 'Desativada'
                      : Number(t.num_sessions || 1) > 1
                        ? 'Antepenúltima sessão'
                        : `D+${t.renewal_trigger_days || 7}`}
                  </span>
                </div>
              </div>
              {canManage && (
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <button onClick={() => openEdit(t)} className="text-primary hover:underline flex items-center gap-1">
                    <Edit className="w-3 h-3" /> Editar
                  </button>
                  <button onClick={() => openDuplicate(t)} className="text-primary hover:underline flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Duplicar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Tratamento' : 'Novo Tratamento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: unknown) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tratamento *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Preço Padrão (R$)</Label>
                <Input type="number" step="0.01" value={form.default_price} onChange={e => setForm({ ...form, default_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Preço Mínimo (R$)</Label>
                <Input type="number" step="0.01" value={form.min_price} onChange={e => setForm({ ...form, min_price: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Duração (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nº Sessões</Label>
                <Input type="number" value={form.num_sessions} onChange={e => setForm({ ...form, num_sessions: e.target.value })} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="renewal_enabled"
                  checked={form.renewal_enabled}
                  onCheckedChange={(value) => setForm({ ...form, renewal_enabled: !!value })}
                />
                <div className="space-y-1">
                  <Label htmlFor="renewal_enabled">Habilitar renovação automática</Label>
                  <p className="text-xs text-muted-foreground">
                    Cria tarefa comercial no CRM para retenção quando o paciente entra na janela de renovação.
                  </p>
                </div>
              </div>

              {form.renewal_enabled && Number(form.num_sessions || 1) <= 1 && (
                <div className="space-y-2">
                  <Label>Acionar após (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={form.renewal_trigger_days}
                    onChange={(e) => setForm({ ...form, renewal_trigger_days: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Para sessão única, a tarefa de renovação aparece em D+N.
                  </p>
                </div>
              )}

              {form.renewal_enabled && Number(form.num_sessions || 1) > 1 && (
                <p className="text-xs text-muted-foreground">
                  Para tratamentos com múltiplas sessões, o gatilho é automático na antepenúltima sessão.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            {/* Cost Composition - Admin only */}
            {isAdmin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Composição de Custo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {costLines.map((line, idx) => {
                    const item = getCostItemById(line.cost_item_id);
                    const subtotal = item ? Number(item.unit_cost) * (parseFloat(line.quantity) || 0) : 0;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <Select value={line.cost_item_id} onValueChange={v => updateCostLine(idx, 'cost_item_id', v)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione item..." /></SelectTrigger>
                          <SelectContent>
                            {costItems.map((c: unknown) => (
                              <SelectItem key={c.id} value={c.id}>{c.name} (R$ {Number(c.unit_cost).toFixed(2)}/{c.unit || 'un'})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          placeholder={item?.type === 'labor' ? 'Horas' : 'Qtd'}
                          value={line.quantity}
                          onChange={e => updateCostLine(idx, 'quantity', e.target.value)}
                        />
                        <span className="text-sm text-muted-foreground w-24 text-right">
                          R$ {subtotal.toFixed(2)}
                        </span>
                        <BrandButton type="button" variant="ghost" size="sm" onClick={() => removeCostLine(idx)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </BrandButton>
                      </div>
                    );
                  })}
                  <BrandButton type="button" variant="outline" size="sm" onClick={addCostLine}>
                    <Plus className="w-3 h-3" /> Adicionar item
                  </BrandButton>
                  {costLines.length > 0 && (
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-sm font-semibold text-foreground">Custo Total</span>
                      <span className="text-sm font-bold text-foreground">R$ {totalCost.toFixed(2)}</span>
                    </div>
                  )}
                  {form.min_price && costLines.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Margem sobre preço mínimo: R$ {(parseFloat(form.min_price) - totalCost).toFixed(2)}
                    </p>
                  )}
                  {costLines.length > 0 && grossMarginPercent !== null && (
                    <p className={`text-xs font-medium ${marginToneClass}`}>
                      Margem bruta: {grossMarginPercent.toFixed(1)}%
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      )}
      </TabsContent>
      </Tabs>
    </div>
  );
}
