import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock3, Mail, MapPin, MessageSquare, Phone, Save, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Patient = Database['public']['Tables']['patients']['Row'];
type Appointment = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'start_time' | 'status' | 'appointment_type' | 'billing_type'> & {
  professionals?: { full_name?: string | null; specialty?: string | null } | null;
  treatments?: { name?: string | null } | null;
  clinic_locations?: { name?: string | null } | null;
  health_insurances?: { name?: string | null } | null;
};
type OriginLead = Pick<Database['public']['Tables']['leads']['Row'], 'id' | 'source' | 'created_at' | 'assigned_to' | 'notes'>;
type Interaction = Pick<Database['public']['Tables']['lead_interactions']['Row'], 'id' | 'type' | 'notes' | 'performed_at'>;

const statusLabels: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado', in_progress: 'Em atendimento', completed: 'Concluído',
  cancelled: 'Cancelado', no_show: 'Não compareceu', rescheduled: 'Remarcado',
};

export default function AdministrativePatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', cpf: '', date_of_birth: '', zip_code: '', address: '', city: '', state: '', notes: '' });

  const { data: patient, isLoading } = useQuery({
    queryKey: ['administrative-patient', clinicId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('*').eq('clinic_id', clinicId!).eq('id', id!).single();
      if (error) throw error;
      return data as Patient;
    },
    enabled: !!clinicId && !!id,
  });

  useEffect(() => {
    if (!patient) return;
    setForm({
      full_name: patient.full_name, phone: patient.phone || '', email: patient.email || '', cpf: patient.cpf || '',
      date_of_birth: patient.date_of_birth || '', zip_code: patient.zip_code || '', address: patient.address || '',
      city: patient.city || '', state: patient.state || '', notes: patient.notes || '',
    });
  }, [patient]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['administrative-patient-appointments', clinicId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments')
        .select('id,start_time,status,appointment_type,billing_type,professionals(full_name,specialty),treatments(name),clinic_locations(name),health_insurances(name)')
        .eq('clinic_id', clinicId!).eq('patient_id', id!).order('start_time', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Appointment[];
    },
    enabled: !!clinicId && !!id,
  });

  const { data: originLeads = [] } = useQuery({
    queryKey: ['administrative-patient-leads', clinicId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id,source,created_at,assigned_to,notes').eq('clinic_id', clinicId!).eq('patient_id', id!).order('created_at');
      if (error) throw error;
      return (data || []) as OriginLead[];
    },
    enabled: !!clinicId && !!id,
  });

  const leadIds = originLeads.map((lead) => lead.id);
  const { data: interactions = [] } = useQuery({
    queryKey: ['administrative-patient-interactions', clinicId, leadIds],
    queryFn: async () => {
      if (leadIds.length === 0) return [];
      const { data, error } = await supabase.from('lead_interactions').select('id,type,notes,performed_at').eq('clinic_id', clinicId!).in('lead_id', leadIds).order('performed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Interaction[];
    },
    enabled: !!clinicId && leadIds.length > 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !id || !form.full_name.trim()) throw new Error('Informe o nome do paciente.');
      const { error } = await supabase.from('patients').update({
        full_name: form.full_name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
        cpf: form.cpf.trim() || null, date_of_birth: form.date_of_birth || null, zip_code: form.zip_code.trim() || null,
        address: form.address.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null,
        notes: form.notes.trim() || null,
      }).eq('clinic_id', clinicId).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['administrative-patient', clinicId, id] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({ title: 'Dados administrativos salvos' });
    },
    onError: (error: Error) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });

  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando paciente...</p>;
  if (!patient) return <p className="p-6 text-muted-foreground">Paciente não encontrado.</p>;

  const upcoming = appointments.filter((item) => new Date(item.start_time).getTime() >= Date.now() && ['scheduled', 'confirmed'].includes(item.status)).reverse();
  const history = appointments.filter((item) => !upcoming.some((future) => future.id === item.id));

  const appointmentRow = (appointment: Appointment) => (
    <div key={appointment.id} className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{appointment.treatments?.name || 'Consulta'}</p>
          <p className="text-sm text-muted-foreground">{format(new Date(appointment.start_time), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>
        <Badge variant="outline">{statusLabels[appointment.status] || appointment.status}</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>{appointment.professionals?.full_name || 'Profissional não informado'}</span>
        <span>{appointment.clinic_locations?.name || 'Unidade não informada'}</span>
        <span>{appointment.billing_type === 'insurance' ? appointment.health_insurances?.name || 'Convênio' : 'Particular'}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title={patient.full_name} description="Cadastro administrativo para recepção e agendamento">
        <div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/clinic/patients')}><ArrowLeft className="mr-2 h-4 w-4" />Pacientes</Button><Button onClick={() => navigate(`/clinic/appointments?patientId=${patient.id}&openNew=1`)}><CalendarDays className="mr-2 h-4 w-4" />Agendar</Button></div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><Phone className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Telefone / WhatsApp</p><p className="font-medium">{patient.phone || 'Não informado'}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Mail className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">E-mail</p><p className="font-medium">{patient.email || 'Não informado'}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Próximos horários</p><p className="font-medium">{upcoming.length}</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="data" className="space-y-4">
        <TabsList><TabsTrigger value="data">Dados administrativos</TabsTrigger><TabsTrigger value="appointments">Agendamentos</TabsTrigger><TabsTrigger value="interactions">Interações</TabsTrigger></TabsList>
        <TabsContent value="data">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" />Informações cadastrais</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>Nome</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Telefone / WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
            <div className="space-y-2"><Label>Data de nascimento</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div className="space-y-2"><Label>CEP</Label><Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Observações administrativas</Label><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="md:col-span-2 flex justify-end"><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save className="mr-2 h-4 w-4" />Salvar</Button></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="appointments" className="space-y-4">
          <Card><CardHeader><CardTitle>Próximos agendamentos</CardTitle></CardHeader><CardContent className="space-y-3">{upcoming.length ? upcoming.map(appointmentRow) : <p className="text-sm text-muted-foreground">Nenhum próximo agendamento.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Histórico de agendamentos</CardTitle></CardHeader><CardContent className="space-y-3">{history.length ? history.map(appointmentRow) : <p className="text-sm text-muted-foreground">Nenhum agendamento no histórico.</p>}</CardContent></Card>
        </TabsContent>
        <TabsContent value="interactions">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Contexto administrativo de origem</CardTitle></CardHeader><CardContent className="space-y-4">
            {originLeads.length === 0 && <p className="text-sm text-muted-foreground">Paciente sem lead de origem vinculado.</p>}
            {originLeads.map((lead) => <div key={lead.id} className="rounded-lg border p-3 text-sm"><p><strong>Origem:</strong> {lead.source || 'Não informada'}</p><p className="text-xs text-muted-foreground">Contato iniciado em {format(new Date(lead.created_at), 'dd/MM/yyyy')}</p>{lead.notes && <p className="mt-2 text-muted-foreground">{lead.notes}</p>}</div>)}
            {interactions.map((interaction) => <div key={interaction.id} className="rounded-lg bg-muted/50 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{interaction.type}</strong><span className="text-xs text-muted-foreground">{format(new Date(interaction.performed_at), 'dd/MM/yyyy HH:mm')}</span></div><p className="mt-1 text-muted-foreground">{interaction.notes || 'Sem observações.'}</p></div>)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
