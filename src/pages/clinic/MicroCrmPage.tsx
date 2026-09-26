import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock3, History, KanbanSquare, MessageSquare, Phone, Plus, Search, UserCheck2, UserRound } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Lead = Database['public']['Tables']['leads']['Row'];
type LeadInteraction = Database['public']['Tables']['lead_interactions']['Row'];
type StageHistory = Database['public']['Tables']['lead_stage_history']['Row'];
type Appointment = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'start_time' | 'status'> & {
  professionals?: { full_name?: string | null } | null;
};
type Stage = { code: string; label: string; description: string; color: string };

const productLabels: Record<string, string> = {
  new_lead: 'Novo contato',
  contacted: 'Em atendimento',
  attended: 'Interessado',
  negotiating: 'Interessado',
  proposal_sent: 'Interessado',
  scheduled: 'Agendado',
  closed_won: 'Follow-up',
  follow_up: 'Follow-up',
  closed_lost: 'Perdido',
  lost: 'Perdido',
};

const defaultStages: Stage[] = [
  { code: 'new_lead', label: 'Novo contato', description: 'Contatos recém-chegados.', color: 'border-slate-200 bg-slate-50' },
  { code: 'contacted', label: 'Em atendimento', description: 'Atendimento administrativo iniciado.', color: 'border-sky-200 bg-sky-50' },
  { code: 'proposal_sent', label: 'Interessado', description: 'Interesse confirmado; aguardando próximo passo.', color: 'border-violet-200 bg-violet-50' },
  { code: 'scheduled', label: 'Agendado', description: 'Contato com agendamento.', color: 'border-cyan-200 bg-cyan-50' },
  { code: 'closed_won', label: 'Follow-up', description: 'Paciente convertido para acompanhamento.', color: 'border-emerald-200 bg-emerald-50' },
  { code: 'closed_lost', label: 'Perdido', description: 'Contato encerrado.', color: 'border-rose-200 bg-rose-50' },
];

const palette = ['border-slate-200 bg-slate-50', 'border-sky-200 bg-sky-50', 'border-violet-200 bg-violet-50', 'border-cyan-200 bg-cyan-50', 'border-emerald-200 bg-emerald-50', 'border-rose-200 bg-rose-50'];
const priorityLabel: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };
const interactionLabels: Record<string, string> = { call_made: 'Ligação realizada', call_missed: 'Ligação não atendida', whatsapp: 'WhatsApp', email: 'E-mail', in_person: 'Presencial', note: 'Observação' };

function onlyDigits(value?: string | null) { return value?.replace(/\D/g, '') || ''; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'; }

export default function MicroCrmPage() {
  const { clinicId } = useUserRole();
  const { user } = useAuth();
  const { staff, byUserId } = useStaffDirectory(clinicId, ['admin', 'sales', 'receptionist', 'professional']);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [newLead, setNewLead] = useState({ full_name: '', phone: '', email: '', source: '', priority_level: 'medium', assigned_to: 'unassigned', notes: '' });
  const [interaction, setInteraction] = useState({ type: 'whatsapp', notes: '' });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['micro-crm-leads', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('*').eq('clinic_id', clinicId!).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!clinicId,
  });

  const { data: stages = defaultStages } = useQuery({
    queryKey: ['micro-crm-stages', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', 'crm_kanban_stages').maybeSingle();
      if (error || !data?.value) return defaultStages;
      try {
        const parsed = JSON.parse(data.value) as Array<{ code?: string; label?: string; description?: string }>;
        if (!Array.isArray(parsed) || parsed.length === 0) return defaultStages;
        return parsed.map((stage, index) => ({
          code: stage.code || `stage_${index}`,
          label: productLabels[stage.code || ''] || stage.label || stage.code || `Etapa ${index + 1}`,
          description: stage.description || '',
          color: palette[index % palette.length],
        }));
      } catch { return defaultStages; }
    },
    enabled: !!clinicId,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['micro-crm-interactions', clinicId, selectedLead?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_interactions').select('*').eq('clinic_id', clinicId!).eq('lead_id', selectedLead!.id).order('performed_at', { ascending: false });
      if (error) throw error;
      return data as LeadInteraction[];
    },
    enabled: !!clinicId && !!selectedLead,
  });

  const { data: stageHistory = [] } = useQuery({
    queryKey: ['micro-crm-history', clinicId, selectedLead?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_stage_history').select('*').eq('clinic_id', clinicId!).eq('lead_id', selectedLead!.id).order('changed_at', { ascending: false });
      if (error) throw error;
      return data as StageHistory[];
    },
    enabled: !!clinicId && !!selectedLead,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['micro-crm-appointments', clinicId, selectedLead?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id,start_time,status,professionals(full_name)').eq('clinic_id', clinicId!).eq('lead_id', selectedLead!.id).order('start_time', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Appointment[];
    },
    enabled: !!clinicId && !!selectedLead,
  });

  const sources = useMemo(() => Array.from(new Set(leads.map((lead) => lead.source).filter((value): value is string => !!value))).sort(), [leads]);
  const filtered = useMemo(() => leads.filter((lead) => {
    const haystack = `${lead.full_name} ${lead.phone || ''} ${lead.email || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (ownerFilter === 'all' || (ownerFilter === 'unassigned' ? !lead.assigned_to : lead.assigned_to === ownerFilter)) && (sourceFilter === 'all' || lead.source === sourceFilter);
  }), [leads, search, ownerFilter, sourceFilter]);

  const visibleStages = useMemo(() => {
    const configured = [...stages];
    for (const code of Array.from(new Set(filtered.map((lead) => lead.kanban_stage)))) {
      if (!configured.some((stage) => stage.code === code)) configured.push({ code, label: productLabels[code] || code, description: 'Etapa histórica preservada.', color: palette[configured.length % palette.length] });
    }
    return configured;
  }, [filtered, stages]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !newLead.full_name.trim() || !newLead.phone.trim()) throw new Error('Nome e telefone são obrigatórios.');
      const normalized = onlyDigits(newLead.phone);
      if (leads.some((lead) => normalized && onlyDigits(lead.phone) === normalized)) throw new Error('Já existe um contato com esse telefone.');
      const { data, error } = await supabase.from('leads').insert({
        clinic_id: clinicId, full_name: newLead.full_name.trim(), phone: newLead.phone.trim(), email: newLead.email.trim() || null,
        source: newLead.source.trim() || null, priority_level: newLead.priority_level,
        assigned_to: newLead.assigned_to === 'unassigned' ? null : newLead.assigned_to,
        notes: newLead.notes.trim() || null, kanban_stage: stages[0]?.code || 'new_lead', created_by: user?.id || null,
      }).select('*').single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (lead) => {
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-leads', clinicId] });
      setCreateOpen(false); setNewLead({ full_name: '', phone: '', email: '', source: '', priority_level: 'medium', assigned_to: 'unassigned', notes: '' });
      toast({ title: 'Contato criado', description: `${lead.full_name} foi incluído no Micro CRM.` });
    },
    onError: (error: unknown) => toast({ title: 'Erro', description: errorMessage(error), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Database['public']['Tables']['leads']['Update']) => {
      if (!selectedLead || !clinicId) return;
      const { error } = await supabase.from('leads').update(patch).eq('clinic_id', clinicId).eq('id', selectedLead.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      if (patch && selectedLead) setSelectedLead({ ...selectedLead, ...patch } as Lead);
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-leads', clinicId] });
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-history', clinicId, selectedLead?.id] });
      toast({ title: 'Contato atualizado' });
    },
    onError: (error: unknown) => toast({ title: 'Erro', description: errorMessage(error), variant: 'destructive' }),
  });

  const interactionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !clinicId) return;
      const { error } = await supabase.from('lead_interactions').insert({ clinic_id: clinicId, lead_id: selectedLead.id, type: interaction.type, notes: interaction.notes.trim() || null, performed_by: user?.id || null });
      if (error) throw error;
      if (selectedLead.kanban_stage === 'new_lead') await supabase.from('leads').update({ kanban_stage: 'contacted' }).eq('clinic_id', clinicId).eq('id', selectedLead.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-interactions', clinicId, selectedLead?.id] });
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-leads', clinicId] });
      setInteractionOpen(false); setInteraction({ type: 'whatsapp', notes: '' }); toast({ title: 'Interação registrada' });
    },
    onError: (error: unknown) => toast({ title: 'Erro', description: errorMessage(error), variant: 'destructive' }),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !clinicId) return null;
      if (selectedLead.patient_id) return selectedLead.patient_id;
      let patientId: string | null = null;
      if (selectedLead.cpf) {
        const { data } = await supabase.from('patients').select('id').eq('clinic_id', clinicId).eq('cpf', selectedLead.cpf).limit(1).maybeSingle();
        patientId = data?.id || null;
      }
      if (!patientId && selectedLead.phone) {
        const { data } = await supabase.from('patients').select('id').eq('clinic_id', clinicId).eq('phone', selectedLead.phone).limit(1).maybeSingle();
        patientId = data?.id || null;
      }
      if (!patientId) {
        const { data, error } = await supabase.from('patients').insert({ clinic_id: clinicId, full_name: selectedLead.full_name, phone: selectedLead.phone, cpf: selectedLead.cpf, email: selectedLead.email, date_of_birth: selectedLead.birth_date, zip_code: selectedLead.zip_code, address: selectedLead.address, city: selectedLead.city, state: selectedLead.state, notes: selectedLead.notes, status: 'active' }).select('id').single();
        if (error) throw error;
        patientId = data.id;
      }
      const { error } = await supabase.from('leads').update({ patient_id: patientId, converted_at: new Date().toISOString() }).eq('clinic_id', clinicId).eq('id', selectedLead.id);
      if (error) throw error;
      return patientId;
    },
    onSuccess: (patientId) => {
      void queryClient.invalidateQueries({ queryKey: ['micro-crm-leads', clinicId] });
      if (patientId && selectedLead) setSelectedLead({ ...selectedLead, patient_id: patientId, converted_at: new Date().toISOString() });
      toast({ title: 'Paciente vinculado', description: 'O histórico administrativo do contato foi preservado.' });
    },
    onError: (error: unknown) => toast({ title: 'Erro na conversão', description: errorMessage(error), variant: 'destructive' }),
  });

  const stageLabel = (code: string) => visibleStages.find((stage) => stage.code === code)?.label || productLabels[code] || code;

  return (
    <div className="space-y-5">
      <PageHeader title="Micro CRM" description="Contatos, atendimento, follow-up e conversão para paciente">
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo contato</Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contatos ativos</p><p className="text-2xl font-semibold">{leads.filter((lead) => !['closed_lost', 'lost'].includes(lead.kanban_stage)).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Agendados</p><p className="text-2xl font-semibold">{leads.filter((lead) => lead.kanban_stage === 'scheduled').length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Follow-ups vencidos</p><p className="text-2xl font-semibold">{leads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now()).length}</p></CardContent></Card>
      </div>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_200px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}><SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos responsáveis</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem>{staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}</SelectContent></Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}><SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as origens</SelectItem>{sources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {visibleStages.map((stage) => {
            const items = filtered.filter((lead) => lead.kanban_stage === stage.code);
            return <section key={stage.code} className={`w-[290px] rounded-xl border p-3 ${stage.color}`}>
              <div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="font-semibold">{stage.label}</h2><p className="text-xs text-muted-foreground">{stage.description}</p></div><Badge variant="secondary">{items.length}</Badge></div>
              <div className="space-y-2">
                {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
                {!isLoading && items.length === 0 && <p className="rounded-lg border border-dashed bg-background/60 p-3 text-center text-xs text-muted-foreground">Sem contatos</p>}
                {items.map((lead) => <button key={lead.id} className="w-full rounded-lg border bg-card p-3 text-left shadow-sm transition hover:shadow-md" onClick={() => setSelectedLead(lead)}>
                  <div className="flex justify-between gap-2"><strong className="truncate text-sm">{lead.full_name}</strong><Badge variant="outline" className="text-[10px]">{priorityLabel[lead.priority_level] || lead.priority_level}</Badge></div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{lead.phone || 'Sem telefone'}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />{lead.assigned_to ? byUserId[lead.assigned_to]?.label || 'Responsável' : 'Sem responsável'}</p>
                  {lead.next_action_at && <p className="mt-2 flex items-center gap-1 text-xs"><Clock3 className="h-3 w-3" />{format(new Date(lead.next_action_at), 'dd/MM HH:mm')}</p>}
                </button>)}
              </div>
            </section>;
          })}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label>Nome</Label><Input value={newLead.full_name} onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Telefone / WhatsApp</Label><Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} /></div>
        <div className="space-y-2"><Label>E-mail</Label><Input value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} /></div>
        <div className="space-y-2"><Label>Origem</Label><Input placeholder="WhatsApp, indicação, site..." value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} /></div>
        <div className="space-y-2"><Label>Prioridade</Label><Select value={newLead.priority_level} onValueChange={(value) => setNewLead({ ...newLead, priority_level: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>Responsável</Label><Select value={newLead.assigned_to} onValueChange={(value) => setNewLead({ ...newLead, assigned_to: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>Observações administrativas</Label><Textarea value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} /></div>
      </div><div className="flex justify-end"><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Salvar contato</Button></div></DialogContent></Dialog>

      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">{selectedLead && <>
        <DialogHeader><DialogTitle>{selectedLead.full_name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2"><Label>Etapa</Label><Select value={selectedLead.kanban_stage} onValueChange={(kanban_stage) => updateMutation.mutate({ kanban_stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{visibleStages.map((stage) => <SelectItem key={stage.code} value={stage.code}>{stage.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Responsável</Label><Select value={selectedLead.assigned_to || 'unassigned'} onValueChange={(value) => updateMutation.mutate({ assigned_to: value === 'unassigned' ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{staff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Prioridade</Label><Select value={selectedLead.priority_level} onValueChange={(priority_level) => updateMutation.mutate({ priority_level })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setInteractionOpen(true)}><MessageSquare className="mr-2 h-4 w-4" />Registrar interação</Button><Button variant="outline" onClick={() => navigate(`/clinic/appointments?leadId=${selectedLead.id}&openNew=1`)}><CalendarDays className="mr-2 h-4 w-4" />Agendar</Button>{selectedLead.patient_id ? <Button variant="outline" onClick={() => navigate(`/clinic/patients/${selectedLead.patient_id}`)}><UserCheck2 className="mr-2 h-4 w-4" />Abrir paciente</Button> : <Button variant="outline" onClick={() => convertMutation.mutate()}><UserCheck2 className="mr-2 h-4 w-4" />Converter em paciente</Button>}</div>
        <Tabs defaultValue="general"><TabsList><TabsTrigger value="general">Dados gerais</TabsTrigger><TabsTrigger value="interactions">Interações</TabsTrigger><TabsTrigger value="appointments">Agendamentos</TabsTrigger><TabsTrigger value="history">Histórico</TabsTrigger></TabsList>
          <TabsContent value="general"><Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Telefone</p><p>{selectedLead.phone || 'Não informado'}</p></div><div><p className="text-xs text-muted-foreground">E-mail</p><p>{selectedLead.email || 'Não informado'}</p></div><div><p className="text-xs text-muted-foreground">Origem</p><p>{selectedLead.source || 'Não informada'}</p></div><div><p className="text-xs text-muted-foreground">Último contato</p><p>{selectedLead.last_interaction_at ? formatDistanceToNow(new Date(selectedLead.last_interaction_at), { addSuffix: true, locale: ptBR }) : 'Sem interação'}</p></div><div className="space-y-2 sm:col-span-2"><Label>Próxima ação</Label><Input value={selectedLead.next_action || ''} onChange={(e) => setSelectedLead({ ...selectedLead, next_action: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Data do follow-up</Label><Input type="datetime-local" value={selectedLead.next_action_at ? selectedLead.next_action_at.slice(0, 16) : ''} onChange={(e) => setSelectedLead({ ...selectedLead, next_action_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div><div className="space-y-2 sm:col-span-2"><Label>Observações</Label><Textarea value={selectedLead.notes || ''} onChange={(e) => setSelectedLead({ ...selectedLead, notes: e.target.value })} /></div><div className="sm:col-span-2 flex justify-end"><Button onClick={() => updateMutation.mutate({ next_action: selectedLead.next_action, next_action_at: selectedLead.next_action_at, notes: selectedLead.notes })}>Salvar acompanhamento</Button></div></CardContent></Card></TabsContent>
          <TabsContent value="interactions" className="space-y-2">{interactions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>}{interactions.map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex justify-between gap-2"><strong>{interactionLabels[item.type] || item.type}</strong><span className="text-xs text-muted-foreground">{format(new Date(item.performed_at), 'dd/MM/yyyy HH:mm')}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.notes || 'Sem observações.'}</p></div>)}</TabsContent>
          <TabsContent value="appointments" className="space-y-2">{appointments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento vinculado.</p>}{appointments.map((appointment) => <div key={appointment.id} className="rounded-lg border p-3"><div className="flex justify-between"><strong>{format(new Date(appointment.start_time), 'dd/MM/yyyy HH:mm')}</strong><Badge variant="outline">{appointment.status}</Badge></div><p className="text-sm text-muted-foreground">{appointment.professionals?.full_name || 'Profissional não informado'}</p></div>)}</TabsContent>
          <TabsContent value="history" className="space-y-2">{stageHistory.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p>}{stageHistory.map((item) => <div key={item.id} className="flex gap-3 rounded-lg border p-3"><History className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="text-sm">{item.from_stage ? `${stageLabel(item.from_stage)} → ` : ''}<strong>{stageLabel(item.to_stage)}</strong></p><p className="text-xs text-muted-foreground">{format(new Date(item.changed_at), 'dd/MM/yyyy HH:mm')}</p></div></div>)}</TabsContent>
        </Tabs>
      </>}</DialogContent></Dialog>

      <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}><DialogContent><DialogHeader><DialogTitle>Registrar interação</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Tipo</Label><Select value={interaction.type} onValueChange={(type) => setInteraction({ ...interaction, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(interactionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Observações</Label><Textarea value={interaction.notes} onChange={(e) => setInteraction({ ...interaction, notes: e.target.value })} /></div><Button className="w-full" onClick={() => interactionMutation.mutate()} disabled={interactionMutation.isPending}>Registrar</Button></div></DialogContent></Dialog>
    </div>
  );
}
