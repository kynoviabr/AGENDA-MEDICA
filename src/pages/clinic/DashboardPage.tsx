import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { BrandStat } from '@/components/ui/brand-stat';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { RoleBadge } from '@/components/RoleBadge';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, CalendarDays, Activity, Star, Clock, TrendingUp, TrendingDown,
  AlertTriangle, DollarSign, FileWarning, ClipboardCheck, Target, Trophy,
  ArrowRight, Repeat, UserCheck, Zap, ThumbsDown
} from 'lucide-react';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  subDays, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, addDays, differenceInDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import type { Database } from '@/integrations/supabase/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#34d399', '#f59e0b', '#8b5cf6', '#ec4899'];
type ContractStatusRow = Pick<Database['public']['Tables']['contracts']['Row'], 'process_status'>;
type AnamneseRow = Pick<Database['public']['Tables']['patient_anamneses']['Row'], 'patient_id' | 'uploaded_at'>;
type RevenueInstallmentRow = Pick<Database['public']['Tables']['payment_installments']['Row'], 'amount' | 'paid_date'>;
type SessionRecordRow = Pick<Database['public']['Tables']['session_records']['Row'], 'performed_at'>;
type PatientCreatedRow = Pick<Database['public']['Tables']['patients']['Row'], 'created_at'>;
type AppointmentTreatmentRow = {
  treatment_id: string | null;
  treatments?: { name?: string | null } | null;
};
type AppointmentStartRow = Pick<Database['public']['Tables']['appointments']['Row'], 'start_time'>;
type SalesProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'final_amount' | 'created_by' | 'created_at'>;
type SalesGoalRow = Pick<Database['public']['Tables']['sales_goals']['Row'], 'user_id' | 'goal_amount'>;
type TodaySessionRow = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'start_time' | 'status'> & {
  patients?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
type RenewalTaskMetricRow = {
  id: string;
  status: string;
  created_at: string;
  converted_proposal_id: string | null;
  discarded_reason: string | null;
  sla_red_at: string | null;
};
type ClinicSettingRow = { key: string; value: string };

function npsScoreColor(nps: number): string {
  if (nps < 0) return 'text-destructive';
  if (nps < 50) return 'text-warning';
  return 'text-success';
}

const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function TrendIndicator({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
      pct > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
    )}>
      {pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct > 0 ? '+' : ''}{pct}%{suffix}
    </span>
  );
}

export default function ClinicDashboard() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const sixMonthsAgo = subMonths(today, 5);
  const months = eachMonthOfInterval({ start: startOfMonth(sixMonthsAgo), end: endOfMonth(today) });
  const currentMonth = format(today, 'yyyy-MM');

  const isAdmin = role === 'admin';
  const isSales = role === 'sales';
  const isStaff = ['admin', 'receptionist'].includes(role || '');
  const showCommercial = isAdmin || isSales;

  const { data: dashboardAlertSettings } = useQuery({
    queryKey: ['dashboard-alert-settings', clinicId],
    queryFn: async () => {
      const keys = [
        'dashboard_alert_overdue_payments_threshold',
        'dashboard_alert_anamnese_expiry_window_days',
        'dashboard_alert_dissatisfaction_threshold',
        'dashboard_alert_contract_review_window_days',
      ];
      const { data } = await supabase
        .from('clinic_settings' as never)
        .select('key, value')
        .eq('clinic_id', clinicId!)
        .in('key', keys);
      const map = new Map<string, string>();
      ((data ?? []) as unknown as ClinicSettingRow[]).forEach((item) => map.set(item.key, item.value));
      return {
        overduePaymentsThreshold: Number(map.get('dashboard_alert_overdue_payments_threshold') ?? 1),
        anamneseExpiryWindowDays: Number(map.get('dashboard_alert_anamnese_expiry_window_days') ?? 7),
        dissatisfactionThreshold: Number(map.get('dashboard_alert_dissatisfaction_threshold') ?? 1),
        contractReviewWindowDays: Number(map.get('dashboard_alert_contract_review_window_days') ?? 7),
      };
    },
    enabled: !!clinicId,
  });

  // ── Common Stats ──
  const { data: patientCount = 0 } = useQuery({
    queryKey: ['dashboard-patients', clinicId],
    queryFn: async () => {
      const { count } = await supabase.from('patients').select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!).eq('status', 'active');
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['dashboard-today', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!).gte('start_time', startOfDay(today).toISOString())
        .lte('start_time', endOfDay(today).toISOString()).order('start_time');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: weekSessions = 0 } = useQuery({
    queryKey: ['dashboard-week', clinicId],
    queryFn: async () => {
      const { count } = await supabase.from('appointments').select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!).gte('start_time', startOfWeek(today, { locale: ptBR }).toISOString())
        .lte('start_time', endOfWeek(today, { locale: ptBR }).toISOString());
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: avgRating } = useQuery({
    queryKey: ['dashboard-rating', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback').select('rating')
        .eq('clinic_id', clinicId!).gte('created_at', subDays(today, 30).toISOString());
      if (!data?.length) return null;
      return { avg: (data.reduce((s, f) => s + f.rating, 0) / data.length).toFixed(1), count: data.length };
    },
    enabled: !!clinicId,
  });

  const { data: overduePayments = 0 } = useQuery({
    queryKey: ['dashboard-overdue', clinicId],
    queryFn: async () => {
      const { count } = await supabase.from('payment_installments')
        .select('*, payment_plans!inner(clinic_id)', { count: 'exact', head: true })
        .eq('payment_plans.clinic_id', clinicId!).eq('status', 'overdue');
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: contractAlerts } = useQuery({
    queryKey: ['dashboard-contract-alerts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, process_status')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      const contracts = data || [];
      return {
        pendingUpload: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'pending_upload').length,
        pendingConfirmation: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'pending_confirmation').length,
        overdue: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'overdue').length,
      };
    },
    enabled: !!clinicId && !isSales,
  });

  // NPS
  const { data: npsData } = useQuery({
    queryKey: ['dashboard-nps', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('nps_responses').select('score')
        .eq('clinic_id', clinicId!).gte('submitted_at', subDays(today, 30).toISOString());
      const responses = data || [];
      if (responses.length === 0) return null;
      const promoters = responses.filter(r => r.score >= 9).length;
      const detractors = responses.filter(r => r.score <= 6).length;
      const nps = Math.round(((promoters - detractors) / responses.length) * 100);
      return { nps, total: responses.length, promoters, detractors, neutrals: responses.length - promoters - detractors };
    },
    enabled: !!clinicId && isAdmin,
  });

  // Anamnese alerts
  const { data: anamneseAlerts } = useQuery({
    queryKey: ['dashboard-anamnese-alerts', clinicId],
    queryFn: async () => {
      const { data: settingsData } = await supabase.from('clinic_settings')
        .select('value').eq('clinic_id', clinicId!).eq('key', 'anamnese_validity_days').maybeSingle();
      const validityDays = settingsData ? parseInt(settingsData.value) || 45 : 45;
      const { data: patients } = await supabase.from('patients').select('id').eq('clinic_id', clinicId!).eq('status', 'active');
      const patientIds = (patients || []).map(p => p.id);
      if (patientIds.length === 0) return { expired: 0, expiring: 0 };
      const { data: anamneses } = await supabase.from('patient_anamneses')
        .select('patient_id, uploaded_at').eq('clinic_id', clinicId!).order('uploaded_at', { ascending: false });
      const latestMap: Record<string, string> = {};
      (anamneses || []).forEach((a: AnamneseRow) => { if (!latestMap[a.patient_id]) latestMap[a.patient_id] = a.uploaded_at; });
      let expired = 0, expiring = 0;
      const now = new Date();
      const warningDate = addDays(now, dashboardAlertSettings?.anamneseExpiryWindowDays ?? 7);
      patientIds.forEach(pid => {
        const uploadedAt = latestMap[pid];
        if (!uploadedAt) { expired++; return; }
        const expiryDate = addDays(new Date(uploadedAt), validityDays);
        if (expiryDate < now) expired++;
        else if (expiryDate < warningDate) expiring++;
      });
      return { expired, expiring };
    },
    enabled: !!clinicId && isStaff,
  });

  // ── Conversion Funnel (admin) ──
  const { data: funnelData } = useQuery({
    queryKey: ['dashboard-funnel', clinicId],
    queryFn: async () => {
      const monthStart = startOfMonth(today).toISOString();
      const monthEnd = endOfMonth(today).toISOString();
      const [proposals, contracts, payments] = await Promise.all([
        supabase.from('proposals').select('id, status', { count: 'exact', head: false })
          .eq('clinic_id', clinicId!).gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('contracts').select('id, status', { count: 'exact', head: false })
          .eq('clinic_id', clinicId!).gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('payment_installments')
          .select('id, status, payment_plans!inner(clinic_id, created_at)', { count: 'exact', head: false })
          .eq('payment_plans.clinic_id', clinicId!).eq('status', 'paid')
          .gte('paid_date', monthStart.slice(0, 10)).lte('paid_date', monthEnd.slice(0, 10)),
      ]);
      const totalProposals = proposals.data?.length || 0;
      const acceptedProposals = proposals.data?.filter(p => p.status === 'accepted').length || 0;
      const activeContracts = contracts.data?.filter(c => c.status === 'active').length || 0;
      const paidInstallments = payments.data?.length || 0;
      return { totalProposals, acceptedProposals, activeContracts, paidInstallments };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Growth metrics (MoM comparisons) ──
  const { data: growthMetrics } = useQuery({
    queryKey: ['dashboard-growth', clinicId],
    queryFn: async () => {
      const currStart = startOfMonth(today).toISOString();
      const currEnd = endOfMonth(today).toISOString();
      const prevStart = startOfMonth(subMonths(today, 1)).toISOString();
      const prevEnd = endOfMonth(subMonths(today, 1)).toISOString();

      const [currPatients, prevPatients, currSessions, prevSessions, currRevenue, prevRevenue, dissatisfied] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('created_at', currStart).lte('created_at', currEnd),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('created_at', prevStart).lte('created_at', prevEnd),
        supabase.from('session_records').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('performed_at', currStart).lte('performed_at', currEnd),
        supabase.from('session_records').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('performed_at', prevStart).lte('performed_at', prevEnd),
        supabase.from('payment_installments').select('amount, payment_plans!inner(clinic_id)').eq('payment_plans.clinic_id', clinicId!).eq('status', 'paid').gte('paid_date', currStart.slice(0, 10)).lte('paid_date', currEnd.slice(0, 10)),
        supabase.from('payment_installments').select('amount, payment_plans!inner(clinic_id)').eq('payment_plans.clinic_id', clinicId!).eq('status', 'paid').gte('paid_date', prevStart.slice(0, 10)).lte('paid_date', prevEnd.slice(0, 10)),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).eq('dissatisfaction_flag', true),
      ]);

      const currRev = (currRevenue.data || []).reduce((s: number, r: RevenueInstallmentRow) => s + Number(r.amount), 0);
      const prevRev = (prevRevenue.data || []).reduce((s: number, r: RevenueInstallmentRow) => s + Number(r.amount), 0);

      return {
        newPatients: { current: currPatients.count || 0, previous: prevPatients.count || 0 },
        sessions: { current: currSessions.count || 0, previous: prevSessions.count || 0 },
        revenue: { current: currRev, previous: prevRev },
        dissatisfied: dissatisfied.count || 0,
      };
    },
    enabled: !!clinicId && !isSales,
  });

  // ── LTV (avg revenue per patient) ──
  const { data: ltvData } = useQuery({
    queryKey: ['dashboard-ltv', clinicId],
    queryFn: async () => {
      const { data: plans } = await supabase.from('payment_plans')
        .select('patient_id, total_amount').eq('clinic_id', clinicId!);
      if (!plans?.length) return null;
      const byPatient: Record<string, number> = {};
      plans.forEach(p => { byPatient[p.patient_id] = (byPatient[p.patient_id] || 0) + Number(p.total_amount); });
      const values = Object.values(byPatient);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      return { avg, total: values.length };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Commercial data (admin + sales) ──
  const { data: salesData } = useQuery({
    queryKey: ['dashboard-sales', clinicId, currentMonth],
    queryFn: async () => {
      const monthStart = startOfMonth(today).toISOString();
      const monthEnd = endOfMonth(today).toISOString();
      let query = supabase.from('proposals')
        .select('id, final_amount, created_by, created_at')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted')
        .gte('updated_at', monthStart).lte('updated_at', monthEnd);
      if (isSales) query = query.eq('created_by', user!.id);
      const { data: proposals } = await query;
      const { data: staffData } = await supabase.from('user_roles')
        .select('user_id, role').eq('clinic_id', clinicId!).eq('is_active', true);
      const { data: goalsData } = await supabase.from('sales_goals')
        .select('*').eq('clinic_id', clinicId!).eq('period_reference', currentMonth);
      return { proposals: (proposals as SalesProposalRow[]) || [], staff: staffData || [], goals: (goalsData as SalesGoalRow[]) || [] };
    },
    enabled: !!clinicId && showCommercial,
  });

  const { data: renewalMetrics } = useQuery({
    queryKey: ['dashboard-renewal-metrics', clinicId, currentMonth],
    queryFn: async () => {
      const monthStart = startOfMonth(today).toISOString();
      const monthEnd = endOfMonth(today).toISOString();
      const { data: tasks, error } = await supabase
        .from('renewal_tasks' as unknown)
        .select('id, status, created_at, converted_proposal_id, discarded_reason, sla_red_at')
        .eq('clinic_id', clinicId!)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);
      if (error) throw error;

      const taskRows = (tasks || []) as RenewalTaskMetricRow[];
      const generated = taskRows.length;
      const convertedRows = taskRows.filter((task) => task.status === 'converted' && !!task.converted_proposal_id);
      const converted = convertedRows.length;
      const conversionRate = generated > 0 ? Math.round((converted / generated) * 100) : 0;
      const slaOverdue = taskRows.filter((task) => !!task.sla_red_at && task.status !== 'converted' && task.status !== 'discarded').length;

      const proposalIds = Array.from(new Set(convertedRows.map((task) => task.converted_proposal_id).filter(Boolean))) as string[];
      let renewalRevenue = 0;
      if (proposalIds.length > 0) {
        const { data: proposals } = await supabase
          .from('proposals')
          .select('id, final_amount')
          .in('id', proposalIds);
        renewalRevenue = (proposals || []).reduce((sum, proposal) => sum + Number(proposal.final_amount || 0), 0);
      }

      return {
        generated,
        converted,
        conversionRate,
        renewalRevenue,
        slaOverdue,
      };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Charts ──
  const { data: revenueSessionsData = [] } = useQuery({
    queryKey: ['dashboard-revenue-sessions-chart', clinicId],
    queryFn: async () => {
      const [revenueRes, sessionsRes] = await Promise.all([
        supabase.from('payment_installments')
          .select('amount, paid_date, payment_plans!inner(clinic_id)')
          .eq('payment_plans.clinic_id', clinicId!).eq('status', 'paid')
          .gte('paid_date', startOfMonth(sixMonthsAgo).toISOString().slice(0, 10)),
        supabase.from('session_records').select('performed_at')
          .eq('clinic_id', clinicId!).gte('performed_at', startOfMonth(sixMonthsAgo).toISOString()),
      ]);
      const revByMonth: Record<string, number> = {};
      const sessByMonth: Record<string, number> = {};
      months.forEach(m => { const k = format(m, 'yyyy-MM'); revByMonth[k] = 0; sessByMonth[k] = 0; });
      (revenueRes.data || []).forEach((inst: RevenueInstallmentRow) => {
        if (inst.paid_date) { const k = inst.paid_date.slice(0, 7); if (revByMonth[k] !== undefined) revByMonth[k] += Number(inst.amount); }
      });
      (sessionsRes.data || []).forEach((s: SessionRecordRow) => {
        const k = s.performed_at.slice(0, 7); if (sessByMonth[k] !== undefined) sessByMonth[k]++;
      });
      return months.map(m => {
        const k = format(m, 'yyyy-MM');
        return { month: format(m, 'MMM', { locale: ptBR }), receita: revByMonth[k], sessoes: sessByMonth[k] };
      });
    },
    enabled: !!clinicId && !isSales,
  });

  const { data: patientsData = [] } = useQuery({
    queryKey: ['dashboard-patients-chart', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('created_at')
        .eq('clinic_id', clinicId!).gte('created_at', startOfMonth(sixMonthsAgo).toISOString());
      const byMonth: Record<string, number> = {};
      months.forEach(m => { byMonth[format(m, 'yyyy-MM')] = 0; });
      (data || []).forEach((p: PatientCreatedRow) => { const key = p.created_at.slice(0, 7); if (byMonth[key] !== undefined) byMonth[key]++; });
      let acc = 0;
      return months.map(m => { const k = format(m, 'yyyy-MM'); acc += byMonth[k]; return { month: format(m, 'MMM', { locale: ptBR }), novos: byMonth[k], acumulado: acc }; });
    },
    enabled: !!clinicId && !isSales,
  });

  const { data: topTreatments = [] } = useQuery({
    queryKey: ['dashboard-treatments', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('treatment_id, treatments(name)')
        .eq('clinic_id', clinicId!).not('treatment_id', 'is', null);
      if (!data) return [];
      const counts: Record<string, { name: string; count: number }> = {};
      data.forEach((a: AppointmentTreatmentRow) => { const name = a.treatments?.name || 'Outro'; const tid = a.treatment_id; if (!tid) return; if (!counts[tid]) counts[tid] = { name, count: 0 }; counts[tid].count++; });
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
    },
    enabled: !!clinicId && !isSales,
  });

  // ── Occupancy by day of week ──
  const { data: occupancyData = [] } = useQuery({
    queryKey: ['dashboard-occupancy', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('start_time')
        .eq('clinic_id', clinicId!).gte('start_time', subDays(today, 60).toISOString())
        .in('status', ['scheduled', 'confirmed', 'completed', 'in_progress']);
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      const weeksCounted = Math.ceil(60 / 7);
      (data || []).forEach((a: AppointmentStartRow) => { counts[new Date(a.start_time).getDay()]++; });
      return days.map((d, i) => ({ day: d, media: Math.round(counts[i] / weeksCounted * 10) / 10 }));
    },
    enabled: !!clinicId && !isSales,
  });

  // Sales computed values
  const totalSalesMonth = salesData?.proposals.reduce((s, p: SalesProposalRow) => s + Number(p.final_amount || 0), 0) || 0;
  const approvedCount = salesData?.proposals.length || 0;
  const ticketMedio = approvedCount > 0 ? totalSalesMonth / approvedCount : 0;
  const myGoal = salesData?.goals.find((g: SalesGoalRow) => g.user_id === user?.id);
  const myGoalAmount = myGoal ? Number(myGoal.goal_amount) : 0;
  const myPct = myGoalAmount > 0 ? Math.round((totalSalesMonth / myGoalAmount) * 100) : 0;

  // Ranking (admin)
  const ranking = isAdmin && salesData ? (() => {
    const byUser: Record<string, number> = {};
    salesData.proposals.forEach((p: SalesProposalRow) => {
      if (p.created_by) byUser[p.created_by] = (byUser[p.created_by] || 0) + Number(p.final_amount || 0);
    });
    return Object.entries(byUser)
      .map(([userId, total]) => {
        const staffMember = salesData.staff.find(s => s.user_id === userId);
        const goal = salesData.goals.find((g: SalesGoalRow) => g.user_id === userId);
        const goalAmount = goal ? Number(goal.goal_amount) : 0;
        return { userId, total, role: staffMember?.role || 'admin', goalAmount, pct: goalAmount > 0 ? Math.round((total / goalAmount) * 100) : 0 };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  })() : [];

  const totalRevenue = revenueSessionsData.reduce((s, d) => s + d.receita, 0);

  // Funnel conversion rates
  const funnelSteps = useMemo(() => {
    if (!funnelData) return [];
    const { totalProposals, acceptedProposals, activeContracts, paidInstallments } = funnelData;
    return [
      { label: 'Propostas', value: totalProposals, color: 'hsl(var(--muted-foreground))' },
      { label: 'Aprovadas', value: acceptedProposals, color: 'hsl(var(--accent))' },
      { label: 'Contratos', value: activeContracts, color: 'hsl(var(--primary))' },
      { label: 'Pagamentos', value: paidInstallments, color: '#34d399' },
    ];
  }, [funnelData]);

  const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };
  const [activeTab, setActiveTab] = useState<'executivo' | 'comercial' | 'financeiro' | 'operacao' | 'pessoas'>('executivo');

  const executiveSemaphores = useMemo(() => {
    const commercialRevenue = totalSalesMonth;
    const overdueContracts = contractAlerts?.overdue || 0;
    const overdueBills = overduePayments;
    const expiredAnamneses = anamneseAlerts?.expired || 0;
    const lowSatisfaction = growthMetrics?.dissatisfied || 0;
    const overduePaymentsThreshold = dashboardAlertSettings?.overduePaymentsThreshold ?? 1;
    const dissatisfactionThreshold = dashboardAlertSettings?.dissatisfactionThreshold ?? 1;

    const commercialStatus: BadgeStatus = commercialRevenue > 0 ? 'confirmed' : approvedCount > 0 ? 'scheduled' : 'pending';
    const financialStatus: BadgeStatus = overdueBills >= overduePaymentsThreshold ? 'overdue' : overdueContracts > 0 ? 'pending' : 'confirmed';
    const operationStatus: BadgeStatus = expiredAnamneses > 0 ? 'pending' : (todaySessions.length > 0 ? 'confirmed' : 'scheduled');
    const peopleStatus: BadgeStatus = lowSatisfaction >= dissatisfactionThreshold ? 'pending' : (avgRating ? 'confirmed' : 'scheduled');

    return [
      {
        id: 'comercial' as const,
        title: 'Comercial',
        status: commercialStatus,
        metric: `${approvedCount} propostas aprovadas`,
        alert: commercialRevenue > 0 ? `${formatCurrency(commercialRevenue)} no mês` : 'Nenhuma venda concluída no mês',
      },
      {
        id: 'financeiro' as const,
        title: 'Financeiro',
        status: financialStatus,
        metric: `${overdueBills} parcelas vencidas`,
        alert: overdueContracts > 0 ? `${overdueContracts} contratos com revisão pendente` : 'Sem alertas críticos',
      },
      {
        id: 'operacao' as const,
        title: 'Operação',
        status: operationStatus,
        metric: `${todaySessions.length} atendimentos hoje`,
        alert: expiredAnamneses > 0 ? `${expiredAnamneses} anamneses vencidas` : 'Agenda sob controle',
      },
      {
        id: 'pessoas' as const,
        title: 'Pessoas',
        status: peopleStatus,
        metric: avgRating ? `Satisfação ${avgRating.avg}/5` : 'Sem avaliações recentes',
        alert: lowSatisfaction >= dissatisfactionThreshold ? `${lowSatisfaction} pacientes com alerta de insatisfação` : 'Sem alertas de relacionamento',
      },
    ];
  }, [
    totalSalesMonth,
    contractAlerts?.overdue,
    overduePayments,
    anamneseAlerts?.expired,
    growthMetrics?.dissatisfied,
    approvedCount,
    todaySessions.length,
    avgRating,
    dashboardAlertSettings?.overduePaymentsThreshold,
    dashboardAlertSettings?.dissatisfactionThreshold,
  ]);

  const showTab = (tab: typeof activeTab) => activeTab === 'executivo' || activeTab === tab;

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" description="Visão geral da sua clínica" />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-4">
        <TabsList className="grid grid-cols-2 lg:grid-cols-5 w-full h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="executivo">Visão Executiva</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="operacao">Operação</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'executivo' && (
        <Card className="shadow-card mb-4 animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Saúde Executiva</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {executiveSemaphores.map((item) => (
              <div key={item.id} className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <BrandBadge status={item.status} />
                </div>
                <p className="text-sm text-foreground">{item.metric}</p>
                <p className="text-xs text-muted-foreground">{item.alert}</p>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setActiveTab(item.id)}>
                  Abrir área <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── SALES DASHBOARD (sales role) ── */}
      {isSales && showTab('comercial') && (
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BrandStat icon={Target} label="Minha Meta" value={myGoalAmount > 0 ? formatCurrency(myGoalAmount) : '—'} />
            <BrandStat icon={DollarSign} label="Meu Realizado" value={formatCurrency(totalSalesMonth)} />
            <Card className="shadow-card animate-fade-in">
              <CardContent className="p-4 text-center">
                <Target className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className={cn("text-3xl font-bold", myPct >= 100 ? 'text-success' : myPct >= 70 ? 'text-warning' : 'text-destructive')}>
                  {myGoalAmount > 0 ? `${myPct}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">% Atingido</p>
                {myGoalAmount > 0 && <Progress value={Math.min(myPct, 100)} className="mt-2 h-2" />}
              </CardContent>
            </Card>
            <Card className="shadow-card animate-fade-in">
              <CardContent className="p-4 text-center">
                {myPct >= 100 ? (
                  <>
                    <Trophy className="w-6 h-6 text-success mx-auto mb-1" />
                    <p className="text-lg font-bold text-success">Meta atingida! 🎉</p>
                  </>
                ) : myGoalAmount > 0 ? (
                  <>
                    <DollarSign className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(myGoalAmount - totalSalesMonth)}</p>
                    <p className="text-xs text-muted-foreground">To-Go</p>
                  </>
                ) : (
                  <>
                    <Target className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm text-muted-foreground">Meta não definida</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-card animate-fade-in">
            <CardHeader className="pb-3"><CardTitle className="text-base">Minhas Propostas Recentes</CardTitle></CardHeader>
            <CardContent>
              {salesData && salesData.proposals.length > 0 ? (
                <div className="space-y-3">
                  {salesData.proposals.slice(0, 5).map((p: SalesProposalRow) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatCurrency(Number(p.final_amount))}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy')}</p>
                      </div>
                      <BrandBadge status="approved" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma proposta aprovada este mês</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STAFF STATS WITH MoM TRENDS ── */}
      {!isSales && (showTab('operacao') || showTab('pessoas')) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <BrandStat icon={Users} label="Pacientes Ativos" value={patientCount}
            trend={growthMetrics ? { value: growthMetrics.newPatients.previous > 0 ? Math.round(((growthMetrics.newPatients.current - growthMetrics.newPatients.previous) / growthMetrics.newPatients.previous) * 100) : 0, label: 'vs mês anterior' } : undefined}
          />
          <BrandStat icon={CalendarDays} label="Sessões Hoje" value={todaySessions.length} />
          <BrandStat icon={Activity} label="Sessões do Mês" value={growthMetrics?.sessions.current || 0}
            trend={growthMetrics && growthMetrics.sessions.previous > 0 ? { value: Math.round(((growthMetrics.sessions.current - growthMetrics.sessions.previous) / growthMetrics.sessions.previous) * 100), label: 'vs mês anterior' } : undefined}
          />
          <div className="cursor-pointer" onClick={() => navigate('/clinic/satisfaction')}>
            <BrandStat icon={Star} label="Satisfação Média" value={avgRating ? avgRating.avg : '—'} />
          </div>
        </div>
      )}

      {/* ── ADMIN INSIGHTS ROW ── */}
      {isAdmin && (showTab('financeiro') || showTab('comercial') || showTab('pessoas')) && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
          {/* Revenue MoM */}
          <Card className="shadow-card animate-fade-in">
            <CardContent className="p-4">
              <DollarSign className="w-5 h-5 text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{formatCurrency(growthMetrics?.revenue.current || 0)}</p>
              <p className="text-xs text-muted-foreground">Receita do Mês</p>
              {growthMetrics && <TrendIndicator current={growthMetrics.revenue.current} previous={growthMetrics.revenue.previous} />}
            </CardContent>
          </Card>

          {/* LTV */}
          <Card className="shadow-card animate-fade-in">
            <CardContent className="p-4">
              <UserCheck className="w-5 h-5 text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{ltvData ? formatCurrency(ltvData.avg) : '—'}</p>
              <p className="text-xs text-muted-foreground">LTV Médio / Paciente</p>
            </CardContent>
          </Card>

          {/* Ticket */}
          {showCommercial && (
            <Card className="shadow-card animate-fade-in">
              <CardContent className="p-4">
                <Zap className="w-5 h-5 text-accent mb-1" />
                <p className="text-xl font-bold text-foreground">{formatCurrency(ticketMedio)}</p>
                <p className="text-xs text-muted-foreground">Ticket Médio</p>
              </CardContent>
            </Card>
          )}

          {/* NPS */}
          {npsData && (
            <Card className="shadow-card animate-fade-in cursor-pointer" onClick={() => navigate('/clinic/satisfaction')}>
              <CardContent className="p-4">
                <TrendingUp className="w-5 h-5 text-primary mb-1" />
                <p className={cn("text-xl font-bold", npsScoreColor(npsData.nps))}>{npsData.nps}</p>
                <p className="text-xs text-muted-foreground">NPS ({npsData.total} respostas)</p>
              </CardContent>
            </Card>
          )}

          {/* Dissatisfied */}
          {growthMetrics && growthMetrics.dissatisfied > 0 && (
            <Card className="shadow-card animate-fade-in cursor-pointer border-destructive/30" onClick={() => navigate('/clinic/patients')}>
              <CardContent className="p-4">
                <ThumbsDown className="w-5 h-5 text-destructive mb-1" />
                <p className="text-xl font-bold text-destructive">{growthMetrics.dissatisfied}</p>
                <p className="text-xs text-muted-foreground">Pacientes Insatisfeitos</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── CONVERSION FUNNEL (admin) ── */}
      {isAdmin && showTab('comercial') && funnelData && funnelData.totalProposals > 0 && (
        <Card className="shadow-card mb-4 animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="w-5 h-5 text-primary" /> Funil de Conversão (mês atual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              {funnelSteps.map((step, i) => {
                const maxVal = funnelSteps[0].value || 1;
                const pct = Math.round((step.value / maxVal) * 100);
                return (
                  <div key={step.label} className="flex-1 text-center">
                    <div className="relative mx-auto mb-2" style={{ width: `${Math.max(pct, 30)}%`, minWidth: 48 }}>
                      <div className="h-12 rounded-lg flex items-center justify-center" style={{ background: step.color }}>
                        <span className="text-lg font-bold text-white">{step.value}</span>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-foreground">{step.label}</p>
                    {i > 0 && funnelSteps[i - 1].value > 0 && (
                      <p className="text-[10px] text-muted-foreground">{Math.round((step.value / funnelSteps[i - 1].value) * 100)}% conv.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ADMIN COMMERCIAL SECTION ── */}
      {isAdmin && showTab('comercial') && salesData && (
        <div className="space-y-4 mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />Performance Comercial
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BrandStat icon={DollarSign} label="Vendas do Mês" value={formatCurrency(totalSalesMonth)} />
            <BrandStat icon={Target} label="Propostas Aprovadas" value={approvedCount} />
            <BrandStat icon={DollarSign} label="Ticket Médio" value={formatCurrency(ticketMedio)} />
            <BrandStat icon={Users} label="Pacientes Ativos" value={patientCount} />
          </div>
          {renewalMetrics && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <BrandStat icon={Repeat} label="Renovações Geradas" value={renewalMetrics.generated} />
              <BrandStat icon={ClipboardCheck} label="Renovações Convertidas" value={renewalMetrics.converted} />
              <BrandStat icon={Target} label="Taxa de Conversão" value={`${renewalMetrics.conversionRate}%`} />
              <BrandStat icon={DollarSign} label="LTV via Renovação" value={formatCurrency(renewalMetrics.renewalRevenue)} />
              <BrandStat icon={AlertTriangle} label="SLA > 7d" value={renewalMetrics.slaOverdue} />
            </div>
          )}
          {ranking.length > 0 && (
            <Card className="shadow-card animate-fade-in cursor-pointer" onClick={() => navigate('/clinic/reports')}>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" />Ranking de Vendedores</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ranking.map((r, i) => (
                    <div key={r.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</span>
                        <span className="text-sm font-medium text-foreground">{r.userId.slice(0, 8)}...</span>
                        <RoleBadge role={r.role} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{formatCurrency(r.total)}</span>
                        {r.goalAmount > 0 && <span className="text-xs text-muted-foreground">{r.pct}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Alerts ── */}
      {!isSales && (showTab('financeiro') || showTab('operacao')) && (
        <div className="space-y-2.5 mb-4">
          {contractAlerts && contractAlerts.pendingUpload > 0 && (
            <div
              className="p-4 rounded-xl bg-warning/10 border border-warning/20 flex items-center gap-3 animate-fade-in cursor-pointer"
              onClick={() => navigate('/clinic/contracts?status=pending_upload')}
            >
              <FileWarning className="w-5 h-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">
                  {contractAlerts.pendingUpload} contrato{contractAlerts.pendingUpload > 1 ? 's' : ''} aguardando envio
                </p>
                <p className="text-xs text-muted-foreground">Clique para abrir contratos gerados</p>
              </div>
            </div>
          )}
          {contractAlerts && contractAlerts.pendingConfirmation > 0 && (
            <div
              className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3 animate-fade-in cursor-pointer"
              onClick={() => navigate('/clinic/contracts?quick=pending_signature')}
            >
              <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary">
                  {contractAlerts.pendingConfirmation} contrato{contractAlerts.pendingConfirmation > 1 ? 's' : ''} aguardando confirmação
                </p>
                <p className="text-xs text-muted-foreground">Clique para abrir assinaturas pendentes</p>
              </div>
            </div>
          )}
          {contractAlerts && contractAlerts.overdue > 0 && (
            <div
              className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 animate-fade-in cursor-pointer"
              onClick={() => navigate('/clinic/contracts?status=overdue')}
            >
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  {contractAlerts.overdue} contrato{contractAlerts.overdue > 1 ? 's' : ''} com revisão pendente
                </p>
                <p className="text-xs text-muted-foreground">Clique para abrir contratos vencidos</p>
              </div>
            </div>
          )}
          {overduePayments > 0 && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 animate-fade-in cursor-pointer" onClick={() => navigate('/clinic/payments')}>
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">{overduePayments} parcela{overduePayments > 1 ? 's' : ''} vencida{overduePayments > 1 ? 's' : ''}</p>
                <p className="text-xs text-muted-foreground">Clique para verificar</p>
              </div>
            </div>
          )}
          {isStaff && anamneseAlerts && anamneseAlerts.expired > 0 && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 animate-fade-in cursor-pointer" onClick={() => navigate('/clinic/patients?anamnese=expired')}>
              <FileWarning className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">{anamneseAlerts.expired} paciente{anamneseAlerts.expired > 1 ? 's' : ''} com anamnese vencida</p>
                <p className="text-xs text-muted-foreground">Clique para visualizar</p>
              </div>
            </div>
          )}
          {isStaff && anamneseAlerts && anamneseAlerts.expiring > 0 && (
            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 flex items-center gap-3 animate-fade-in cursor-pointer" onClick={() => navigate('/clinic/patients?anamnese=expiring')}>
              <ClipboardCheck className="w-5 h-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">{anamneseAlerts.expiring} paciente{anamneseAlerts.expiring > 1 ? 's' : ''} com anamnese próxima do vencimento</p>
                <p className="text-xs text-muted-foreground">Clique para visualizar</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Charts ── */}
      {!isSales && (showTab('financeiro') || showTab('operacao') || showTab('pessoas')) && (
        <>
          {/* Composed: Revenue + Sessions */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="shadow-card animate-fade-in">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" />Receita × Sessões</CardTitle>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(totalRevenue)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={revenueSessionsData}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                    <YAxis yAxisId="left" className="text-xs fill-muted-foreground" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs fill-muted-foreground" />
                    <Tooltip formatter={(v: number, name: string) => name === 'receita' ? formatCurrency(v) : v} contentStyle={tooltipStyle} />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueGrad)" name="Receita" />
                    <Bar yAxisId="right" dataKey="sessoes" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Sessões" opacity={0.7} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card animate-fade-in">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Crescimento de Pacientes</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={patientsData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs fill-muted-foreground" />
                    <YAxis yAxisId="left" className="text-xs fill-muted-foreground" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs fill-muted-foreground" allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="novos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Novos" />
                    <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} name="Acumulado" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* Occupancy by day of week */}
            <Card className="shadow-card animate-fade-in">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" />Ocupação por Dia da Semana</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={occupancyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="media" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Média de atendimentos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top treatments */}
            <Card className="shadow-card animate-fade-in">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />Tratamentos Mais Populares</CardTitle></CardHeader>
              <CardContent>
                {topTreatments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Nenhum dado disponível</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={200}>
                      <PieChart>
                        <Pie data={topTreatments} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                          {topTreatments.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {topTreatments.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-foreground truncate flex-1">{t.name}</span>
                          <span className="text-muted-foreground font-medium">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Today's schedule */}
      {!isSales && showTab('operacao') && (
        <Card className="shadow-card animate-fade-in">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Agenda de Hoje</CardTitle></CardHeader>
          <CardContent>
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma sessão agendada para hoje</p>
            ) : (
              <div className="space-y-3">
                {todaySessions.map((s: TodaySessionRow) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
                        {(s.patients?.full_name || '?').split(' ').slice(0, 2).map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{s.patients?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{s.treatments?.name || 'Tratamento'}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{format(new Date(s.start_time), 'HH:mm')}</span>
                      <BrandBadge status={s.status as BadgeStatus} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
