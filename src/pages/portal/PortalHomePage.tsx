import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, History, MapPin, Stethoscope } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type PortalAppointment = {
  id: string;
  start_time: string;
  status: string;
  appointment_type: string;
  professionals?: { full_name?: string | null; specialty?: string | null } | null;
  treatments?: { name?: string | null } | null;
  clinic_locations?: { name?: string | null } | null;
};

const statusLabels: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  rescheduled: 'Remarcado',
};

function AppointmentCard({ appointment }: { appointment: PortalAppointment }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">
            {appointment.treatments?.name || 'Consulta'}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(appointment.start_time), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <Badge variant="outline">{statusLabels[appointment.status] || appointment.status}</Badge>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" />{appointment.professionals?.full_name || 'Profissional a confirmar'}</span>
        {appointment.clinic_locations?.name && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{appointment.clinic_locations.name}</span>}
      </div>
    </div>
  );
}

export default function PortalHomePage() {
  const { user } = useAuth();
  const [patientName, setPatientName] = useState('');
  const [appointments, setAppointments] = useState<PortalAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data: access } = await supabase
        .from('patient_users' as never)
        .select('patient_id, clinic_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!access) {
        setLoading(false);
        return;
      }

      const patientId = (access as { patient_id: string }).patient_id;
      const [{ data: patient }, { data: appointmentRows }] = await Promise.all([
        supabase.from('patients').select('full_name').eq('id', patientId).maybeSingle(),
        supabase
          .from('appointments')
          .select('id,start_time,status,appointment_type,professionals(full_name,specialty),treatments(name),clinic_locations(name)')
          .eq('patient_id', patientId)
          .order('start_time', { ascending: false })
          .limit(30),
      ]);

      setPatientName(patient?.full_name || 'Paciente');
      setAppointments((appointmentRows || []) as unknown as PortalAppointment[]);
      setLoading(false);
    };
    void load();
  }, [user]);

  const now = Date.now();
  const upcoming = useMemo(
    () => appointments.filter((item) => new Date(item.start_time).getTime() >= now && ['scheduled', 'confirmed'].includes(item.status)).reverse(),
    [appointments, now],
  );
  const history = useMemo(
    () => appointments.filter((item) => new Date(item.start_time).getTime() < now || !['scheduled', 'confirmed'].includes(item.status)),
    [appointments, now],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="gradient-primary rounded-2xl p-6 text-primary-foreground">
        <p className="text-sm opacity-80">Olá,</p>
        <h2 className="text-xl font-bold">{patientName || 'Paciente'}</h2>
        <p className="mt-1 text-sm opacity-80">Consulte seus agendamentos e informações administrativas.</p>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Próximos agendamentos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando agenda...</p>}
          {!loading && upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>}
          {upcoming.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Histórico de agendamentos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!loading && history.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento no histórico.</p>}
          {history.slice(0, 10).map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
          {history.length > 10 && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Exibindo os 10 registros mais recentes.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
