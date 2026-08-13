import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, MessageSquare, HeartHandshake, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function PortalFeedbackPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feedbacks, setFeedbacks] = useState<unknown[]>([]);
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSession, setSelectedSession] = useState('');
  const [rating, setRating] = useState(5);
  const [serviceAttention, setServiceAttention] = useState(5);
  const [waitingTime, setWaitingTime] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id, clinic_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      setPatientId(portal.patient_id);
      setClinicId(portal.clinic_id);

      const [fb, sess] = await Promise.all([
        supabase.from('session_feedback').select('*, session_records(performed_at, treatments(name))').eq('patient_id', portal.patient_id).order('created_at', { ascending: false }),
        supabase.from('session_records').select('id, session_number, total_sessions, performed_at, treatment_id, professional_id, treatments(name)').eq('patient_id', portal.patient_id).order('performed_at', { ascending: false }),
      ]);
      setFeedbacks(fb.data || []);
      setSessions(sess.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !clinicId || !selectedSession) return;
    setSubmitting(true);

    // Get session details for auto-copy
    const session = sessions.find(s => s.id === selectedSession);
    const isNegative = rating <= 3 || serviceAttention <= 2 || waitingTime <= 2;

    const { error } = await supabase.from('session_feedback').insert({
      clinic_id: clinicId,
      patient_id: patientId,
      session_record_id: selectedSession,
      rating,
      service_attention: serviceAttention,
      waiting_time: waitingTime,
      comment: comment || null,
      treatment_id: session?.treatment_id || null,
      professional_id: session?.professional_id || null,
      is_negative: isNegative,
    });

    // Dissatisfaction flagging is handled automatically by database trigger

    setSubmitting(false);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Avaliação enviada!' });
    setComment(''); setRating(5); setServiceAttention(5); setWaitingTime(5); setSelectedSession('');
    const { data } = await supabase.from('session_feedback').select('*, session_records(performed_at, treatments(name))').eq('patient_id', patientId).order('created_at', { ascending: false });
    setFeedbacks(data || []);
  };

  const RatingSelector = ({ value, onChange, label, icon: Icon }: { value: number; onChange: (v: number) => void; label: string; icon: unknown }) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><Icon className="w-4 h-4 text-primary" />{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} type="button" onClick={() => onChange(s)}>
            <Star className={cn("w-7 h-7 transition-colors", s <= value ? 'text-accent fill-accent' : 'text-muted-foreground')} />
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Avaliar Sessão</h2>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Sessão</Label>
              <Select value={selectedSession} onValueChange={setSelectedSession}>
                <SelectTrigger><SelectValue placeholder="Selecione a sessão" /></SelectTrigger>
                <SelectContent>{sessions.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s as unknown).treatments?.name || 'Sessão'} #{s.session_number} — {format(new Date(s.performed_at), 'dd/MM', { locale: ptBR })}
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>

            <RatingSelector value={rating} onChange={setRating} label="Avaliação Geral" icon={Star} />
            <RatingSelector value={serviceAttention} onChange={setServiceAttention} label="Atenção no Atendimento" icon={HeartHandshake} />
            <RatingSelector value={waitingTime} onChange={setWaitingTime} label="Tempo de Espera" icon={Clock} />

            <div className="space-y-2">
              <Label>Comentário (opcional)</Label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Conte como foi sua experiência..." rows={3} />
            </div>
            <Button type="submit" disabled={submitting || !selectedSession} className="w-full gradient-primary text-primary-foreground">
              {submitting ? 'Enviando...' : 'Enviar Avaliação'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {feedbacks.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Minhas Avaliações</h3>
          {feedbacks.map(fb => (
            <Card key={fb.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={cn("w-4 h-4", s <= fb.rating ? 'text-accent fill-accent' : 'text-muted-foreground')} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(fb.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {fb.service_attention != null && <span>Atenção: {fb.service_attention}/5</span>}
                  {fb.waiting_time != null && <span>Espera: {fb.waiting_time}/5</span>}
                </div>
                {fb.comment && <p className="text-sm text-foreground mt-2">{fb.comment}</p>}
                {fb.response && (
                  <div className="mt-2 p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs font-medium text-muted-foreground">Resposta da clínica:</p>
                    <p className="text-sm text-foreground">{fb.response}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
