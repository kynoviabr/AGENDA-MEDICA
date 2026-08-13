import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, DollarSign } from 'lucide-react';

const typeLabels: Record<string, string> = {
  labor: 'Mão de Obra',
  medication: 'Medicamento',
  supply: 'Insumo/Descartável',
};

const typeColors: Record<string, string> = {
  labor: 'bg-blue-100 text-blue-700',
  medication: 'bg-purple-100 text-purple-700',
  supply: 'bg-orange-100 text-orange-700',
};

interface CostPreset {
  name: string;
  type: 'supply' | 'medication' | 'labor';
  unit: string;
}

const UNIT_OPTIONS = [
  'unidade',
  'caixa',
  'pacote',
  'frasco',
  'ampola',
  'seringa',
  'dose',
  'mg',
  'ml',
  'g',
  'kg',
  'litro',
  'rolo',
  'par',
  'sessão',
];

const COST_ITEM_PRESETS: CostPreset[] = [
  { name: 'Algodão', type: 'supply', unit: 'pacote' },
  { name: 'Gaze estéril', type: 'supply', unit: 'pacote' },
  { name: 'Luva descartável', type: 'supply', unit: 'par' },
  { name: 'Máscara descartável', type: 'supply', unit: 'unidade' },
  { name: 'Touca descartável', type: 'supply', unit: 'unidade' },
  { name: 'Lençol descartável', type: 'supply', unit: 'unidade' },
  { name: 'Papel toalha', type: 'supply', unit: 'rolo' },
  { name: 'Álcool 70%', type: 'supply', unit: 'ml' },
  { name: 'Álcool gel', type: 'supply', unit: 'ml' },
  { name: 'Clorexidina', type: 'supply', unit: 'ml' },
  { name: 'Soro fisiológico', type: 'supply', unit: 'frasco' },
  { name: 'Agulha descartável', type: 'supply', unit: 'unidade' },
  { name: 'Seringa descartável', type: 'supply', unit: 'unidade' },
  { name: 'Microcânula', type: 'supply', unit: 'unidade' },
  { name: 'Lâmina de bisturi', type: 'supply', unit: 'unidade' },
  { name: 'Anestésico tópico', type: 'medication', unit: 'g' },
  { name: 'Gel condutor', type: 'supply', unit: 'ml' },
  { name: 'Creme de massagem', type: 'supply', unit: 'g' },
  { name: 'Óleo de massagem', type: 'supply', unit: 'ml' },
  { name: 'Creme redutor', type: 'supply', unit: 'g' },
  { name: 'Creme firmador', type: 'supply', unit: 'g' },
  { name: 'Máscara facial', type: 'supply', unit: 'unidade' },
  { name: 'Ácido para peeling', type: 'medication', unit: 'ml' },
  { name: 'Neutralizante de peeling', type: 'supply', unit: 'ml' },
  { name: 'Esfoliante facial', type: 'supply', unit: 'g' },
  { name: 'Esfoliante corporal', type: 'supply', unit: 'g' },
  { name: 'Protetor solar profissional', type: 'supply', unit: 'g' },
  { name: 'Enzima lipolítica', type: 'medication', unit: 'ml' },
  { name: 'Enzima facial', type: 'medication', unit: 'ml' },
  { name: 'Bioestimulador de colágeno', type: 'medication', unit: 'frasco' },
  { name: 'Toxina botulínica', type: 'medication', unit: 'unidade' },
  { name: 'Preenchedor ácido hialurônico', type: 'medication', unit: 'seringa' },
  { name: 'Skinbooster', type: 'medication', unit: 'seringa' },
  { name: 'Fios de PDO', type: 'supply', unit: 'unidade' },
  { name: 'Tirzepatida', type: 'medication', unit: 'mg' },
  { name: 'Semaglutida', type: 'medication', unit: 'mg' },
  { name: 'Liraglutida', type: 'medication', unit: 'mg' },
  { name: 'Complexo vitamínico', type: 'medication', unit: 'ampola' },
  { name: 'Fita métrica descartável', type: 'supply', unit: 'unidade' },
  { name: 'Eletrodo adesivo', type: 'supply', unit: 'unidade' },
  { name: 'Ponteira descartável', type: 'supply', unit: 'unidade' },
  { name: 'Ponteira de criolipólise / manta anticongelante', type: 'supply', unit: 'unidade' },
  { name: 'Manta térmica descartável', type: 'supply', unit: 'unidade' },
  { name: 'Filme osmótico', type: 'supply', unit: 'rolo' },
  { name: 'Espátula descartável', type: 'supply', unit: 'unidade' },
  { name: 'Cubeta descartável', type: 'supply', unit: 'unidade' },
  { name: 'Saco infectante', type: 'supply', unit: 'unidade' },
  { name: 'Coletor perfurocortante', type: 'supply', unit: 'unidade' },
  { name: 'Material de assepsia da sala', type: 'supply', unit: 'ml' },
  { name: 'Sachê ou dose de produto cosmético', type: 'supply', unit: 'unidade' },
];

interface CostItemForm {
  name: string;
  type: string;
  unit_cost: string;
  unit: string;
  status: string;
}

const emptyForm: CostItemForm = { name: '', type: 'supply', unit_cost: '', unit: '', status: 'active' };

export default function CostItemsTab() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CostItemForm>(emptyForm);

  const isAdmin = role === 'admin';

  const { data: costItems = [], isLoading } = useQuery({
    queryKey: ['cost-items', clinicId, search],
    queryFn: async () => {
      if (!clinicId) return [];
      const columns = isAdmin ? '*' : 'id,clinic_id,name,type,unit,status,created_at';
      let q = supabase.from('cost_items' as unknown).select(columns).eq('clinic_id', clinicId).order('name');
      if (search) q = q.ilike('name', `%${search}%`);
      const { data } = await q;
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CostItemForm) => {
      const payload = {
        name: data.name,
        type: data.type,
        unit_cost: parseFloat(data.unit_cost) || 0,
        unit: data.unit || null,
        status: data.status,
        clinic_id: clinicId!,
      };
      if (editingId) {
        const { error } = await supabase.from('cost_items' as unknown).update(payload as unknown).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cost_items' as unknown).insert(payload as unknown);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-items'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? 'Item atualizado!' : 'Item criado!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (item: unknown) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      type: item.type,
      unit_cost: String(item.unit_cost || ''),
      unit: item.unit || '',
      status: item.status,
    });
    setDialogOpen(true);
  };

  const applyCostPreset = (presetName: string) => {
    const preset = COST_ITEM_PRESETS.find((item) => item.name === presetName);
    if (!preset) return;
    setForm((prev) => ({ ...prev, name: preset.name, type: preset.type, unit: preset.unit }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar item de custo..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Novo Item
          </BrandButton>
        )}
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />Itens de Custo</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : costItems.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhum item de custo cadastrado</h3>
              <p className="text-sm text-muted-foreground mb-4">Cadastre insumos, medicamentos e mão de obra</p>
              {isAdmin && (
                <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4" /> Novo Item
                </BrandButton>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nome</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Tipo</th>
                    {isAdmin && <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Valor Unitário</th>}
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Unidade</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {costItems.map((item: unknown) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{item.name}</td>
                      <td className="px-4 py-3">
                        <Badge className={typeColors[item.type] || ''}>{typeLabels[item.type] || item.type}</Badge>
                      </td>
                      {isAdmin && <td className="px-4 py-3 text-sm text-foreground font-semibold">R$ {Number(item.unit_cost).toFixed(2)}</td>}
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.unit || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={item.status === 'active' ? 'default' : 'secondary'}
                          className={item.status === 'active' ? 'bg-green-100 text-green-700' : ''}>
                          {item.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <BrandButton variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            <Edit className="w-3 h-3" />
                          </BrandButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Item de Custo' : 'Novo Item de Custo'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Modelo de item (opcional)</Label>
                <Select onValueChange={applyCostPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_ITEM_PRESETS.map((preset) => (
                      <SelectItem key={preset.name} value={preset.name}>{preset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="labor">Mão de Obra (hora)</SelectItem>
                    <SelectItem value="medication">Medicamento</SelectItem>
                    <SelectItem value="supply">Insumo/Descartável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor de Custo (R$) *</Label>
                  <Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select value={form.unit || undefined} onValueChange={(value) => setForm({ ...form, unit: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((unit) => (
                        <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{form.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                  <Switch checked={form.status === 'active'} onCheckedChange={checked => setForm({ ...form, status: checked ? 'active' : 'inactive' })} />
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
