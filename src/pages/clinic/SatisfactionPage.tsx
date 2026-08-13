import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
  Star, TrendingUp, TrendingDown, Minus, Sunrise, Sun, Moon, Award, AlertTriangle,
  HeartHandshake, Clock, ThumbsDown, SmilePlus, Meh, Frown
} from 'lucide-react';
import { subDays, format, eachWeekOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart
} from 'recharts';
import { cn } from '@/lib/utils';

function classifyNps(score: number) {
  if (score >= 9) return { label: 'Promotor', color: 'text-success' };
  if (score >= 7) return { label: 'Neutro', color: 'text-warning' };
  return { label: 'Detrator', color: 'text-destructive' };
}

export default function SatisfactionPage() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [periodDays, setPeriodDays] = useState('30');
  const [selectedPatient, setSelectedPatient] = useState<unknown>(null);

  useEffect(() => {
    if (role && role !== 'admin') {
      toast({ title: 'Acesso restrito', description: 'Apenas administradores', variant: 'destructive' });
      navigate('/clinic');
    }
  }, [role, navigate, toast]);

  const periodStart = subDays(new Date(), parseInt(periodDays));
  const prevPeriodStart = subDays(periodStart, parseInt(periodDays));

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['satisfaction-feedbacks', clinicId, periodDays],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback')
        .select('*, patients(full_name), session_records(performed_at, treatment_id, professional_id, treatments(name), appointments(start_time, professional_id))')
        .eq('clinic_id', clinicId!)
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!clinicId && role === 'admin',
  });

  const { data: prevFeedbacks = [] } = useQuery({
    queryKey: ['satisfaction-prev-feedbacks', clinicId, periodDays],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback')
        .select('rating, patient_id, service_attention, waiting_time')
        .eq('clinic_id', clinicId!)
        .gte('created_at', prevPeriodStart.toISOString())
        .lt('created_at', periodStart.toISOString());
      return data || [];
    },
    enabled: !!clinicId && role === 'admin',
  });

  const { data: npsResponses = [] } = useQuery({
    queryKey: ['satisfaction-nps', clinicId, periodDays],
    queryFn: async () => {
      const { data } = await supabase.from('nps_responses')
        .select('*, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('submitted_at', periodStart.toISOString())
        .order('submitted_at', { ascending: false });
      return data || [];
    },
    enabled: !!clinicId && role === 'admin',
  });

  // === Cross-analysis metrics ===
  const crossMetrics = useMemo(() => {
    const withService = feedbacks.filter((f: unknown) => f.service_attention != null);
    const withWaiting = feedbacks.filter((f: unknown) => f.waiting_time != null);
    const avgRating = feedbacks.length > 0 ? feedbacks.reduce((s: number, f: unknown) => s + f.rating, 0) / feedbacks.length : 0;
    const avgService = withService.length > 0 ? withService.reduce((s: number, f: unknown) => s + f.service_attention, 0) / withService.length : 0;
    const avgWaiting = withWaiting.length > 0 ? withWaiting.reduce((s: number, f: unknown) => s + f.waiting_time, 0) / withWaiting.length : 0;
    const negativeCount = feedbacks.filter((f: unknown) => f.is_negative).length;

    const promoters = npsResponses.filter((r: unknown) => r.score >= 9).length;
    const detractors = npsResponses.filter((r: unknown) => r.score <= 6).length;
    const npsScore = npsResponses.length > 0 ? Math.round(((promoters - detractors) / npsResponses.length) * 100) : null;

    return { avgRating, avgService, avgWaiting, negativeCount, npsScore, totalFeedbacks: feedbacks.length, totalNps: npsResponses.length };
  }, [feedbacks, npsResponses]);

  // Radar chart data
  const radarData = useMemo(() => [
    { metric: 'Geral', value: crossMetrics.avgRating },
    { metric: 'Atenção', value: crossMetrics.avgService },
    { metric: 'Espera', value: crossMetrics.avgWaiting },
  ], [crossMetrics]);

  // By Treatment
  const byTreatment = useMemo(() => {
    const map: Record<string, { name: string; ratings: number[]; service: number[]; waiting: number[] }> = {};
    feedbacks.forEach((f: unknown) => {
      const tid = f.treatment_id || (f.session_records as unknown)?.treatment_id;
      const tname = (f.session_records as unknown)?.treatments?.name || '—';
      if (!tid) return;
      if (!map[tid]) map[tid] = { name: tname, ratings: [], service: [], waiting: [] };
      map[tid].ratings.push(f.rating);
      if (f.service_attention != null) map[tid].service.push(f.service_attention);
      if (f.waiting_time != null) map[tid].waiting.push(f.waiting_time);
    });
    return Object.entries(map).map(([id, v]) => ({
      id, name: v.name,
      count: v.ratings.length,
      avgRating: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
      avgService: v.service.length > 0 ? v.service.reduce((a, b) => a + b, 0) / v.service.length : null,
      avgWaiting: v.waiting.length > 0 ? v.waiting.reduce((a, b) => a + b, 0) / v.waiting.length : null,
    })).sort((a, b) => b.avgRating - a.avgRating);
  }, [feedbacks]);

  // By Professional
  const byProfessional = useMemo(() => {
    const map: Record<string, { ratings: number[]; service: number[]; waiting: number[] }> = {};
    feedbacks.forEach((f: unknown) => {
      const pid = f.professional_id || (f.session_records as unknown)?.professional_id || (f.session_records as unknown)?.appointments?.professional_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { ratings: [], service: [], waiting: [] };
      map[pid].ratings.push(f.rating);
      if (f.service_attention != null) map[pid].service.push(f.service_attention);
      if (f.waiting_time != null) map[pid].waiting.push(f.waiting_time);
    });
    return Object.entries(map).map(([id, v], i) => ({
      id, name: `Profissional ${i + 1}`,
      count: v.ratings.length,
      avgRating: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
      avgService: v.service.length > 0 ? v.service.reduce((a, b) => a + b, 0) / v.service.length : null,
      avgWaiting: v.waiting.length > 0 ? v.waiting.reduce((a, b) => a + b, 0) / v.waiting.length : null,
    })).sort((a, b) => b.avgRating - a.avgRating);
  }, [feedbacks]);

  // By Patient with trends
  const byPatient = useMemo(() => {
    const map: Record<string, { name: string; ratings: number[]; lastDate: string }> = {};
    feedbacks.forEach((f: unknown) => {
      const pid = f.patient_id;
      const pname = (f.patients as unknown)?.full_name || '—';
      if (!map[pid]) map[pid] = { name: pname, ratings: [], lastDate: f.created_at };
      map[pid].ratings.push(f.rating);
      if (f.created_at > map[pid].lastDate) map[pid].lastDate = f.created_at;
    });
    const prevMap: Record<string, number[]> = {};
    prevFeedbacks.forEach((f: unknown) => {
      if (!prevMap[f.patient_id]) prevMap[f.patient_id] = [];
      prevMap[f.patient_id].push(f.rating);
    });
    return Object.entries(map).map(([id, v]) => {
      const avg = v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length;
      const prevAvg = prevMap[id]?.length ? prevMap[id].reduce((a, b) => a + b, 0) / prevMap[id].length : null;
      const trend = prevAvg !== null ? (avg > prevAvg + 0.2 ? 'up' : avg < prevAvg - 0.2 ? 'down' : 'stable') : 'stable';
      return { id, name: v.name, count: v.ratings.length, avg, lastDate: v.lastDate, trend };
    }).sort((a, b) => b.avg - a.avg);
  }, [feedbacks, prevFeedbacks]);

  // Weekly trend
  const weeklyData = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: subDays(new Date(), 84), end: new Date() }, { locale: ptBR });
    return weeks.map(weekStart => {
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      const wf = feedbacks.filter((f: unknown) => { const d = new Date(f.created_at); return d >= weekStart && d < weekEnd; });
      const avg = wf.length > 0 ? wf.reduce((s: number, f: unknown) => s + f.rating, 0) / wf.length : null;
      return { week: format(weekStart, 'dd/MM', { locale: ptBR }), media: avg ? parseFloat(avg.toFixed(2)) : null, quantidade: wf.length };
    });
  }, [feedbacks]);

  // By Shift
  const byShift = useMemo(() => {
    const shifts: Record<string, { label: string; icon: unknown; ratings: number[] }> = {
      morning: { label: 'Manhã', icon: Sunrise, ratings: [] },
      afternoon: { label: 'Tarde', icon: Sun, ratings: [] },
      evening: { label: 'Noite', icon: Moon, ratings: [] },
    };
    feedbacks.forEach((f: unknown) => {
      const apptTime = (f.session_records as unknown)?.appointments?.start_time;
      if (!apptTime) return;
      const hour = new Date(apptTime).getHours();
      if (hour < 12) shifts.morning.ratings.push(f.rating);
      else if (hour < 17) shifts.afternoon.ratings.push(f.rating);
      else shifts.evening.ratings.push(f.rating);
    });
    return Object.entries(shifts).map(([key, v]) => ({
      key, label: v.label, Icon: v.icon,
      count: v.ratings.length,
      avg: v.ratings.length > 0 ? v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length : 0,
    }));
  }, [feedbacks]);

  const { data: patientFeedbackHistory = [] } = useQuery({
    queryKey: ['patient-feedback-history', selectedPatient?.id],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback')
        .select('*, session_records(treatments(name))')
        .eq('patient_id', selectedPatient.id)
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!selectedPatient && !!clinicId,
  });

  const StarRating = ({ value }: { value: number }) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => <Star key={s} className={cn("w-3.5 h-3.5", s <= Math.round(value) ? "text-accent fill-accent" : "text-muted")} />)}
      <span className="text-sm font-semibold ml-1">{value.toFixed(1)}</span>
    </div>
  );

  if (role && role !== 'admin') return null;

  return (
    <div>
      <PageHeader title="Inteligência de Satisfação" description="Análise cruzada de Feedbacks × NPS × Profissionais × Tratamentos" />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Select value={periodDays} onValueChange={setPeriodDays}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cross-metrics overview */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <Star className="w-5 h-5 text-accent mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.avgRating > 0 ? crossMetrics.avgRating.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Média Geral</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <HeartHandshake className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.avgService > 0 ? crossMetrics.avgService.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Atenção</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.avgWaiting > 0 ? crossMetrics.avgWaiting.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Espera</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <ThumbsDown className="w-5 h-5 text-destructive mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.negativeCount}</p>
            <p className="text-xs text-muted-foreground">Negativos</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.totalFeedbacks}</p>
            <p className="text-xs text-muted-foreground">Feedbacks</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <SmilePlus className="w-5 h-5 text-success mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{crossMetrics.totalNps}</p>
            <p className="text-xs text-muted-foreground">Respostas NPS</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-3 text-center">
            <p className={cn("text-2xl font-bold", crossMetrics.npsScore !== null && crossMetrics.npsScore >= 50 ? 'text-success' : crossMetrics.npsScore !== null && crossMetrics.npsScore >= 0 ? 'text-warning' : 'text-destructive')}>
              {crossMetrics.npsScore !== null ? crossMetrics.npsScore : '—'}
            </p>
            <p className="text-xs text-muted-foreground">NPS Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Radar + Weekly trend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardHeader><CardTitle className="text-base">Visão Geral de Qualidade</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" className="text-xs fill-muted-foreground" />
                <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardHeader><CardTitle className="text-base">Tendência Semanal (12 semanas)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" className="text-xs fill-muted-foreground" />
                <YAxis yAxisId="left" domain={[0, 5]} className="text-xs fill-muted-foreground" />
                <YAxis yAxisId="right" orientation="right" className="text-xs fill-muted-foreground" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Bar yAxisId="right" dataKey="quantidade" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} name="Qtd" />
                <Line yAxisId="left" type="monotone" dataKey="media" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Média" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Rankings: By Treatment */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Ranking por Tratamento</CardTitle></CardHeader>
        <CardContent>
          {byTreatment.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Tratamento</th>
                  <th className="text-center px-3 py-2">Avaliações</th>
                  <th className="text-center px-3 py-2">Média</th>
                  <th className="text-center px-3 py-2">Atenção</th>
                  <th className="text-center px-3 py-2">Espera</th>
                </tr></thead>
                <tbody>
                  {byTreatment.map((t, i) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-bold text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium flex items-center gap-2">
                        {i === 0 && byTreatment.length > 1 && <Award className="w-4 h-4 text-success" />}
                        {i === byTreatment.length - 1 && byTreatment.length > 1 && <AlertTriangle className="w-4 h-4 text-destructive" />}
                        {t.name}
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{t.count}</td>
                      <td className="px-3 py-2 text-center"><StarRating value={t.avgRating} /></td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{t.avgService != null ? t.avgService.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{t.avgWaiting != null ? t.avgWaiting.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rankings: By Professional */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Ranking por Profissional</CardTitle></CardHeader>
        <CardContent>
          {byProfessional.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Profissional</th>
                  <th className="text-center px-3 py-2">Avaliações</th>
                  <th className="text-center px-3 py-2">Média</th>
                  <th className="text-center px-3 py-2">Atenção</th>
                  <th className="text-center px-3 py-2">Espera</th>
                </tr></thead>
                <tbody>
                  {byProfessional.map((p, i) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-bold text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{p.count}</td>
                      <td className="px-3 py-2 text-center"><StarRating value={p.avgRating} /></td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{p.avgService != null ? p.avgService.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{p.avgWaiting != null ? p.avgWaiting.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Patient */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader><CardTitle className="text-base">Por Paciente</CardTitle></CardHeader>
        <CardContent>
          {byPatient.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left px-3 py-2">Paciente</th>
                  <th className="text-center px-3 py-2">Avaliações</th>
                  <th className="text-center px-3 py-2">Média</th>
                  <th className="text-center px-3 py-2">Última</th>
                  <th className="text-center px-3 py-2">Tendência</th>
                </tr></thead>
                <tbody>
                  {byPatient.map(p => (
                    <tr key={p.id} className="border-b last:border-0 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedPatient(p)}>
                      <td className="px-3 py-2 font-medium text-primary">{p.name}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{p.count}</td>
                      <td className="px-3 py-2 text-center"><StarRating value={p.avg} /></td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{format(new Date(p.lastDate), 'dd/MM', { locale: ptBR })}</td>
                      <td className="px-3 py-2 text-center">
                        {p.trend === 'up' && <TrendingUp className="w-4 h-4 text-success mx-auto" />}
                        {p.trend === 'down' && <TrendingDown className="w-4 h-4 text-destructive mx-auto" />}
                        {p.trend === 'stable' && <Minus className="w-4 h-4 text-muted-foreground mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Shift */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardHeader><CardTitle className="text-base">Por Turno</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {byShift.map(s => (
              <Card key={s.key} className="border">
                <CardContent className="p-4 text-center">
                  <s.Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <h4 className="font-semibold text-foreground">{s.label}</h4>
                  <p className="text-2xl font-bold text-foreground mt-1">{s.count > 0 ? s.avg.toFixed(1) : '—'}</p>
                  <p className="text-xs text-muted-foreground">{s.count} avaliações</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* NPS Cross-analysis */}
      {npsResponses.length > 0 && (
        <Card className="shadow-card mb-6 animate-fade-in">
          <CardHeader><CardTitle className="text-base">NPS × Feedback Cruzado</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left px-3 py-2">Paciente</th>
                  <th className="text-center px-3 py-2">NPS</th>
                  <th className="text-center px-3 py-2">Classificação</th>
                  <th className="text-center px-3 py-2">Média Feedback</th>
                  <th className="text-center px-3 py-2">Coerência</th>
                </tr></thead>
                <tbody>
                  {npsResponses.slice(0, 20).map((r: unknown) => {
                    const cls = classifyNps(r.score);
                    const patientFb = feedbacks.filter((f: unknown) => f.patient_id === r.patient_id);
                    const fbAvg = patientFb.length > 0 ? patientFb.reduce((s: number, f: unknown) => s + f.rating, 0) / patientFb.length : null;
                    const coherent = fbAvg === null ? null : (r.score >= 9 && fbAvg >= 4) || (r.score <= 6 && fbAvg <= 3) || (r.score >= 7 && r.score <= 8 && fbAvg >= 3 && fbAvg <= 4);
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{(r.patients as unknown)?.full_name}</td>
                        <td className={cn("px-3 py-2 text-center font-bold", cls.color)}>{r.score}</td>
                        <td className="px-3 py-2 text-center"><BrandBadge status={r.score >= 9 ? 'approved' : r.score >= 7 ? 'pending' : 'cancelled'}>{cls.label}</BrandBadge></td>
                        <td className="px-3 py-2 text-center">{fbAvg !== null ? <StarRating value={fbAvg} /> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-center">
                          {coherent === null ? <span className="text-muted-foreground">—</span> : coherent ? <BrandBadge status="approved">Coerente</BrandBadge> : <BrandBadge status="cancelled">Divergente</BrandBadge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Patient detail drawer */}
      <Sheet open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Histórico — {selectedPatient?.name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            {patientFeedbackHistory.map((f: unknown) => (
              <div key={f.id} className="p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => <Star key={s} className={cn("w-3.5 h-3.5", s <= f.rating ? "text-accent fill-accent" : "text-muted")} />)}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <p className="text-xs text-muted-foreground">{(f.session_records as unknown)?.treatments?.name || '—'}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {f.service_attention != null && <span>Atenção: {f.service_attention}/5</span>}
                  {f.waiting_time != null && <span>Espera: {f.waiting_time}/5</span>}
                </div>
                {f.comment && <p className="text-sm mt-1">{f.comment}</p>}
              </div>
            ))}
            {patientFeedbackHistory.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
