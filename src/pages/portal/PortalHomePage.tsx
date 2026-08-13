import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Star, Activity, FileText, Camera, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PortalHomePage() {
  const { user } = useAuth();
  const { clinicName } = useBranding();
  const [patientName, setPatientName] = useState('');
  const [nextSession, setNextSession] = useState<unknown>(null);
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [photoCount, setPhotoCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get patient record via patient app access
      const { data: portal } = await supabase
        .from('patient_users' as unknown)
        .select('patient_id, clinic_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (!portal) return;

      const pid = portal.patient_id;
      const cid = portal.clinic_id;

      // Patient name
      const { data: patient } = await supabase.from('patients').select('full_name').eq('id', pid).maybeSingle();
      if (patient) setPatientName(patient.full_name);

      // Next appointment
      const { data: appt } = await supabase.from('appointments').select('*, treatments(name)')
        .eq('patient_id', pid).gte('start_time', new Date().toISOString())
        .in('status', ['scheduled', 'confirmed']).order('start_time').limit(1).maybeSingle();
      if (appt) setNextSession(appt);

      // Session progress
      const { data: sessions } = await supabase.from('session_records').select('session_number, total_sessions')
        .eq('patient_id', pid).order('session_number', { ascending: false }).limit(1).maybeSingle();
      if (sessions) setProgress({ done: sessions.session_number, total: sessions.total_sessions });

      // Photo count
      const { count } = await supabase.from('patient_photos').select('id', { count: 'exact', head: true }).eq('patient_id', pid);
      setPhotoCount(count || 0);
    };
    load();
  }, [user]);

  const pct = Math.round((progress.done / progress.total) * 100);

  const quickLinks = [
    { icon: CalendarDays, label: 'Sessões', value: `${progress.done}/${progress.total}`, to: '/portal/sessions' },
    { icon: Activity, label: 'Evolução', to: '/portal/evolution' },
    { icon: Camera, label: 'Fotos', value: `${photoCount} registros`, to: '/portal/photos' },
    { icon: FileText, label: 'Contrato', to: '/portal/contract' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="gradient-primary rounded-2xl p-6 text-primary-foreground">
        <p className="text-sm opacity-80">Olá,</p>
        <h2 className="text-xl font-bold mb-1">{patientName || 'Paciente'}</h2>
        <p className="text-sm opacity-80">Seu tratamento está {pct}% concluído</p>
        <div className="mt-3 h-2 rounded-full bg-primary-foreground/20 overflow-hidden">
          <div className="h-full rounded-full bg-primary-foreground/80 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {quickLinks.map(({ icon: Icon, label, value, to }) => (
          <NavLink key={to} to={to}>
            <Card className="shadow-card hover:shadow-card-hover transition-all cursor-pointer h-full">
              <CardContent className="p-4">
                <Icon className="w-5 h-5 text-primary mb-2" />
                <p className="font-semibold text-sm text-foreground">{label}</p>
                {value && <p className="text-xs text-muted-foreground mt-0.5">{value}</p>}
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      {nextSession && (
        <Card className="shadow-card">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-3">Próxima Sessão</h3>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm text-foreground">
                  {(nextSession as unknown).treatments?.name || 'Sessão'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(nextSession.start_time), "EEEE, dd MMM '•' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{nextSession.status === 'confirmed' ? 'Confirmada' : 'Agendada'}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
