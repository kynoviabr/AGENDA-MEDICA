import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseISO, format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';

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
  status: GoalStatus;
}

interface GoalMetrics {
  sold: number;
  contracts: number;
  missing: number;
  pct: number;
  ticket: number;
}

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const parseDateValue = (value: string) => {
  try { return parseISO(value); } catch { return null; }
};
const toYmd = (date: Date) => format(date, 'yyyy-MM-dd');

const quarterFromRef = (reference: string) => {
  const m = reference.match(/^(\d{4})-Q([1-4])$/i);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3;
  return { start: new Date(year, startMonth, 1), end: endOfMonth(new Date(year, startMonth + 2, 1)) };
};

const rangeFromGoal = (goal: GoalRow) => {
  if (goal.period_start && goal.period_end) return { start: goal.period_start, end: goal.period_end };
  const ref = goal.period_reference || '';
  if (goal.period_type === 'daily') return { start: ref, end: ref };
  if (goal.period_type === 'weekly') {
    const parsed = parseDateValue(ref); if (!parsed) return null;
    return { start: toYmd(startOfWeek(parsed, { weekStartsOn: 1 })), end: toYmd(endOfWeek(parsed, { weekStartsOn: 1 })) };
  }
  if (goal.period_type === 'monthly') {
    const parsed = parseDateValue(`${ref}-01`); if (!parsed) return null;
    return { start: toYmd(startOfMonth(parsed)), end: toYmd(endOfMonth(parsed)) };
  }
  if (goal.period_type === 'quarterly') {
    const q = quarterFromRef(ref); if (!q) return null;
    return { start: toYmd(q.start), end: toYmd(q.end) };
  }
  if (goal.period_type === 'yearly') {
    const parsed = parseDateValue(`${ref}-01-01`); if (!parsed) return null;
    return { start: toYmd(startOfYear(parsed)), end: toYmd(endOfYear(parsed)) };
  }
  return null;
};

const goalTypeLabel = (goal: GoalRow) => {
  if (goal.goal_type === 'clinic') return 'Clínica geral';
  if (goal.goal_type === 'user') return 'Usuário';
  if (goal.goal_type === 'team') return 'Equipe';
  return 'Categoria/Tratamento';
};

export default function GoalsTrackingPage() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [staff, setStaff] = useState<Array<{ user_id: string; role: string }>>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, GoalMetrics>>({});
  const [filterUser, setFilterUser] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const activeTab = location.pathname.endsWith('/minha-meta')
    ? 'mine'
    : location.pathname.endsWith('/equipe')
      ? 'team'
      : 'tracking';

  const setTab = (tab: string) => {
    if (tab === 'mine') navigate('/clinic/metas/minha-meta');
    else if (tab === 'team') navigate('/clinic/metas/equipe');
    else navigate('/clinic/metas/acompanhamento');
  };

  const isClosed = (c: { status?: string; process_status?: string }) => c.status !== 'cancelled' && c.process_status !== 'cancelled';
  const contractDate = (c: { signed_at?: string | null; created_at?: string | null; confirmed_at?: string | null }) =>
    c.signed_at || c.confirmed_at || c.created_at || null;

  const computeMetrics = useCallback(async (goal: GoalRow): Promise<GoalMetrics> => {
    if (!clinicId) return { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };
    const range = rangeFromGoal(goal);
    if (!range) return { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };

    let q = supabase
      .from('contracts')
      .select('id, proposal_id, created_by, status, process_status, created_at, signed_at, confirmed_at')
      .eq('clinic_id', clinicId);
    if (goal.goal_type === 'user' && goal.user_id) q = q.eq('created_by', goal.user_id);
    const { data: contractsData } = await q;
    const inPeriod = (contractsData || []).filter((c) => {
      if (!isClosed(c)) return false;
      const d = contractDate(c);
      if (!d) return false;
      const ymd = d.slice(0, 10);
      return ymd >= range.start && ymd <= range.end;
    });
    if (inPeriod.length === 0) return { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 };

    const ids = inPeriod.map((c) => c.id);
    const proposals = inPeriod.map((c) => c.proposal_id).filter(Boolean) as string[];

    const [plansRes, propRes] = await Promise.all([
      supabase.from('contract_payment_plans' as never).select('contract_id,total_contract_value,total_predicted_value').in('contract_id', ids),
      supabase.from('proposals').select('id,final_amount').in('id', proposals),
    ]);

    const planByContract = new Map((plansRes.data || []).map((p) => [p.contract_id, Number(p.total_contract_value || p.total_predicted_value || 0)]));
    const propById = new Map((propRes.data || []).map((p) => [p.id, Number(p.final_amount || 0)]));

    const sold = inPeriod.reduce((sum, c) => {
      const fromPlan = planByContract.get(c.id);
      if (fromPlan && fromPlan > 0) return sum + fromPlan;
      if (c.proposal_id) return sum + Number(propById.get(c.proposal_id) || 0);
      return sum;
    }, 0);

    const contracts = inPeriod.length;
    const missing = Math.max(goal.goal_amount - sold, 0);
    const pct = goal.goal_amount > 0 ? (sold / goal.goal_amount) * 100 : 0;
    const ticket = contracts > 0 ? sold / contracts : 0;
    return { sold, contracts, missing, pct, ticket };
  }, [clinicId]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const [goalsRes, staffRes] = await Promise.all([
      supabase.from('sales_goals' as never).select('*').eq('clinic_id', clinicId).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId).eq('is_active', true),
    ]);
    const loadedGoals = ((goalsRes.data || []) as GoalRow[]).map((g) => ({ ...g, goal_type: (g.goal_type || 'user') as GoalType }));
    setGoals(loadedGoals);
    setStaff((staffRes.data || []) as Array<{ user_id: string; role: string }>);

    const metricsEntries = await Promise.all(loadedGoals.map(async (g) => [g.id, await computeMetrics(g)] as const));
    setMetricsMap(Object.fromEntries(metricsEntries));
    setLoading(false);
  }, [clinicId, computeMetrics]);

  useEffect(() => { if (clinicId) load(); }, [clinicId, load]);

  const rows = useMemo(() => {
    const withMetrics = goals.map((goal) => ({ goal, metrics: metricsMap[goal.id] || { sold: 0, contracts: 0, missing: goal.goal_amount, pct: 0, ticket: 0 } }));
    const byTab = withMetrics.filter(({ goal }) => {
      if (activeTab === 'mine') return goal.user_id === user?.id;
      if (activeTab === 'team') return goal.goal_type === 'user' || goal.goal_type === 'team' || goal.goal_type === 'clinic';
      return true;
    });
    return byTab.filter(({ goal }) => (filterUser === 'all' || goal.user_id === filterUser) && (filterType === 'all' || goal.goal_type === filterType));
  }, [goals, metricsMap, activeTab, user?.id, filterUser, filterType]);

  const summary = useMemo(() => {
    const goal = rows.reduce((s, r) => s + Number(r.goal.goal_amount || 0), 0);
    const sold = rows.reduce((s, r) => s + Number(r.metrics.sold || 0), 0);
    const contracts = rows.reduce((s, r) => s + Number(r.metrics.contracts || 0), 0);
    const pct = goal > 0 ? (sold / goal) * 100 : 0;
    return { goal, sold, contracts, pct, missing: Math.max(goal - sold, 0) };
  }, [rows]);

  return (
    <div>
      <PageHeader title="Acompanhamento de Metas" description="Desempenho comercial automático por contratos fechados no período." />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="tracking">Acompanhamento</TabsTrigger>
          <TabsTrigger value="mine">Minha Meta</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
        </TabsList>

        <Card className="shadow-card">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue placeholder="Usuário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos usuários</SelectItem>
                {staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.user_id.slice(0, 8)}... ({s.role})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue placeholder="Tipo da meta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="clinic">Clínica geral</SelectItem>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="team">Equipe</SelectItem>
                <SelectItem value="category_treatment">Categoria/Tratamento</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Meta total</p><p className="font-semibold">{currency(summary.goal)}</p></div>
              <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Vendido</p><p className="font-semibold">{currency(summary.sold)}</p></div>
              <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Falta</p><p className="font-semibold">{currency(summary.missing)}</p></div>
              <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">% Atingido</p><p className="font-semibold">{summary.pct.toFixed(1)}%</p></div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value={activeTab} className="mt-0">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem metas para os filtros selecionados.</p>
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
                      {rows.map(({ goal, metrics }) => {
                        const responsible = goal.user_id ? `${goal.user_id.slice(0, 8)}...` : goal.team_name || 'Clínica';
                        const range = rangeFromGoal(goal);
                        const period = range ? `${format(parseISO(range.start), 'dd/MM/yyyy')} - ${format(parseISO(range.end), 'dd/MM/yyyy')}` : goal.period_reference;
                        return (
                          <tr key={goal.id}>
                            <td className="py-3 pr-4">
                              <div className="font-medium text-foreground">{goal.goal_name || goalTypeLabel(goal)}</div>
                              <div className="text-xs text-muted-foreground">{goalTypeLabel(goal)}</div>
                            </td>
                            <td className="py-3 pr-4">{responsible}</td>
                            <td className="py-3 pr-4">{period}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{currency(goal.goal_amount)}</td>
                            <td className="py-3 pr-4 text-right">{currency(metrics.sold)}</td>
                            <td className="py-3 pr-4 text-right">{currency(metrics.missing)}</td>
                            <td className="py-3 pr-4 text-right font-semibold">{metrics.pct.toFixed(1)}%</td>
                            <td className="py-3 pr-4 text-right">{metrics.contracts}</td>
                            <td className="py-3 pr-4 text-right">{currency(metrics.ticket)}</td>
                            <td className="py-3">
                              {metrics.pct >= 120
                                ? <Badge className="bg-emerald-100 text-emerald-700">Superada</Badge>
                                : metrics.pct >= 100
                                  ? <Badge className="bg-green-100 text-green-700">Batida</Badge>
                                  : <Badge className="bg-yellow-100 text-yellow-700">Em andamento</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
