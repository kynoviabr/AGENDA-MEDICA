import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Clock3, Stethoscope, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandStat } from '@/components/ui/brand-stat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  professional_id: string | null;
  start_time: string;
  status: string;
  patients?: {
    full_name?: string | null;
    is_self_payer?: boolean | null;
    payer_id?: string | null;
    payers?: { name?: string | null } | null;
  } | null;
};

type ProfessionalRow = {
  user_id: string;
  full_name: string;
  specialty: string | null;
};

type WaitlistRow = {
  id: string;
  preferred_professional_id: string | null;
  priority: string;
  status: string;
  created_at: string;
  patients?: { full_name?: string | null } | null;
  leads?: { full_name?: string | null } | null;
  treatments?: { name?: string | null; category?: string | null } | null;
};

type PeriodCounts = { today: number; week: number; month: number; waitlist: number };

const activeStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed'];
const waitlistStatuses = ['waiting', 'match_found', 'contact_attempted'];

function uniquePatients(rows: AppointmentRow[]) {
  return new Set(rows.map((row) => row.patient_id).filter(Boolean)).size;
}

function inRange(value: string, start: Date, end: Date) {
  const date = new Date(value);
  return date >= start && date <= end;
}

function priorityLabel(priority: string) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Alta';
  return 'Normal';
}

export default function ClinicDashboard() {
  const { clinicId } = useBranding();
  const navigate = useNavigate();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { locale: ptBR });
  const weekEnd = endOfWeek(now, { locale: ptBR });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const queryStart = weekStart < monthStart ? weekStart : monthStart;
  const queryEnd = weekEnd > monthEnd ? weekEnd : monthEnd;

  const dashboardQuery = useQuery({
    queryKey: ['operational-dashboard', clinicId, format(now, 'yyyy-MM-dd')],
    queryFn: async () => {
      const [appointmentsResult, professionalsResult, waitlistResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, patient_id, professional_id, start_time, status, patients(full_name, is_self_payer, payer_id, payers(name))')
          .eq('clinic_id', clinicId!)
          .in('status', activeStatuses)
          .gte('start_time', queryStart.toISOString())
          .lte('start_time', queryEnd.toISOString()),
        supabase
          .from('professionals')
          .select('user_id, full_name, specialty')
          .eq('clinic_id', clinicId!)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('appointment_waitlist')
          .select('id, preferred_professional_id, priority, status, created_at, patients(full_name), leads(full_name), treatments(name, category)')
          .eq('clinic_id', clinicId!)
          .in('status', waitlistStatuses)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true }),
      ]);

      if (appointmentsResult.error) throw appointmentsResult.error;
      if (professionalsResult.error) throw professionalsResult.error;
      if (waitlistResult.error) throw waitlistResult.error;

      return {
        appointments: (appointmentsResult.data || []) as unknown as AppointmentRow[],
        professionals: (professionalsResult.data || []) as ProfessionalRow[],
        waitlist: (waitlistResult.data || []) as unknown as WaitlistRow[],
      };
    },
    enabled: !!clinicId,
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    const appointments = dashboardQuery.data?.appointments || [];
    const professionals = dashboardQuery.data?.professionals || [];
    const waitlist = dashboardQuery.data?.waitlist || [];
    const professionalMap = new Map(professionals.map((item) => [item.user_id, item]));

    const todayRows = appointments.filter((row) => inRange(row.start_time, todayStart, todayEnd));
    const weekRows = appointments.filter((row) => inRange(row.start_time, weekStart, weekEnd));
    const monthRows = appointments.filter((row) => inRange(row.start_time, monthStart, monthEnd));

    const doctorRows = professionals.map((professional) => {
      const doctorAppointments = appointments.filter((row) => row.professional_id === professional.user_id);
      return {
        id: professional.user_id,
        name: professional.full_name,
        specialty: professional.specialty || 'Sem especialidade',
        today: uniquePatients(doctorAppointments.filter((row) => inRange(row.start_time, todayStart, todayEnd))),
        week: uniquePatients(doctorAppointments.filter((row) => inRange(row.start_time, weekStart, weekEnd))),
        month: uniquePatients(doctorAppointments.filter((row) => inRange(row.start_time, monthStart, monthEnd))),
        waitlist: waitlist.filter((row) => row.preferred_professional_id === professional.user_id).length,
      };
    }).filter((row) => row.today + row.week + row.month + row.waitlist > 0);

    const specialtyMap = new Map<string, PeriodCounts>();
    const ensureSpecialty = (name: string) => {
      if (!specialtyMap.has(name)) specialtyMap.set(name, { today: 0, week: 0, month: 0, waitlist: 0 });
      return specialtyMap.get(name)!;
    };

    doctorRows.forEach((doctor) => {
      const item = ensureSpecialty(doctor.specialty);
      item.today += doctor.today;
      item.week += doctor.week;
      item.month += doctor.month;
      item.waitlist += doctor.waitlist;
    });
    waitlist.filter((item) => !item.preferred_professional_id).forEach((item) => {
      ensureSpecialty(item.treatments?.category || 'Especialidade não informada').waitlist += 1;
    });

    const coverageMap = new Map<string, number>();
    monthRows.forEach((appointment) => {
      const patient = appointment.patients;
      const name = patient?.is_self_payer === false
        ? patient.payers?.name || 'Convênio não informado'
        : 'Particular';
      coverageMap.set(name, (coverageMap.get(name) || 0) + 1);
    });
    const coverage = Array.from(coverageMap, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      today: uniquePatients(todayRows),
      week: uniquePatients(weekRows),
      month: uniquePatients(monthRows),
      waitlist: waitlist.length,
      doctors: doctorRows.sort((a, b) => b.month - a.month),
      specialties: Array.from(specialtyMap, ([name, counts]) => ({ name, ...counts })).sort((a, b) => b.month - a.month),
      coverage,
      monthAppointments: monthRows.length,
      waitlistRows: waitlist,
      professionalMap,
    };
  }, [dashboardQuery.data, monthEnd, monthStart, todayEnd, todayStart, weekEnd, weekStart]);

  if (dashboardQuery.isLoading) {
    return <div className="space-y-5"><Skeleton className="h-20 w-full" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div><Skeleton className="h-96" /></div>;
  }

  if (dashboardQuery.error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar os indicadores da agenda: {(dashboardQuery.error as Error).message}</CardContent></Card>;
  }

  const maxCoverage = Math.max(...metrics.coverage.map((item) => item.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard da agenda" description={`Visão operacional de ${format(now, "MMMM 'de' yyyy", { locale: ptBR })}.`}>
        <Button onClick={() => navigate('/clinic/appointments')}><CalendarDays className="mr-2 h-4 w-4" />Abrir agenda</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BrandStat label="Pacientes hoje" value={metrics.today} icon={UserRound} />
        <BrandStat label="Pacientes na semana" value={metrics.week} icon={CalendarDays} />
        <BrandStat label="Pacientes no mês" value={metrics.month} icon={UsersRound} />
        <BrandStat label="Solicitações de encaixe" value={metrics.waitlist} icon={Clock3} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" />Agendados por médico</CardTitle></CardHeader>
          <CardContent>
            {metrics.doctors.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado no período.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 font-medium">Médico</th><th className="pb-3 text-center font-medium">Hoje</th><th className="pb-3 text-center font-medium">Semana</th><th className="pb-3 text-center font-medium">Mês</th><th className="pb-3 text-center font-medium">Encaixes</th></tr></thead><tbody>{metrics.doctors.map((doctor) => <tr key={doctor.id} className="border-b last:border-0"><td className="py-3"><p className="font-medium">{doctor.name}</p><p className="text-xs text-muted-foreground">{doctor.specialty}</p></td><td className="py-3 text-center">{doctor.today}</td><td className="py-3 text-center">{doctor.week}</td><td className="py-3 text-center font-semibold">{doctor.month}</td><td className="py-3 text-center">{doctor.waitlist > 0 ? <Badge variant="secondary">{doctor.waitlist}</Badge> : '—'}</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" />Agendados por especialidade</CardTitle></CardHeader>
          <CardContent>
            {metrics.specialties.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Cadastre a especialidade dos médicos para visualizar este indicador.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 font-medium">Especialidade</th><th className="pb-3 text-center font-medium">Hoje</th><th className="pb-3 text-center font-medium">Semana</th><th className="pb-3 text-center font-medium">Mês</th><th className="pb-3 text-center font-medium">Encaixes</th></tr></thead><tbody>{metrics.specialties.map((item) => <tr key={item.name} className="border-b last:border-0"><td className="py-3 font-medium">{item.name}</td><td className="py-3 text-center">{item.today}</td><td className="py-3 text-center">{item.week}</td><td className="py-3 text-center font-semibold">{item.month}</td><td className="py-3 text-center">{item.waitlist > 0 ? <Badge variant="secondary">{item.waitlist}</Badge> : '—'}</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />Fila de encaixe</CardTitle><Button variant="outline" size="sm" onClick={() => navigate('/clinic/appointments')}>Gerenciar fila</Button></div></CardHeader>
          <CardContent>
            {metrics.waitlistRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Não há solicitações de encaixe abertas.</p> : (
              <div className="space-y-3">{metrics.waitlistRows.slice(0, 8).map((item) => {
                const doctor = item.preferred_professional_id ? metrics.professionalMap.get(item.preferred_professional_id) : null;
                return <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.patients?.full_name || item.leads?.full_name || 'Solicitação sem nome'}</p><p className="truncate text-xs text-muted-foreground">{doctor ? `${doctor.full_name} · ${doctor.specialty || 'Sem especialidade'}` : item.treatments?.category || item.treatments?.name || 'Qualquer médico'}</p></div><div className="shrink-0 text-right"><Badge variant={item.priority === 'urgent' ? 'destructive' : 'secondary'}>{priorityLabel(item.priority)}</Badge><p className="mt-1 text-xs text-muted-foreground">{format(new Date(item.created_at), 'dd/MM')}</p></div></div>;
              })}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" />Convênio e particular</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div><p className="text-sm text-muted-foreground">Agendamentos no mês</p><p className="text-3xl font-bold">{metrics.monthAppointments}</p></div>
            {metrics.coverage.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhum agendamento encontrado no mês.</p> : metrics.coverage.map((item) => {
              const percentage = metrics.monthAppointments > 0 ? Math.round((item.count / metrics.monthAppointments) * 100) : 0;
              return <div key={item.name} className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">{item.name}</span><span className="text-muted-foreground">{item.count} · {percentage}%</span></div><Progress value={(item.count / maxCoverage) * 100} /></div>;
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
