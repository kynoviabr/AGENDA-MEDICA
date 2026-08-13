import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Tags } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface CategoryForm {
  name: string;
  description: string;
  status: string;
}

interface CategoryPreset {
  name: string;
  description: string;
}

const CATEGORY_PRESETS: CategoryPreset[] = [
  { name: 'Emagrecimento', description: 'Tratamentos voltados à redução de peso, controle de medidas, mudança de hábitos e acompanhamento corporal. Pode envolver protocolos combinados com nutrição, tecnologias, avaliação física e acompanhamento profissional.' },
  { name: 'Estética Corporal', description: 'Procedimentos para melhora do contorno corporal, firmeza da pele, celulite, gordura localizada e retenção de líquidos. Inclui técnicas manuais, aparelhos e protocolos personalizados.' },
  { name: 'Estética Facial', description: 'Tratamentos voltados à melhora da pele do rosto, textura, luminosidade, acne, manchas, linhas finas e rejuvenescimento. Pode incluir limpeza de pele, peelings, hidratação, tecnologias e protocolos faciais.' },
  { name: 'Harmonização Facial', description: 'Procedimentos estéticos voltados ao equilíbrio, proporção e rejuvenescimento facial. Pode incluir bioestimuladores, preenchimentos, toxina botulínica e outros procedimentos autorizados conforme o profissional habilitado.' },
  { name: 'Procedimentos Injetáveis', description: 'Categoria para procedimentos que envolvem aplicação de substâncias por via injetável, realizados por profissionais habilitados. Inclui tratamentos estéticos, protocolos corporais ou faciais, conforme regras técnicas e regulatórias.' },
  { name: 'Pós-operatório', description: 'Cuidados estéticos e terapêuticos após cirurgias plásticas ou procedimentos corporais. Pode incluir drenagem linfática, controle de edema, fibrose, dor e recuperação tecidual.' },
  { name: 'Drenagem Linfática', description: 'Técnicas manuais ou associadas a equipamentos para auxiliar na redução de retenção de líquidos, inchaço e melhora da circulação linfática. Muito utilizada em estética corporal, gestantes e pós-operatório.' },
  { name: 'Gordura Localizada', description: 'Tratamentos focados na redução de acúmulos de gordura em regiões específicas do corpo. Pode envolver tecnologias, massagens modeladoras, protocolos combinados e acompanhamento de medidas.' },
  { name: 'Celulite e Flacidez', description: 'Protocolos voltados à melhora da textura da pele, firmeza, elasticidade e aspecto da celulite. Pode envolver radiofrequência, bioestimulação, massagens, tecnologias e cuidados complementares.' },
  { name: 'Rejuvenescimento', description: 'Tratamentos voltados à melhora dos sinais do envelhecimento, tanto facial quanto corporal. Inclui estímulo de colágeno, melhora da firmeza, qualidade da pele, linhas e rugas.' },
  { name: 'Limpeza de Pele', description: 'Procedimento facial para higienização profunda, remoção de impurezas, cravos e controle de oleosidade. Pode ser indicado como tratamento isolado ou preparo para outros protocolos estéticos.' },
  { name: 'Peelings', description: 'Tratamentos para renovação da pele, melhora de manchas, textura, acne, poros e luminosidade. Podem ser químicos, físicos ou enzimáticos, conforme avaliação profissional.' },
  { name: 'Depilação', description: 'Procedimentos para remoção ou redução progressiva dos pelos. Pode incluir cera, laser, luz pulsada ou outras tecnologias disponíveis na clínica.' },
  { name: 'Laser e Tecnologias', description: 'Categoria para tratamentos realizados com equipamentos estéticos, como laser, radiofrequência, ultrassom, criofrequência, endermologia, luz pulsada e similares.' },
  { name: 'Capilar / Tricologia Estética', description: 'Tratamentos voltados à saúde do couro cabeludo, queda capilar, fortalecimento dos fios e estímulo de crescimento. Pode envolver tecnologias, protocolos tópicos e procedimentos realizados por profissional habilitado.' },
  { name: 'Nutrição e Reeducação Alimentar', description: 'Acompanhamento nutricional para emagrecimento, saúde, estética corporal, performance e melhora de hábitos alimentares. Pode ser integrado aos protocolos de emagrecimento da clínica.' },
  { name: 'Avaliação Corporal', description: 'Consulta inicial ou periódica para análise de medidas, composição corporal, histórico, objetivos e evolução do paciente. Serve como base para indicação e acompanhamento dos tratamentos.' },
  { name: 'Massagens e Terapias Manuais', description: 'Técnicas manuais com foco estético, relaxante, modelador ou terapêutico. Inclui massagem modeladora, relaxante, drenagem, bambuterapia e outros protocolos corporais.' },
  { name: 'Bem-estar e Saúde Integrativa', description: 'Tratamentos voltados à qualidade de vida, equilíbrio, relaxamento, autoestima e cuidado global do paciente. Pode integrar estética, saúde, hábitos e acompanhamento multidisciplinar.' },
  { name: 'Protocolos Combinados', description: 'Pacotes que unem diferentes técnicas, profissionais e tecnologias para um objetivo específico. Muito usado em emagrecimento, gordura localizada, rejuvenescimento e remodelação corporal.' },
];

const emptyForm: CategoryForm = { name: '', description: '', status: 'active' };

export default function CategoriesTab() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['treatment-categories', clinicId, search],
    queryFn: async () => {
      if (!clinicId) return [];
      let q = supabase.from('treatment_categories' as unknown).select('*').eq('clinic_id', clinicId).order('name');
      if (search) q = q.ilike('name', `%${search}%`);
      const { data } = await q;
      return (data as unknown[]) || [];
    },
    enabled: !!clinicId,
  });

  // Check if category is in use
  const checkCategoryInUse = async (categoryId: string) => {
    const { count } = await supabase.from('treatments').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
    return (count || 0) > 0;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: CategoryForm) => {
      const payload = { name: data.name, description: data.description || null, status: data.status, clinic_id: clinicId! };
      if (editingId) {
        const { error } = await supabase.from('treatment_categories' as unknown).update(payload as unknown).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('treatment_categories' as unknown).insert(payload as unknown);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-categories'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? 'Categoria atualizada!' : 'Categoria criada!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openEdit = (cat: unknown) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, description: cat.description || '', status: cat.status });
    setDialogOpen(true);
  };

  const applyCategoryPreset = (categoryName: string) => {
    const preset = CATEGORY_PRESETS.find((item) => item.name === categoryName);
    if (!preset) return;
    setForm((prev) => ({ ...prev, name: preset.name, description: preset.description }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar categoria..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Categoria
        </BrandButton>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><Tags className="w-5 h-5" />Categorias de Tratamentos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <Tags className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Nenhuma categoria cadastrada</h3>
              <p className="text-sm text-muted-foreground mb-4">Crie categorias para organizar seus tratamentos</p>
              <BrandButton onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
                <Plus className="w-4 h-4" /> Nova Categoria
              </BrandButton>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((cat: unknown) => (
                <div key={cat.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    {cat.description ? (
                      <p className="text-xs text-muted-foreground mt-1 max-w-2xl line-clamp-2">{cat.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cat.status === 'active' ? 'default' : 'secondary'}
                      className={cat.status === 'active' ? 'bg-green-100 text-green-700' : ''}>
                      {cat.status === 'active' ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <BrandButton variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                      <Edit className="w-3 h-3" />
                    </BrandButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Modelo de categoria (opcional)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue=""
                onChange={(e) => applyCategoryPreset(e.target.value)}
              >
                <option value="">Selecionar modelo</option>
                {CATEGORY_PRESETS.map((preset) => (
                  <option key={preset.name} value={preset.name}>{preset.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descreva o objetivo e uso da categoria"
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{form.status === 'active' ? 'Ativa' : 'Inativa'}</span>
                <Switch
                  checked={form.status === 'active'}
                  onCheckedChange={checked => setForm({ ...form, status: checked ? 'active' : 'inactive' })}
                />
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
    </div>
  );
}
