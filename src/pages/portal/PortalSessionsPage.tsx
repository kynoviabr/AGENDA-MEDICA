import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PortalSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      const { data } = await supabase.from('session_records')
        .select('*, treatments(name)')
        .eq('patient_id', portal.patient_id)
        .order('performed_at', { ascending: false });
      setSessions(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Minhas Sessões</h2>
      {sessions.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhuma sessão registrada</p>
        </CardContent></Card>
      ) : sessions.map(s => (
        <Card key={s.id} className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground text-sm">{(s as unknown).treatments?.name || 'Sessão'}</span>
              <Badge variant="outline">#{s.session_number}/{s.total_sessions}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{format(new Date(s.performed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            {s.observations && <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{s.observations}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
