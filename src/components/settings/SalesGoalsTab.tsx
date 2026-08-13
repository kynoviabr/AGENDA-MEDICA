import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, Plus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type GoalType = 'clinic' | 'user' | 'team' | 'category_treatment';
type GoalStatus = 'active' | 'inactive';
type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

interface GoalRow {
  id: string;
  clinic_id: string;
  goal_name: string | null;
  user_id: string | null;
  goal_type: GoalType;
  period_type: PeriodType;
  period_reference: string;
  period_start: string | null;
  period_end: string | null;
  goal_amount: number;
  category_id: string | null;
  treatment_id: string | null;
  team_name: string | null;
  notes: string | null;
  status: GoalStatus;
  created_at: string;
}

interface StaffRow {
  user_id: string;
  role: string;
}

interface GoalMetrics {
  sold: number;
  contracts: number;
  missing: number;
  pct: number;
  ticket: number;
}

const periodTypeOptions: Array<{ value: PeriodType; label: string }> = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

const goalTypeOptions: Array<{ value: GoalType; label: string }> = [
  { value: 'clinic', label: 'Clínica geral' },
  { value: 'user', label: 'Usuário / vendedor' },
  { value: 'team', label: 'Equipe' },
  { value: 'category_treatment', label: 'Categoria ou tratamento' },
];

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const parseDateValue = (value: string) => {
  if (!value) return null;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
};

const toYmd = (date: Date) => format(date, 'yyyy-MM-dd');

const addOneDayYmd = (ymd: string) => {
  const parsed = parseDateValue(ymd);
  if (!parsed) return ymd;
  return toYmd(addDays(parsed, 1));
};

const quarterFromRef = (reference: string) => {
  const yearMatch = reference.match(/^(\d{4})-Q([1-4])$/i);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  const q = Number(yearMatch[2]);
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = endOfMonth(new Date(year, startMonth + 2, 1));
  return { start, end };
};

const rangeFromGoal = (goal: GoalRow) => {
  if (goal.period_start && goal.period_end) {
    return { start: goal.period_start, end: goal.period_end };
  }

  const ref = goal.period_reference || '';
  if (goal.period_type === 'daily') return { start: ref, end: ref };
  if (goal.period_type === 'weekly') {
    const parsed = parseDateValue(ref);
    if (!parsed) return null;
    const start = startOfWeek(parsed, { weekStartsOn: 1 });
    const end = endOfWeek(parsed, { weekStartsOn: 1 });
    return { start: toYmd(start), end: toYmd(end) };
  }
  if (goal.period_type === 'monthly') {
    const parsed = parseDateValue(`${ref}-01`);
    if (!parsed) return null;
    return { start: toYmd(startOfMonth(parsed)), end: toYmd(endOfMonth(parsed)) };
  }
  if (goal.period_type === 'quarterly') {
    const q = quarterFromRef(ref);
    if (!q) return null;
    return { start: toYmd(q.start), end: toYmd(q.end) };
  }
  if (goal.period_type === 'yearly') {
    const parsed = parseDateValue(`${ref}-01-01`);
    if (!parsed) return null;
    return { start: toYmd(startOfYear(parsed)), end: toYmd(endOfYear(parsed)) };
  }
  return null;
};

const computeMetaStatus = (goal: GoalRow, metrics: GoalMetrics) => {
  if (goal.status === 'inactive') return 'Inativa';
  const range = rangeFromGoal(goal);
  if (!range) return 'Em andamento';
  const now = toYmd(new Date());
  if (now < range.start) return 'Não iniciada';
  if (now > range.end && metrics.pct < 100) return 'Não atingida';
  if (metrics.pct >= 120) return 'Superada';
  if (metrics.pct >= 100) return 'Batida';
  return 'Em andamento';
};

const statusBadge = (status: string) => {
  if (status === 'Batida') return <Badge className="bg-green-100 text-green-700">Batida</Badge>;
  if (status === 'Superada') return <Badge className="bg-emerald-100 text-emerald-700">Superada</Badge>;
  if (status === 'Não atingida') return <Badge className="bg-red-100 text-red-700">Não atingida</Badge>;
  if (status === 'Não iniciada') return <Badge className="bg-slate-100 text-slate-700">Não iniciada</Badge>;
  if (status === 'Inativa') return <Badge variant="secondary">Inativa</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700">Em andamento</Badge>;
};

export default function SalesGoalsTab() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [treatments, setTreatments] = useState<Array<{ id: string; name: string; category_id: string | null }>>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, GoalMetrics>>({});

  const [filterPeriodType, setFilterPeriodType] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterGoalType, setFilterGoalType] = useState<string>('all');
  const [filterCategoryTreatment, setFilterCategoryTreatment] = useState<string>('all');
  const [filterMetaStatus, setFilterMetaStatus] = useState<string>('all');

  const [formGoalType, setFormGoalType] = useState<GoalType>('clinic');
  const [formGoalName, setFormGoalName] = useState('');
  const [formUserId, setFormUserId] = useState('');
  const [formTeamName, setFormTeamName] = useState('');
  const [formScopeMode, setFormScopeMode] = useState<'all' | 'category' | 'treatment'>('all');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formTreatmentId, setFormTreatmentId] = useState('');
  const [formPeriodType, setFormPeriodType] = useState<PeriodType>('monthly');
  const [formReference, setFormReference] = useState(format(new Date(), 'yyyy-MM'));
  const [formStartDate, setFormStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formEndDate, setFormEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formAmount, setFormAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<GoalStatus>('active');

  const periodLabel = (g: GoalRow) => {
    const range = rangeFromGoal(g);
    if (!range) return g.period_reference;
    return `${format(parseISO(range.start), 'dd/MM/yyyy')} - ${format(parseISO(range.end), 'dd/MM/yyyy')}`;
  };

  const clearForm = () => {
    setEditingGoalId(null);
    setFormGoalType('clinic');
    setFormGoalName('');
    setFormUserId('');
    setFormTeamName('');
    setFormScopeMode('all');
    setFormCategoryId('');
    setFormTreatmentId('');
    setFormPeriodType('monthly');
    setFormReference(format(new Date(), 'yyyy-MM'));
    setFormStartDate(format(new Date(), 'yyyy-MM-dd'));
    setFormEndDate(format(new Date(), 'yyyy-MM-dd'));
    setFormAmount('');
    setFormNotes('');
    setFormStatus('active');
  };

  const loadBaseData = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const [goalsRes, staffRes, categoriesRes, treatmentsRes] = await Promise.all([
      supabase.from('sales_goals' as never).select('*').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId).eq('is_active', true),
      supabase.from('treatment_categories' as never).select('id,name').eq('clinic_id', clinicId).eq('status', 'active').order('name'),
      supabase.from('treatments').select('id,name,category_id').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
    ]);

    if (goalsRes.error) toast.error(goalsRes.error.message);
    if (staffRes.error) toast.error(staffRes.error.message);
    if (categoriesRes.error) toast.error(categoriesRes.error.message);
    if (treatmentsRes.error) toast.error(treatmentsRes.error.message);

    setGoals(((goalsRes.data || []) as GoalRow[]).map((g) => ({
      ...g,
      goal_type: (g.goal_type || 'user') as GoalType,
      status: (g.status || 'active') as GoalStatus,
      category_id: g.category_id || null,
      treatment_id: g.treatment_id || null,
      team_name: g.team_name || null,
      notes: g.notes || null,
      period_start: g.period_start || null,
      period_end: g.period_end || null,
      user_id: g.user_id || null,
    })));
    setStaff((staffRes.data || []) as StaffRow[]);
    setCategories((categoriesRes.data || []) as Array<{ id: string; name: string }>);
    setTreatments((treatmentsRes.data || []) as Array<{ id: string; name: string; category_id: string | null }>);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) loadBaseData();
  }, [clinicId, loadBaseData]);

  const isClosedContract = (contract: { status?: string; process_status?: string }) => {
    if (contract.status === 'cancelled') return false;
    if (contract.process_status === 'cancelled') return false;
    return true;
  };

  const getContractDate = (contract: { signed_at?: string | null; confirmed_at?: string | null; created_at?: string | null }) => {
    return contract.signed_at || contract.confirmed_at || contract.created_at || null;
  };

  const computeGoalMetrics = useCallback(async (goal: GoalRow): Promise<GoalMetrics> => {
    const range = rangeFromGoal(goal);
    if (!range || !clinicId) return { sold: 0, contracts: 0, missing: Math.max(goal.goal_amount, 0), pct: 0, ticket: 0 };

    let contractsQuery = supabase
      .from('contracts')
      .select('id, created_at, signed_at, confirmed_at, status, process_status, created_by, proposal_id')
      .eq('clinic_id', clinicId);

    if (goal.goal_type === 'user' && goal.user_id) {
      contractsQuery = contractsQuery.eq('created_by', goal.user_id);
    }

    const { data: contractRows, error: contractsError } = await contractsQuery;
    if (contractsError) throw contractsError;

    const closedInPeriod = (contractRows || []).filter((c) => {
      if (!isClosedContract(c)) return false;
      const date = getContractDate(c);
      if (!date) return false;
      const ymd = date.slice(0, 10);
      return ymd >= range.start && ymd <= range.end;
    });

    if (closedInPeriod.length === 0) return { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };

    const contractIds = closedInPeriod.map((c) => c.id);
    const proposalIds = closedInPeriod.map((c) => c.proposal_id).filter(Boolean) as string[];

    let allowedContractIds = new Set(contractIds);
    if (goal.goal_type === 'category_treatment' && (goal.category_id || goal.treatment_id)) {
      const { data: proposalItems, error: proposalItemsError } = await supabase
        .from('proposal_items')
        .select('proposal_id,treatment_id')
        .in('proposal_id', proposalIds);

      if (proposalItemsError) throw proposalItemsError;
      const treatmentIds = Array.from(new Set((proposalItems || []).map((p) => p.treatment_id).filter(Boolean)));

      const { data: treatmentRows, error: treatmentsError } = await supabase
        .from('treatments')
        .select('id,category_id')
        .in('id', treatmentIds);

      if (treatmentsError) throw treatmentsError;
      const treatmentMap = new Map((treatmentRows || []).map((t) => [t.id, t]));

      const acceptedProposals = new Set<string>();
      (proposalItems || []).forEach((item) => {
        const treatment = treatmentMap.get(item.treatment_id);
        if (!treatment) return;
        if (goal.treatment_id && item.treatment_id === goal.treatment_id) acceptedProposals.add(item.proposal_id);
        if (goal.category_id && treatment.category_id === goal.category_id) acceptedProposals.add(item.proposal_id);
      });

      allowedContractIds = new Set(
        closedInPeriod.filter((c) => c.proposal_id && acceptedProposals.has(c.proposal_id)).map((c) => c.id),
      );
    }

    const filteredContracts = closedInPeriod.filter((c) => allowedContractIds.has(c.id));
    if (filteredContracts.length === 0) {
      return { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };
    }

    const filteredIds = filteredContracts.map((c) => c.id);

    const [planRes, proposalRes] = await Promise.all([
      supabase
        .from('contract_payment_plans' as never)
        .select('contract_id,total_contract_value,total_predicted_value')
        .in('contract_id', filteredIds),
      supabase
        .from('proposals')
        .select('id,final_amount')
        .in('id', filteredContracts.map((c) => c.proposal_id).filter(Boolean) as string[]),
    ]);

    if (planRes.error) throw planRes.error;
    if (proposalRes.error) throw proposalRes.error;

    const proposalAmountById = new Map((proposalRes.data || []).map((p) => [p.id, Number(p.final_amount || 0)]));
    const planAmountByContract = new Map((planRes.data || []).map((p) => [p.contract_id, Number(p.total_contract_value || p.total_predicted_value || 0)]));

    const sold = filteredContracts.reduce((sum, contract) => {
      const fromPlan = planAmountByContract.get(contract.id);
      if (fromPlan && fromPlan > 0) return sum + fromPlan;
      if (contract.proposal_id) return sum + Number(proposalAmountById.get(contract.proposal_id) || 0);
      return sum;
    }, 0);

    const contracts = filteredContracts.length;
    const missing = Math.max(goal.goal_amount - sold, 0);
    const pct = goal.goal_amount > 0 ? (sold / goal.goal_amount) * 100 : 0;
    const ticket = contracts > 0 ? sold / contracts : 0;

    return { sold, contracts, missing, pct, ticket };
  }, [clinicId]);

  const recomputeMetrics = useCallback(async (sourceGoals: GoalRow[]) => {
    if (!clinicId || sourceGoals.length === 0) {
      setMetricsMap({});
      return;
    }
    const entries = await Promise.all(
      sourceGoals.map(async (goal) => {
        try {
          const metrics = await computeGoalMetrics(goal);
          return [goal.id, metrics] as const;
        } catch {
          return [goal.id, { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 }] as const;
        }
      }),
    );
    setMetricsMap(Object.fromEntries(entries));
  }, [clinicId, computeGoalMetrics]);

  useEffect(() => {
    if (goals.length > 0) recomputeMetrics(goals);
    if (goals.length === 0) setMetricsMap({});
  }, [goals, recomputeMetrics]);

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId) return;
    if (!formAmount || Number(formAmount) <= 0) {
      toast.error('Informe um valor de meta válido.');
      return;
    }
    if (formGoalType === 'user' && !formUserId) {
      toast.error('Selecione o usuário da meta.');
      return;
    }
    if (formGoalType === 'team' && !formTeamName.trim()) {
      toast.error('Informe o nome da equipe.');
      return;
    }
    if (formGoalType === 'category_treatment') {
      if (formScopeMode === 'category' && !formCategoryId) {
        toast.error('Selecione uma categoria.');
        return;
      }
      if (formScopeMode === 'treatment' && !formTreatmentId) {
        toast.error('Selecione um tratamento.');
        return;
      }
    }
    if (formPeriodType === 'custom' && formStartDate > formEndDate) {
      toast.error('Período personalizado inválido.');
      return;
    }

    const payload: Record<string, unknown> = {
      clinic_id: clinicId,
      goal_name: formGoalName.trim() || null,
      goal_type: formGoalType,
      user_id: formGoalType === 'user' ? formUserId : null,
      team_name: formGoalType === 'team' ? formTeamName.trim() : null,
      category_id: formGoalType === 'category_treatment' && formScopeMode === 'category' ? formCategoryId : null,
      treatment_id: formGoalType === 'category_treatment' && formScopeMode === 'treatment' ? formTreatmentId : null,
      period_type: formPeriodType,
      period_reference: formReference,
      period_start: formPeriodType === 'custom' ? formStartDate : null,
      period_end: formPeriodType === 'custom' ? formEndDate : null,
      goal_amount: Number(formAmount),
      notes: formNotes.trim() || null,
      status: formStatus,
      created_by: user?.id || null,
    };

    setSaving(true);
    const query = editingGoalId
      ? supabase.from('sales_goals' as never).update(payload as never).eq('id', editingGoalId)
      : supabase.from('sales_goals' as never).insert(payload as never);
    const { error } = await query;
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editingGoalId ? 'Meta atualizada com sucesso.' : 'Meta criada com sucesso.');
    setDialogOpen(false);
    clearForm();
    await loadBaseData();
  };

  const handleToggleStatus = async (goal: GoalRow) => {
    const nextStatus: GoalStatus = goal.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('sales_goals' as never).update({ status: nextStatus } as never).eq('id', goal.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextStatus === 'active' ? 'Meta ativada.' : 'Meta inativada.');
    await loadBaseData();
  };

  const openEdit = (goal: GoalRow) => {
    setEditingGoalId(goal.id);
    setFormGoalType(goal.goal_type || 'user');
    setFormGoalName(goal.goal_name || '');
    setFormUserId(goal.user_id || '');
    setFormTeamName(goal.team_name || '');
    if (goal.treatment_id) setFormScopeMode('treatment');
    else if (goal.category_id) setFormScopeMode('category');
    else setFormScopeMode('all');
    setFormCategoryId(goal.category_id || '');
    setFormTreatmentId(goal.treatment_id || '');
    setFormPeriodType(goal.period_type || 'monthly');
    setFormReference(goal.period_reference || format(new Date(), 'yyyy-MM'));
    setFormStartDate(goal.period_start || format(new Date(), 'yyyy-MM-dd'));
    setFormEndDate(goal.period_end || format(new Date(), 'yyyy-MM-dd'));
    setFormAmount(String(goal.goal_amount || ''));
    setFormNotes(goal.notes || '');
    setFormStatus(goal.status || 'active');
    setDialogOpen(true);
  };

  const goalTypeLabel = (goal: GoalRow) => {
    if (goal.goal_type === 'clinic') return 'Clínica geral';
    if (goal.goal_type === 'user') return 'Usuário / vendedor';
    if (goal.goal_type === 'team') return 'Equipe';
    return 'Categoria / tratamento';
  };

  const responsibleLabel = (goal: GoalRow) => {
    if (goal.goal_type === 'clinic') return 'Clínica';
    if (goal.goal_type === 'team') return goal.team_name || 'Equipe';
    if (goal.goal_type === 'user') {
      const staffItem = staff.find((s) => s.user_id === goal.user_id);
      if (staffItem) return `${staffItem.user_id.slice(0, 8)}... (${staffItem.role})`;
      return goal.user_id ? `${goal.user_id.slice(0, 8)}...` : 'Sem responsável';
    }
    if (goal.treatment_id) return treatments.find((t) => t.id === goal.treatment_id)?.name || 'Tratamento';
    if (goal.category_id) return categories.find((c) => c.id === goal.category_id)?.name || 'Categoria';
    return 'Todos';
  };

  const goalsWithComputed = useMemo(() => {
    return goals.map((goal) => {
      const metrics = metricsMap[goal.id] || { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };
      return { goal, metrics, status: computeMetaStatus(goal, metrics) };
    });
  }, [goals, metricsMap]);

  const filteredForTrack = goalsWithComputed.filter(({ goal, status }) => {
    if (filterPeriodType !== 'all' && goal.period_type !== filterPeriodType) return false;
    if (filterUser !== 'all' && goal.user_id !== filterUser) return false;
    if (filterGoalType !== 'all' && goal.goal_type !== filterGoalType) return false;
    if (filterMetaStatus !== 'all' && status !== filterMetaStatus) return false;
    if (filterCategoryTreatment !== 'all') {
      if (goal.treatment_id !== filterCategoryTreatment && goal.category_id !== filterCategoryTreatment) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <Tabs defaultValue="registered" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="registered">Metas cadastradas</TabsTrigger>
          <TabsTrigger value="tracking">Acompanhamento</TabsTrigger>
        </TabsList>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground" onClick={() => clearForm()}>
              <Plus className="w-4 h-4 mr-2" />Nova Meta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                {editingGoalId ? 'Editar Meta' : 'Nova Meta'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome da Meta</Label>
                  <Input value={formGoalName} onChange={(e) => setFormGoalName(e.target.value)} placeholder="Ex.: Renovações, Dia das Mães" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo da meta</Label>
                  <Select value={formGoalType} onValueChange={(v) => setFormGoalType(v as GoalType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {goalTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {formGoalType === 'user' && (
                  <div className="space-y-2">
                    <Label>Usuário</Label>
                    <Select value={formUserId} onValueChange={setFormUserId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar usuário" /></SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.user_id.slice(0, 8)}... ({s.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formGoalType === 'team' && (
                  <div className="space-y-2">
                    <Label>Equipe</Label>
                    <Input value={formTeamName} onChange={(e) => setFormTeamName(e.target.value)} placeholder="Ex.: Comercial" />
                  </div>
                )}
                {formGoalType === 'category_treatment' && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Categoria / Tratamento</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Select value={formScopeMode} onValueChange={(v) => setFormScopeMode(v as 'all' | 'category' | 'treatment')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="category">Categoria</SelectItem>
                          <SelectItem value="treatment">Tratamento</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={formCategoryId} onValueChange={setFormCategoryId} disabled={formScopeMode !== 'category'}>
                        <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={formTreatmentId} onValueChange={setFormTreatmentId} disabled={formScopeMode !== 'treatment'}>
                        <SelectTrigger><SelectValue placeholder="Tratamento" /></SelectTrigger>
                        <SelectContent>
                          {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select value={formPeriodType} onValueChange={(v) => setFormPeriodType(v as PeriodType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {periodTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Referência do período</Label>
                  <Input value={formReference} onChange={(e) => setFormReference(e.target.value)} placeholder="Ex.: 2026-05, 2026-Q2, 2026-05-17" />
                </div>
              </div>

              {formPeriodType === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Data inicial</Label>
                    <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data final</Label>
                    <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor da meta (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formStatus} onValueChange={(v) => setFormStatus(v as GoalStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="inactive">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Opcional" rows={2} />
              </div>

              <Button type="submit" disabled={saving} className="w-full gradient-primary text-primary-foreground">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingGoalId ? 'Salvar alterações' : 'Cadastrar meta'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <TabsContent value="registered">
        <Card className="shadow-card">
          <CardHeader><CardTitle>Metas cadastradas</CardTitle></CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma meta cadastrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Meta</th>
                      <th className="pb-2 pr-4">Responsável</th>
                      <th className="pb-2 pr-4">Período</th>
                      <th className="pb-2 pr-4 text-right">Valor</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {goals.map((goal) => (
                      <tr key={goal.id}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">{goal.goal_name || goalTypeLabel(goal)}</div>
                          <div className="text-xs text-muted-foreground">{goalTypeLabel(goal)}</div>
                        </td>
                        <td className="py-3 pr-4">{responsibleLabel(goal)}</td>
                        <td className="py-3 pr-4">{periodLabel(goal)}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{currency(goal.goal_amount)}</td>
                        <td className="py-3 pr-4">{goal.status === 'active' ? <Badge className="bg-green-100 text-green-700">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(goal)}>Editar</Button>
                            <Button variant="outline" size="sm" onClick={() => handleToggleStatus(goal)}>
                              {goal.status === 'active' ? 'Inativar' : 'Ativar'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tracking" className="space-y-4">
        <Card className="shadow-card">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <Select value={filterPeriodType} onValueChange={setFilterPeriodType}>
              <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                {periodTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue placeholder="Usuário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.user_id.slice(0, 8)}... ({s.role})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGoalType} onValueChange={setFilterGoalType}>
              <SelectTrigger><SelectValue placeholder="Tipo da meta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {goalTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategoryTreatment} onValueChange={setFilterCategoryTreatment}>
              <SelectTrigger><SelectValue placeholder="Categoria/Tratamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                {treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMetaStatus} onValueChange={setFilterMetaStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="Não iniciada">Não iniciada</SelectItem>
                <SelectItem value="Em andamento">Em andamento</SelectItem>
                <SelectItem value="Batida">Batida</SelectItem>
                <SelectItem value="Superada">Superada</SelectItem>
                <SelectItem value="Não atingida">Não atingida</SelectItem>
                <SelectItem value="Inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Acompanhamento</CardTitle></CardHeader>
          <CardContent>
            {filteredForTrack.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem metas para os filtros aplicados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Meta</th>
                      <th className="pb-2 pr-4">Responsável</th>
                      <th className="pb-2 pr-4">Período</th>
                      <th className="pb-2 pr-4 text-right">Valor Meta</th>
                      <th className="pb-2 pr-4 text-right">Vendido</th>
                      <th className="pb-2 pr-4 text-right">Falta</th>
                      <th className="pb-2 pr-4 text-right">% Atingido</th>
                      <th className="pb-2 pr-4 text-right">Contratos</th>
                      <th className="pb-2 pr-4 text-right">Ticket Médio</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredForTrack.map(({ goal, metrics, status }) => (
                      <tr key={goal.id}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">{goal.goal_name || goalTypeLabel(goal)}</div>
                          <div className="text-xs text-muted-foreground">{goalTypeLabel(goal)}</div>
                        </td>
                        <td className="py-3 pr-4">{responsibleLabel(goal)}</td>
                        <td className="py-3 pr-4">{periodLabel(goal)}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{currency(goal.goal_amount)}</td>
                        <td className="py-3 pr-4 text-right">{currency(metrics.sold)}</td>
                        <td className="py-3 pr-4 text-right">{currency(metrics.missing)}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{metrics.pct.toFixed(1)}%</td>
                        <td className="py-3 pr-4 text-right">{metrics.contracts}</td>
                        <td className="py-3 pr-4 text-right">{currency(metrics.ticket)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {statusBadge(status)}
                            {metrics.pct >= 100 ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
