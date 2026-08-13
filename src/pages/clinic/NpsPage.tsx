import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandStat } from '@/components/ui/brand-stat';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Filter, TrendingUp, SmilePlus, Meh, Frown, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function classifyNps(score: number): { label: string; color: string; bgClass: string } {
  if (score >= 9) return { label: 'Promotor', color: 'text-success', bgClass: 'bg-success/15 text-success border-success/20' };
  if (score >= 7) return { label: 'Neutro', color: 'text-warning', bgClass: 'bg-warning/15 text-warning border-warning/20' };
  return { label: 'Detrator', color: 'text-destructive', bgClass: 'bg-destructive/15 text-destructive border-destructive/20' };
}

function npsScoreLabel(nps: number): { label: string; colorClass: string } {
  if (nps < 0) return { label: 'Crítico', colorClass: 'text-destructive' };
  if (nps < 50) return { label: 'Aperfeiçoamento', colorClass: 'text-warning' };
  if (nps < 75) return { label: 'Bom', colorClass: 'text-success' };
  return { label: 'Excelente', colorClass: 'text-success' };
}

export default function NpsPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterClassification, setFilterClassification] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('30');
  const [search, setSearch] = useState('');

  // Form state
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const periodStart = subDays(new Date(), parseInt(filterPeriod)).toISOString();

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['nps-responses', clinicId, filterPeriod, filterClassification, search],
    queryFn: async () => {
      const q = supabase
        .from('nps_responses')
        .select('*, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('submitted_at', periodStart)
        .order('submitted_at', { ascending: false });
      const { data } = await q;
      let results = (data as unknown[]) || [];
      
      if (filterClassification !== 'all') {
        results = results.filter(r => {
          if (filterClassification === 'promoter') return r.score >= 9;
          if (filterClassification === 'neutral') return r.score >= 7 && r.score <= 8;
          return r.score <= 6;
        });
      }
      if (search) {
        const s = search.toLowerCase();
        results = results.filter(r => r.patients?.full_name?.toLowerCase().includes(s));
      }
      return results;
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-nps', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-nps', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ['professionals-nps', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId!).eq('is_active', true).in('role', ['admin', 'professional']);
      return (data || []).map((r, i) => ({ ...r, displayName: `Profissional ${i + 1}` }));
    },
    enabled: !!clinicId,
  });

  // NPS calculation
  const totalResponses = responses.length;
  const promoters = responses.filter((r: unknown) => r.score >= 9).length;
  const neutrals = responses.filter((r: unknown) => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter((r: unknown) => r.score <= 6).length;
  const npsScore = totalResponses > 0
    ? Math.round(((promoters - detractors) / totalResponses) * 100)
    : 0;
  const npsInfo = npsScoreLabel(npsScore);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (score === null) throw new Error('Selecione uma nota');
      const { error } = await supabase.from('nps_responses' as unknown).insert({
        clinic_id: clinicId!,
        patient_id: selectedPatient,
        treatment_id: selectedTreatment || null,
        professional_user_id: selectedProfessional || null,
        score,
        comment: comment || null,
      } as unknown);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nps-responses'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'NPS registrado com sucesso!' });
    },
    onError: (err: unknown) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedPatient('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setScore(null);
    setComment('');
  };

  return (
    <div>
      <PageHeader title="NPS" description="Net Promoter Score — Pesquisa de satisfação periódica">
        <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Registrar NPS
        </BrandButton>
      </PageHeader>

      {/* NPS Score Panel */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="shadow-card col-span-2 lg:col-span-1 animate-fade-in">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className={cn("text-4xl font-bold", npsInfo.colorClass)}>{totalResponses > 0 ? npsScore : '—'}</p>
            <p className={cn("text-sm font-semibold mt-1", npsInfo.colorClass)}>{totalResponses > 0 ? npsInfo.label : 'Sem dados'}</p>
            <p className="text-xs text-muted-foreground mt-1">NPS Geral</p>
          </CardContent>
        </Card>
        <BrandStat icon={TrendingUp} label="Total Respostas" value={totalResponses} />
        <BrandStat icon={SmilePlus} label="Promotores" value={promoters} />
        <BrandStat icon={Meh} label="Neutros" value={neutrals} />
        <BrandStat icon={Frown} label="Detratores" value={detractors} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar paciente..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterClassification} onValueChange={setFilterClassification}>
          <SelectTrigger className="w-[160px]"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="promoter">Promotores</SelectItem>
            <SelectItem value="neutral">Neutros</SelectItem>
            <SelectItem value="detractor">Detratores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && responses.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma resposta NPS</h3>
          <p className="text-sm text-muted-foreground mb-4">Registre pesquisas NPS para acompanhar a satisfação</p>
          <BrandButton onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Registrar NPS
          </BrandButton>
        </div>
      )}

      {!isLoading && responses.length > 0 && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Paciente</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Nota</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Classificação</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Tratamento</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r: unknown) => {
                  const cls = classifyNps(r.score);
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{r.patients?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{format(new Date(r.submitted_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-lg font-bold", cls.color)}>{r.score}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", cls.bgClass)}>
                          {cls.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.treatments?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{r.comment || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar NPS</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                <SelectContent>{patients.map((p: unknown) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tratamento</Label>
                <Select value={selectedTreatment} onValueChange={setSelectedTreatment}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{treatments.map((t: unknown) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>{professionals.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.displayName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nota (0-10) *</Label>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 11 }, (_, i) => {
                  const cls = classifyNps(i);
                  const isSelected = score === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setScore(i)}
                      className={cn(
                        "w-10 h-10 rounded-lg text-sm font-bold border-2 transition-all",
                        isSelected
                          ? i <= 6 ? "bg-destructive text-destructive-foreground border-destructive"
                            : i <= 8 ? "bg-warning text-warning-foreground border-warning"
                            : "bg-success text-success-foreground border-success"
                          : "bg-secondary border-border text-foreground hover:border-primary"
                      )}
                    >
                      {i}
                    </button>
                  );
                })}
              </div>
              {score !== null && (
                <p className={cn("text-sm font-semibold mt-1", classifyNps(score).color)}>
                  {classifyNps(score).label}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Comentário</Label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Feedback opcional do paciente..." />
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient || score === null}>
                {createMutation.isPending ? 'Salvando...' : 'Registrar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
