import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Package, Copy, TriangleAlert } from 'lucide-react';

interface ComboItem {
  treatment_id: string;
  quantity: number;
}

interface ComboForm {
  name: string;
  promotional_price: string;
  active: boolean;
  items: ComboItem[];
}

const emptyForm: ComboForm = { name: '', promotional_price: '', active: true, items: [] };

interface CombosTabProps {
  readOnly?: boolean;
}

export default function CombosTab({ readOnly = false }: CombosTabProps = {}) {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ComboForm>(emptyForm);

  const isAdmin = role === 'admin';
  const canManage = isAdmin && !readOnly;

  const { data: combos = [], isLoading } = useQuery({
    queryKey: ['treatment-combos', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase.from('treatment_combos' as unknown)
        .select('*, treatment_combo_items(*, treatments(id, name, price, default_price, min_price))')
        .eq('clinic_id', clinicId).order('name');
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-active', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase.from('treatments').select('id, name, price, default_price, min_price').eq('clinic_id', clinicId).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatmentCostRows = [] } = useQuery({
    queryKey: ['treatment-cost-rows', clinicId, treatments.length],
    queryFn: async () => {
      const treatmentIds = (treatments as Array<{ id: string }>).map((t) => t.id);
      if (treatmentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('treatment_cost_items' as never)
        .select('treatment_id, quantity, cost_items(unit_cost)')
        .in('treatment_id', treatmentIds);
      if (error) throw error;
      return (data || []) as Array<{ treatment_id: string; quantity: number | null; cost_items?: { unit_cost?: number | null } | null }>;
    },
    enabled: !!clinicId && treatments.length > 0,
  });

  const getTreatment = (id: string) => treatments.find((t: unknown) => t.id === id);

  const totalDefault = form.items.reduce((s, item) => {
    const t = getTreatment(item.treatment_id);
    return s + (t ? Number(t.default_price || t.price) * item.quantity : 0);
  }, 0);

  const totalMinPrice = form.items.reduce((s, item) => {
    const t = getTreatment(item.treatment_id);
    return s + (t ? Number(t.min_price || 0) * item.quantity : 0);
  }, 0);

  const treatmentDirectCostMap = useMemo(() => {
    const map = new Map<string, number>();
    treatmentCostRows.forEach((row) => {
      const subtotal = Number(row.cost_items?.unit_cost || 0) * Number(row.quantity || 0);
      map.set(row.treatment_id, (map.get(row.treatment_id) || 0) + subtotal);
    });
    return map;
  }, [treatmentCostRows]);

  const totalDirectCost = form.items.reduce((sum, item) => {
    return sum + (treatmentDirectCostMap.get(item.treatment_id) || 0) * item.quantity;
  }, 0);

  const promoPrice = parseFloat(form.promotional_price) || 0;
  const belowMinimum = promoPrice > 0 && totalMinPrice > 0 && promoPrice < totalMinPrice;
  const comboMarginPercent = promoPrice > 0 ? ((promoPrice - totalDirectCost) / promoPrice) * 100 : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não encontrada');

      let comboId = editingId;
      if (editingId) {
        const { error } = await supabase.from('treatment_combos' as unknown).update({
          name: form.name,
          promotional_price: promoPrice || null,
          active: form.active,
        } as unknown).eq('id', editingId);
        if (error) throw error;
        await supabase.from('treatment_combo_items' as unknown).delete().eq('combo_id', editingId);
      } else {
        const { data: inserted, error } = await supabase.from('treatment_combos' as unknown).insert({
          clinic_id: clinicId,
          name: form.name,
          promotional_price: promoPrice || null,
          active: form.active,
        } as unknown).select('id').single();
        if (error) throw error;
        comboId = (inserted as unknown).id;
      }

      if (form.items.length > 0 && comboId) {
        const { error } = await supabase.from('treatment_combo_items' as unknown).insert(
          form.items.filter(i => i.treatment_id).map(i => ({
            combo_id: comboId,
            treatment_id: i.treatment_id,
            quantity: i.quantity,
          })) as unknown
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-combos'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? 'Combo atualizado!' : 'Combo criado!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (combo: unknown) => {
    setEditingId(combo.id);
    setForm({
      name: combo.name,
      promotional_price: combo.promotional_price ? String(combo.promotional_price) : '',
      active: combo.active,
      items: (combo.treatment_combo_items || []).map((ci: unknown) => ({
        treatment_id: ci.treatment_id,
        quantity: ci.quantity || 1,
      })),
    });
    setDialogOpen(true);
  };

  const openDuplicate = (combo: unknown) => {
    setEditingId(null);
    setForm({
      name: combo.name ? `${combo.name} (Cópia)` : 'Novo combo (Cópia)',
      promotional_price: combo.promotional_price ? String(combo.promotional_price) : '',
      active: true,
      items: (combo.treatment_combo_items || []).map((ci: unknown) => ({
        treatment_id: ci.treatment_id,
        quantity: ci.quantity || 1,
      })),
    });
    setDialogOpen(true);
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { treatment_id: '', quantity: 1 }] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Novo Combo
          </BrandButton>
        </div>
      )}

      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && combos.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum combo cadastrado</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie combos para oferecer pacotes promocionais</p>
          {canManage && (
            <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Novo Combo
            </BrandButton>
          )}
        </div>
      )}

      {!isLoading && combos.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Tratamentos</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Preço Total</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Preço Mínimo</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Promocional</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {combos.map((combo: unknown) => {
                  const comboItems = combo.treatment_combo_items || [];
                  const totalPrice = comboItems.reduce((s: number, ci: unknown) => s + Number(ci.treatments?.default_price || ci.treatments?.price || 0) * (ci.quantity || 1), 0);
                  const totalMin = comboItems.reduce((s: number, ci: unknown) => s + Number(ci.treatments?.min_price || 0) * (ci.quantity || 1), 0);
                  return (
                    <tr key={combo.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{combo.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {comboItems.map((ci: unknown) => `${ci.treatments?.name} (x${ci.quantity})`).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground text-right">R$ {totalPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-right">R$ {totalMin.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-primary text-right">
                        {combo.promotional_price ? `R$ ${Number(combo.promotional_price).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <BrandBadge status={combo.active ? 'active' : 'cancelled'}>
                          {combo.active ? 'Ativo' : 'Inativo'}
                        </BrandBadge>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <BrandButton variant="ghost" size="sm" onClick={() => openEdit(combo)}>
                              <Edit className="w-3 h-3" />
                            </BrandButton>
                            <BrandButton variant="ghost" size="sm" onClick={() => openDuplicate(combo)}>
                              <Copy className="w-3 h-3" />
                            </BrandButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Editar Combo' : 'Novo Combo'}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Tratamentos do Combo</Label>
                  <BrandButton type="button" size="sm" variant="outline" onClick={addItem}>
                    <Plus className="w-3 h-3" /> Adicionar
                  </BrandButton>
                </div>
                {form.items.map((item, idx) => {
                  const t = getTreatment(item.treatment_id);
                  return (
                    <div key={idx} className="flex gap-2 items-center mb-2">
                      <Select value={item.treatment_id} onValueChange={v => {
                        const newItems = [...form.items];
                        newItems[idx] = { ...item, treatment_id: v };
                        setForm({ ...form, items: newItems });
                      }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {treatments.map((t: unknown) => (
                            <SelectItem key={t.id} value={t.id}>{t.name} (R$ {Number(t.default_price || t.price).toFixed(2)})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" min={1} className="w-20" value={item.quantity} onChange={e => {
                        const newItems = [...form.items];
                        newItems[idx] = { ...item, quantity: parseInt(e.target.value) || 1 };
                        setForm({ ...form, items: newItems });
                      }} />
                      {t && (
                        <span className="text-xs text-muted-foreground w-20 text-right">
                          Mín: R$ {Number(t.min_price || 0).toFixed(2)}
                        </span>
                      )}
                      <button type="button" onClick={() => removeItem(idx)} className="text-destructive p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}

                {form.items.length > 0 && (
                  <div className="text-sm space-y-1 mt-3 p-3 bg-secondary/50 rounded-lg">
                    <div className="flex justify-between"><span className="text-muted-foreground">Soma preços padrão:</span><span className="font-medium">R$ {totalDefault.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Soma preços mínimos (piso):</span><span className="font-medium">R$ {totalMinPrice.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Soma dos custos diretos:</span><span className="font-medium">R$ {totalDirectCost.toFixed(2)}</span></div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Preço Promocional (R$)</Label>
                <Input type="number" step="0.01" value={form.promotional_price} onChange={e => setForm({ ...form, promotional_price: e.target.value })} />
                {belowMinimum && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3" />
                    Valor abaixo do custo mínimo (R$ {totalMinPrice.toFixed(2)})
                  </p>
                )}
                {comboMarginPercent !== null && (
                  <p
                    className={`text-xs font-medium ${
                      comboMarginPercent >= 30 ? 'text-emerald-700' : comboMarginPercent >= 15 ? 'text-amber-700' : 'text-destructive'
                    }`}
                  >
                    Margem bruta do combo: {comboMarginPercent.toFixed(1)}%
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{form.active ? 'Ativo' : 'Inativo'}</span>
                  <Switch checked={form.active} onCheckedChange={checked => setForm({ ...form, active: checked })} />
                </div>
              </div>

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
    </div>
  );
}
