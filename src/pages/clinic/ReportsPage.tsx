import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandStat } from '@/components/ui/brand-stat';
import { RoleBadge } from '@/components/RoleBadge';
import {
  FileText, ClipboardList, Download, Loader2, TrendingUp, TrendingDown,
  DollarSign, BarChart3, Target, Trophy, AlertTriangle, Users
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  generateFinancialPDF, generateSessionsPDF,
  type FinancialRow, type SessionRow,
} from '@/lib/reportPDF';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { cn } from '@/lib/utils';

const paymentMethodLabels: Record<string, string> = {
  credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito',
  pix: 'PIX', bank_transfer: 'Transferência', cash: 'Dinheiro', boleto: 'Boleto',
};

const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function goalStatusBadge(pct: number) {
  if (pct >= 100) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">{pct > 100 ? '🏆 Meta superada' : 'Meta atingida'}</span>;
  if (pct >= 70) return <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full border border-yellow-200">Em andamento</span>;
  return <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">Abaixo da meta</span>;
}

export default function ReportsPage() {
  const { clinicId } = useUserRole();
  const { role } = useUserRole();
  const { user } = useAuth();
  const { clinicName } = useBranding();
  const navigate = useNavigate();
  const now = new Date();
  const isAdmin = role === 'admin';
  const isSales = role === 'sales';

  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [sellerFilter, setSellerFilter] = useState(isSales ? (user?.id || 'all') : 'all');
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const periodLabel = `${format(new Date(startDate + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(endDate + 'T12:00'), 'dd/MM/yyyy', { locale: ptBR })}`;

  // Staff list
  const { data: staffList = [] } = useQuery({
    queryKey: ['reports-staff', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role')
        .eq('clinic_id', clinicId!).eq('is_active', true);
      return data || [];
    },
    enabled: !!clinicId,
  });

  // Sales data
  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['reports-sales', clinicId, startDate, endDate, sellerFilter],
    queryFn: async () => {
      let query = supabase.from('proposals')
        .select('id, final_amount, created_by, created_at, updated_at, status')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted' as unknown)
        .gte('updated_at', startDate)
        .lte('updated_at', endDate + 'T23:59:59');

      if (sellerFilter && sellerFilter !== 'all') query = query.eq('created_by', sellerFilter);

      const { data: proposals } = await query;

      // Proposal items for treatment breakdown
      const proposalIds = (proposals || []).map(p => p.id);
      let items: unknown[] = [];
      if (proposalIds.length > 0) {
        const { data } = await supabase.from('proposal_items')
          .select('*, treatments(name, id)')
          .in('proposal_id', proposalIds);
        items = data || [];
      }

      // Cost data for margin (admin only)
      const costMap: Record<string, number> = {};
      if (isAdmin) {
        const { data: costItems } = await supabase.from('treatment_cost_items')
          .select('treatment_id, quantity, cost_items(unit_cost)');
        const ci = (costItems as unknown[]) || [];
        ci.forEach((c: unknown) => {
          const tid = c.treatment_id;
          const cost = Number(c.quantity) * Number(c.cost_items?.unit_cost || 0);
          costMap[tid] = (costMap[tid] || 0) + cost;
        });
      }

      // Goals
      const currentMonth = format(now, 'yyyy-MM');
      const { data: goals } = await supabase.from('sales_goals' as unknown)
        .select('*').eq('clinic_id', clinicId!);

      return { proposals: proposals || [], items, costMap, goals: (goals as unknown[]) || [] };
    },
    enabled: !!clinicId,
  });

  // ── Section 1: Sales by period ──
  const periodChartData = (() => {
    if (!salesReport) return [];
    const proposals = salesReport.proposals;
    const weeks = eachWeekOfInterval({ start: new Date(startDate), end: new Date(endDate) }, { locale: ptBR });
    return weeks.map((weekStart, i) => {
      const wEnd = endOfWeek(weekStart, { locale: ptBR });
      const weekProposals = proposals.filter(p => {
        const d = new Date(p.updated_at);
        return d >= weekStart && d <= wEnd;
      });
      const total = weekProposals.reduce((s, p) => s + Number(p.final_amount || 0), 0);
      return {
        label: `Sem ${i + 1}`,
        total,
        count: weekProposals.length,
        ticket: weekProposals.length > 0 ? total / weekProposals.length : 0,
      };
    });
  })();

  // ── Section 2: Sales by seller (admin only) ──
  const sellerData = (() => {
    if (!salesReport || !isAdmin) return [];
    const byUser: Record<string, { count: number; total: number }> = {};
    salesReport.proposals.forEach(p => {
      const uid = p.created_by || 'unknown';
      if (!byUser[uid]) byUser[uid] = { count: 0, total: 0 };
      byUser[uid].count++;
      byUser[uid].total += Number(p.final_amount || 0);
    });
    return Object.entries(byUser)
      .map(([userId, data]) => {
        const staff = staffList.find(s => s.user_id === userId);
        const goal = salesReport.goals.find((g: unknown) => g.user_id === userId);
        const goalAmount = goal ? Number(goal.goal_amount) : 0;
        const pct = goalAmount > 0 ? Math.round((data.total / goalAmount) * 100) : 0;
        return { userId, ...data, ticket: data.count > 0 ? data.total / data.count : 0, role: staff?.role || 'admin', goalAmount, pct };
      })
      .sort((a, b) => b.total - a.total);
  })();

  // ── Section 3: Sales by treatment ──
  const treatmentData = (() => {
    if (!salesReport) return [];
    const byTreatment: Record<string, { name: string; count: number; revenue: number; treatmentId: string }> = {};
    salesReport.items.forEach((item: unknown) => {
      const tid = item.treatment_id;
      const name = item.treatments?.name || 'Desconhecido';
      if (!byTreatment[tid]) byTreatment[tid] = { name, count: 0, revenue: 0, treatmentId: tid };
      byTreatment[tid].count += item.quantity;
      byTreatment[tid].revenue += Number(item.subtotal || 0);
    });
    return Object.values(byTreatment).sort((a, b) => b.revenue - a.revenue);
  })();

  // ── Section 4: Margin analysis (admin only) ──
  const marginData = (() => {
    if (!salesReport || !isAdmin) return { rows: [], totalRevenue: 0, totalCost: 0 };
    const byTreatment: Record<string, { name: string; units: number; revenue: number; cost: number }> = {};
    salesReport.items.forEach((item: unknown) => {
      const tid = item.treatment_id;
      const name = item.treatments?.name || 'Desconhecido';
      if (!byTreatment[tid]) byTreatment[tid] = { name, units: 0, revenue: 0, cost: 0 };
      byTreatment[tid].units += item.quantity;
      byTreatment[tid].revenue += Number(item.subtotal || 0);
      const unitCost = salesReport.costMap[tid] || 0;
      byTreatment[tid].cost += unitCost * item.quantity;
    });
    const rows = Object.values(byTreatment).sort((a, b) => {
      const ma = a.revenue > 0 ? ((a.revenue - a.cost) / a.revenue) * 100 : 0;
      const mb = b.revenue > 0 ? ((b.revenue - b.cost) / b.revenue) * 100 : 0;
      return mb - ma;
    });
    return {
      rows,
      totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
      totalCost: rows.reduce((s, r) => s + r.cost, 0),
    };
  })();

  // ── Section 5: Goal vs Actual ──
  const goalData = (() => {
    if (!salesReport) return [];
    const goals = salesReport.goals;
    const byUser: Record<string, number> = {};
    salesReport.proposals.forEach(p => {
      if (p.created_by) byUser[p.created_by] = (byUser[p.created_by] || 0) + Number(p.final_amount || 0);
    });

    let entries = goals.map((g: unknown) => {
      const staff = staffList.find(s => s.user_id === g.user_id);
      const realized = byUser[g.user_id] || 0;
      const goalAmount = Number(g.goal_amount);
      const pct = goalAmount > 0 ? Math.round((realized / goalAmount) * 100) : 0;
      return { userId: g.user_id, role: staff?.role || 'admin', goalAmount, realized, diff: realized - goalAmount, pct };
    });

    if (isSales) entries = entries.filter(e => e.userId === user?.id);
    return entries;
  })();

  // PDF exports
  const handleFinancialExport = async () => {
    if (!clinicId) return;
    setLoadingFinancial(true);
    try {
      const { data: plans, error } = await supabase.from('payment_plans')
        .select('*, patients!inner(full_name), contracts!inner(contract_number)')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      if (!plans?.length) { toast.info('Nenhum dado financeiro encontrado'); return; }
      const planIds = plans.map(p => p.id);
      const { data: installments } = await supabase.from('payment_installments')
        .select('*').in('payment_plan_id', planIds)
        .gte('due_date', startDate).lte('due_date', endDate);
      const installmentsByPlan = (installments || []).reduce((acc: Record<string, unknown[]>, inst) => {
        (acc[inst.payment_plan_id] = acc[inst.payment_plan_id] || []).push(inst);
        return acc;
      }, {});
      let totalRevenue = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;
      const rows: FinancialRow[] = [];
      for (const plan of plans) {
        const insts = installmentsByPlan[plan.id] || [];
        if (!insts.length) continue;
        const paidInsts = insts.filter((i: unknown) => i.status === 'paid');
        const paidAmount = paidInsts.reduce((s: number, i: unknown) => s + Number(i.amount), 0);
        const totalAmount = insts.reduce((s: number, i: unknown) => s + Number(i.amount), 0);
        const pendingAmount = totalAmount - paidAmount;
        const overdueInsts = insts.filter((i: unknown) => i.status === 'overdue');
        const overdueAmount = overdueInsts.reduce((s: number, i: unknown) => s + Number(i.amount), 0);
        totalRevenue += totalAmount; totalPaid += paidAmount; totalPending += pendingAmount; totalOverdue += overdueAmount;
        rows.push({
          patient: (plan as unknown).patients?.full_name || '—',
          contractNumber: (plan as unknown).contracts?.contract_number || '—',
          totalAmount, numInstallments: insts.length, paidCount: paidInsts.length, paidAmount, pendingAmount,
          method: paymentMethodLabels[plan.payment_method] || plan.payment_method,
        });
      }
      generateFinancialPDF(clinicName, periodLabel, rows, { totalRevenue, totalPaid, totalPending, totalOverdue });
      toast.success('Relatório financeiro gerado!');
    } catch (err: unknown) { toast.error(err.message || 'Erro ao gerar relatório'); } finally { setLoadingFinancial(false); }
  };

  const handleSessionsExport = async () => {
    if (!clinicId) return;
    setLoadingSessions(true);
    try {
      const { data: sessions, error } = await supabase.from('session_records')
        .select('*, patients!inner(full_name), treatments(name)')
        .eq('clinic_id', clinicId).gte('performed_at', startDate).lte('performed_at', endDate + 'T23:59:59')
        .order('performed_at', { ascending: false });
      if (error) throw error;
      if (!sessions?.length) { toast.info('Nenhuma sessão encontrada no período'); return; }
      const uniquePatients = new Set(sessions.map(s => s.patient_id)).size;
      const uniqueTreatments = new Set(sessions.filter(s => s.treatment_id).map(s => s.treatment_id)).size;
      const rows: SessionRow[] = sessions.map(s => ({
        patient: (s as unknown).patients?.full_name || '—', treatment: (s as unknown).treatments?.name || '—',
        sessionNumber: `${s.session_number}/${s.total_sessions}`,
        performedAt: format(new Date(s.performed_at), 'dd/MM/yyyy', { locale: ptBR }),
        professional: '—', observations: s.observations?.slice(0, 80) || '—',
      }));
      generateSessionsPDF(clinicName, periodLabel, rows, { totalSessions: sessions.length, uniquePatients, uniqueTreatments });
      toast.success('Relatório de sessões gerado!');
    } catch (err: unknown) { toast.error(err.message || 'Erro ao gerar relatório'); } finally { setLoadingSessions(false); }
  };

  const totalSalesRevenue = salesReport?.proposals.reduce((s, p) => s + Number(p.final_amount || 0), 0) || 0;

  return (
    <div>
      <PageHeader title="Relatórios" description="Análise de vendas, margens e metas" />

      {/* Global filters */}
      <Card className="shadow-card mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><Label>Data início</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label>Data fim</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            <div>
              <Label>Vendedor</Label>
              <Select value={sellerFilter} onValueChange={setSellerFilter} disabled={isSales}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {staffList.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.user_id.slice(0, 8)}... ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {salesLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full" />)}</div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Sales by Period */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />Vendas por Período
            </h2>
            {periodChartData.length > 0 ? (
              <>
                <Card className="shadow-card mb-4">
                  <CardContent className="p-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={periodChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Total vendido" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="shadow-card">
                  <CardContent className="p-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Período</th><th className="pb-2 pr-4 text-right">Propostas</th>
                        <th className="pb-2 pr-4 text-right">Total</th><th className="pb-2 text-right">Ticket Médio</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {periodChartData.map((d, i) => (
                          <tr key={i} className="hover:bg-muted/50">
                            <td className="py-2 pr-4 font-medium">{d.label}</td>
                            <td className="py-2 pr-4 text-right">{d.count}</td>
                            <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(d.total)}</td>
                            <td className="py-2 text-right">{formatCurrency(d.ticket)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Nenhuma proposta aprovada no período. Aprove propostas em /propostas para ver dados aqui.</CardContent></Card>
            )}
          </section>

          {/* Section 2: Sales by Seller (admin only) */}
          {isAdmin && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />Vendas por Vendedor
              </h2>
              {sellerData.length > 0 ? (
                <>
                  <Card className="shadow-card mb-4">
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={Math.max(200, sellerData.length * 50)}>
                        <BarChart data={sellerData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis type="category" dataKey="userId" className="text-xs fill-muted-foreground" tickFormatter={v => v.slice(0, 8)} width={80} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                          <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} name="Total vendido" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardContent className="p-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Usuário</th><th className="pb-2 pr-4 text-right">Propostas</th>
                          <th className="pb-2 pr-4 text-right">Total</th><th className="pb-2 pr-4 text-right">Ticket</th>
                          <th className="pb-2 pr-4 text-right">Meta</th><th className="pb-2 pr-4 text-right">%</th>
                          <th className="pb-2">Status</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {sellerData.map(s => (
                            <tr key={s.userId} className="hover:bg-muted/50">
                              <td className="py-2 pr-4"><div className="flex items-center gap-2"><span className="font-medium">{s.userId.slice(0, 8)}...</span><RoleBadge role={s.role} /></div></td>
                              <td className="py-2 pr-4 text-right">{s.count}</td>
                              <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(s.total)}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(s.ticket)}</td>
                              <td className="py-2 pr-4 text-right">{s.goalAmount > 0 ? formatCurrency(s.goalAmount) : '—'}</td>
                              <td className="py-2 pr-4 text-right">{s.goalAmount > 0 ? `${s.pct}%` : '—'}</td>
                              <td className="py-2">{s.goalAmount > 0 ? goalStatusBadge(s.pct) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Nenhuma venda registrada no período</CardContent></Card>
              )}
            </section>
          )}

          {/* Section 3: Sales by Treatment */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />Vendas por Tratamento
            </h2>
            {treatmentData.length > 0 ? (
              <Card className="shadow-card">
                <CardContent className="p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Tratamento</th><th className="pb-2 pr-4 text-right">Qtd</th>
                      <th className="pb-2 pr-4 text-right">Receita</th><th className="pb-2 text-right">Ticket Médio</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {treatmentData.map((t, i) => (
                        <tr key={t.treatmentId} className="hover:bg-muted/50">
                          <td className="py-2 pr-4 font-medium">
                            {t.name}
                            {i === 0 && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Mais vendido</span>}
                          </td>
                          <td className="py-2 pr-4 text-right">{t.count}</td>
                          <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(t.revenue)}</td>
                          <td className="py-2 text-right">{formatCurrency(t.count > 0 ? t.revenue / t.count : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Nenhum tratamento vendido no período</CardContent></Card>
            )}
          </section>

          {/* Section 4: Margin Analysis (admin only) */}
          {isAdmin && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />Análise de Margem
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <BrandStat icon={DollarSign} label="Receita Total" value={formatCurrency(marginData.totalRevenue)} />
                <BrandStat icon={DollarSign} label="Custo Total" value={formatCurrency(marginData.totalCost)} />
                <BrandStat icon={DollarSign} label="Margem R$" value={formatCurrency(marginData.totalRevenue - marginData.totalCost)} />
                <BrandStat icon={TrendingUp} label="Margem %" value={marginData.totalRevenue > 0 ? `${Math.round(((marginData.totalRevenue - marginData.totalCost) / marginData.totalRevenue) * 100)}%` : '—'} />
              </div>
              {marginData.rows.length > 0 ? (
                <Card className="shadow-card">
                  <CardContent className="p-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Tratamento</th><th className="pb-2 pr-4 text-right">Unid.</th>
                        <th className="pb-2 pr-4 text-right">Receita</th><th className="pb-2 pr-4 text-right">Custo</th>
                        <th className="pb-2 pr-4 text-right">Margem R$</th><th className="pb-2 text-right">Margem %</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {marginData.rows.map(r => {
                          const margin = r.revenue - r.cost;
                          const marginPct = r.revenue > 0 ? Math.round((margin / r.revenue) * 100) : 0;
                          const hasCost = r.cost > 0;
                          return (
                            <tr key={r.name} className="hover:bg-muted/50">
                              <td className="py-2 pr-4 font-medium">
                                {r.name}
                                {hasCost && marginPct < 20 && <span className="ml-2 text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full border border-warning/20"><AlertTriangle className="w-3 h-3 inline mr-1" />Atenção</span>}
                              </td>
                              <td className="py-2 pr-4 text-right">{r.units}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(r.revenue)}</td>
                              <td className="py-2 pr-4 text-right">{hasCost ? formatCurrency(r.cost) : '—'}</td>
                              <td className="py-2 pr-4 text-right font-semibold">{hasCost ? formatCurrency(margin) : '—'}</td>
                              <td className="py-2 text-right">{hasCost ? `${marginPct}%` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {marginData.rows.some(r => r.cost === 0) && (
                      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Alguns tratamentos não possuem composição de custo cadastrada. Acesse Configurações &gt; Tratamentos para completar.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Sem dados de margem no período</CardContent></Card>
              )}
              <p className="text-xs text-muted-foreground mt-2">Dados financeiros visíveis apenas para administradores</p>
            </section>
          )}

          {/* Section 5: Goal vs Actual */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />Comparativo Meta × Realizado
            </h2>
            {goalData.length > 0 ? (
              <>
                <Card className="shadow-card mb-4">
                  <CardContent className="p-4">
                    <ResponsiveContainer width="100%" height={Math.max(200, goalData.length * 60)}>
                      <BarChart data={goalData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="userId" className="text-xs fill-muted-foreground" tickFormatter={v => v.slice(0, 8)} width={80} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Bar dataKey="goalAmount" fill="hsl(var(--muted-foreground))" name="Meta" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="realized" fill="hsl(var(--primary))" name="Realizado" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="shadow-card">
                  <CardContent className="p-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Usuário</th><th className="pb-2 pr-4 text-right">Meta</th>
                        <th className="pb-2 pr-4 text-right">Realizado</th><th className="pb-2 pr-4 text-right">Diferença</th>
                        <th className="pb-2 pr-4 text-right">%</th><th className="pb-2">Status</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {goalData.map(g => (
                          <tr key={g.userId} className="hover:bg-muted/50">
                            <td className="py-2 pr-4"><div className="flex items-center gap-2"><span className="font-medium">{g.userId.slice(0, 8)}...</span><RoleBadge role={g.role} /></div></td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(g.goalAmount)}</td>
                            <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(g.realized)}</td>
                            <td className="py-2 pr-4 text-right">
                              <span className={g.diff >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(g.diff)}</span>
                            </td>
                            <td className="py-2 pr-4 text-right font-semibold">{g.pct}%</td>
                            <td className="py-2">{goalStatusBadge(g.pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Nenhuma meta cadastrada. Acesse Configurações &gt; Metas para definir.</CardContent></Card>
            )}
          </section>

          {/* PDF Exports (admin only) */}
          {isAdmin && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />Exportar PDFs
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-card">
                  <CardHeader><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div><div><CardTitle className="text-lg">Relatório Financeiro</CardTitle><CardDescription>Pagamentos, parcelas e inadimplência</CardDescription></div></div></CardHeader>
                  <CardContent>
                    <Button onClick={handleFinancialExport} disabled={loadingFinancial} className="w-full">
                      {loadingFinancial ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Exportar PDF
                    </Button>
                  </CardContent>
                </Card>
                <Card className="shadow-card">
                  <CardHeader><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-primary" /></div><div><CardTitle className="text-lg">Relatório de Sessões</CardTitle><CardDescription>Sessões realizadas no período</CardDescription></div></div></CardHeader>
                  <CardContent>
                    <Button onClick={handleSessionsExport} disabled={loadingSessions} className="w-full">
                      {loadingSessions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Exportar PDF
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
