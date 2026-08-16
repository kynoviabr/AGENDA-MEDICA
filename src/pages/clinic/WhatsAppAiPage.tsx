import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bot, CheckCircle2, MessageCircle, RotateCcw, Search, Send, UserRound, UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type LeadSummary = {
  id: string;
  full_name: string | null;
  phone: string | null;
  kanban_stage: string | null;
  source: string | null;
};

type Conversation = {
  id: string;
  clinic_id: string;
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  status: 'open' | 'handoff' | 'closed';
  ai_enabled: boolean;
  control_mode: 'ai_active' | 'handoff_pending' | 'human_active' | 'ai_resume_pending' | 'closed';
  active_handoff_id: string | null;
  assigned_user_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
  created_at: string;
  leads?: LeadSummary | null;
};

type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  role: 'user' | 'assistant' | 'system';
  body: string;
  ai_model: string | null;
  message_origin: 'patient' | 'ai' | 'human' | 'system';
  created_at: string;
};

type Handoff = {
  id: string;
  conversation_id: string;
  reason: string;
  priority: 'normal' | 'high' | 'urgent';
  status: 'requested' | 'queued' | 'assigned' | 'accepted' | 'resolved' | 'cancelled';
  assigned_user_id: string | null;
  requested_at: string;
  summary: {
    patientIntent?: string;
    knownAdministrativeContext?: string[];
    requestedDate?: string;
    selectedSlot?: string;
    pendingAction?: string;
    lastToolOutcome?: string;
    whatAuraAlreadyTried?: string[];
  };
};

type StaffMember = { user_id: string; role: string; label: string };

const statusLabel: Record<Conversation['status'], string> = {
  open: 'Aberta',
  handoff: 'Humano',
  closed: 'Fechada',
};

const controlLabel: Record<Conversation['control_mode'], string> = {
  ai_active: 'IA ativa', handoff_pending: 'Aguardando atendimento',
  human_active: 'Atendimento humano', ai_resume_pending: 'Retorno à IA pendente', closed: 'Encerrada',
};

const reasonLabel: Record<string, string> = {
  user_requested_human: 'Paciente pediu atendimento humano', medical_out_of_scope: 'Limite administrativo da Aura',
  urgent_language: 'Prioridade de atendimento', repeated_failure: 'Falhas operacionais repetidas',
  repeated_ambiguity: 'Esclarecimentos repetidos', knowledge_conflict: 'Informações administrativas conflitantes',
  knowledge_not_found: 'Informação não confirmada', provider_unavailable: 'Serviço temporariamente indisponível',
  external_provider_write_unavailable: 'Operação externa indisponível', mutation_failure: 'Falha em operação de agenda',
  identity_unresolved: 'Identidade não confirmada', policy_required: 'Política exige atendimento humano',
  safety_fail_closed: 'Validação de segurança interrompeu a IA', staff_manual_takeover: 'Atendimento assumido pela equipe',
  other: 'Outro motivo operacional',
};

function relativeDate(value: string | null) {
  if (!value) return 'sem histórico';
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
}

export default function WhatsAppAiPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ai_active' | 'handoff_pending' | 'human_active' | 'closed'>('all');
  const [humanMessage, setHumanMessage] = useState('');
  const [transferUserId, setTransferUserId] = useState('');

  const { data: currentUser } = useQuery({
    queryKey: ['whatsapp-current-user'],
    queryFn: async () => (await supabase.auth.getUser()).data.user || null,
  });

  const { data: conversations = [], isLoading, error: conversationsError } = useQuery({
    queryKey: ['whatsapp-ai-conversations', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_ai_conversations' as unknown)
        .select('*, leads(id, full_name, phone, kanban_stage, source)')
        .eq('clinic_id', clinicId!)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Conversation[];
    },
    enabled: !!clinicId,
    retry: false,
  });

  const { data: handoffs = [] } = useQuery({
    queryKey: ['whatsapp-ai-handoffs', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_conversation_handoffs' as unknown)
        .select('id,conversation_id,reason,priority,status,assigned_user_id,requested_at,summary')
        .eq('clinic_id', clinicId!).in('status', ['requested', 'queued', 'assigned', 'accepted'])
        .order('requested_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Handoff[];
    },
    enabled: !!clinicId,
    retry: false,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['whatsapp-handoff-staff', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_ai_handoff_staff', { p_clinic_id: clinicId! });
      if (error) throw error;
      return (data || []).map((item) => ({
        ...item, label: item.user_id === currentUser?.id ? 'Você' : item.label,
      })) as StaffMember[];
    },
    enabled: !!clinicId && !!currentUser?.id,
    retry: false,
  });

  const selectedConversation = useMemo(() => {
    if (!conversations.length) return null;
    return conversations.find((conversation) => conversation.id === selectedId) || conversations[0];
  }, [conversations, selectedId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['whatsapp-ai-messages', selectedConversation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_ai_messages' as unknown)
        .select('id, direction, role, body, ai_model, message_origin, created_at')
        .eq('conversation_id', selectedConversation!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!selectedConversation?.id,
    retry: false,
  });

  const handoffAction = useMutation({
    mutationFn: async ({ action, targetUserId }: { action: 'takeover' | 'unassign' | 'return_ai' | 'resolve' | 'transfer'; targetUserId?: string }) => {
      if (!selectedConversation || !clinicId) return;
      const call = action === 'takeover' ? ['take_over_ai_conversation', { p_clinic_id: clinicId, p_conversation_id: selectedConversation.id }]
        : action === 'unassign' ? ['unassign_ai_conversation', { p_clinic_id: clinicId, p_conversation_id: selectedConversation.id }]
        : action === 'transfer' ? ['transfer_ai_conversation', { p_clinic_id: clinicId, p_conversation_id: selectedConversation.id, p_target_user_id: targetUserId }]
        : ['resolve_ai_conversation_handoff', { p_clinic_id: clinicId, p_conversation_id: selectedConversation.id, p_resolution: action === 'return_ai' ? 'returned_to_ai' : 'resolved_by_human' }];
      const { error } = await supabase.rpc(call[0] as never, call[1] as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-conversations', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-handoffs', clinicId] });
      setTransferUserId('');
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar conversa', description: error.message, variant: 'destructive' });
    },
  });

  const sendHumanMessage = useMutation({
    mutationFn: async () => {
      if (!selectedConversation || !clinicId || !humanMessage.trim()) return;
      const { data, error } = await supabase.functions.invoke('whatsapp-human-outbound', {
        body: { clinicId, conversationId: selectedConversation.id, body: humanMessage.trim() },
      });
      if (error || data?.ok !== true) throw error || new Error('Não foi possível enviar a mensagem.');
    },
    onSuccess: () => {
      setHumanMessage('');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-messages', selectedConversation?.id] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-conversations', clinicId] });
    },
    onError: (error: Error) => toast({ title: 'Falha ao enviar', description: error.message, variant: 'destructive' }),
  });

  const filteredConversations = conversations.filter((conversation) => {
    if (filter !== 'all' && conversation.control_mode !== filter) return false;
    const haystack = `${conversation.contact_name || ''} ${conversation.phone} ${conversation.leads?.full_name || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const openCount = conversations.filter((item) => item.control_mode === 'ai_active').length;
  const handoffCount = conversations.filter((item) => item.control_mode === 'handoff_pending').length;
  const humanCount = conversations.filter((item) => item.control_mode === 'human_active').length;
  const selectedHandoff = handoffs.find((item) => item.conversation_id === selectedConversation?.id) || null;
  const isOwner = selectedConversation?.assigned_user_id === currentUser?.id;

  return (
    <div className="space-y-4">
      <PageHeader title="WhatsApp IA" description="Atendimento de leads respondidos pela IA" />

      {conversationsError && (
        <Card className="shadow-card">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 w-5 h-5 text-warning" />
            <div>
              <p className="font-medium text-foreground">Inbox ainda não disponível no banco</p>
              <p className="mt-1">A migration do WhatsApp IA precisa ser aplicada no Supabase para carregar conversas e mensagens.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Conversas abertas</p>
              <p className="text-2xl font-semibold text-foreground">{openCount}</p>
            </div>
            <MessageCircle className="w-5 h-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Aguardando humano</p>
              <p className="text-2xl font-semibold text-foreground">{handoffCount}</p>
            </div>
            <UserRoundCheck className="w-5 h-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Em atendimento humano</p>
              <p className="text-2xl font-semibold text-foreground">{humanCount}</p>
            </div>
            <UserRoundCheck className="w-5 h-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <div className="grid min-h-[640px] gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="space-y-3 border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead ou telefone" className="pl-9" />
              </div>
              <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                <TabsList className="grid h-auto w-full grid-cols-5">
                  <TabsTrigger value="all">Todas</TabsTrigger>
                  <TabsTrigger value="ai_active">IA</TabsTrigger>
                  <TabsTrigger value="handoff_pending">Fila</TabsTrigger>
                  <TabsTrigger value="human_active">Humano</TabsTrigger>
                  <TabsTrigger value="closed">Fechadas</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando conversas...</p>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <Bot className="mx-auto mb-3 w-8 h-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium text-foreground">Nenhuma conversa ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Quando o webhook receber mensagens, elas aparecem aqui.</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  const active = selectedConversation?.id === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedId(conversation.id)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b p-4 text-left transition-colors hover:bg-secondary/50',
                        active && 'bg-primary/10',
                      )}
                    >
                      <div className="mt-0.5 flex w-9 h-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <UserRound className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{conversation.contact_name || conversation.leads?.full_name || conversation.phone}</p>
                          <Badge
                            variant={conversation.control_mode === 'ai_active' ? 'default' : 'secondary'}
                            className={conversation.control_mode === 'handoff_pending' && handoffs.find((item) => item.conversation_id === conversation.id)?.priority === 'urgent' ? 'bg-destructive/15 text-destructive' : ''}
                          >
                            {controlLabel[conversation.control_mode]}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{conversation.phone}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{relativeDate(conversation.last_message_at)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="flex h-full min-h-[640px] flex-col p-0">
            {!selectedConversation ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <MessageCircle className="mb-3 w-10 h-10 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">Selecione uma conversa</p>
                <p className="mt-1 text-xs text-muted-foreground">O chat completo e os controles aparecem neste painel.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">{selectedConversation.contact_name || selectedConversation.leads?.full_name || selectedConversation.phone}</h2>
                      <Badge variant={selectedConversation.control_mode === 'ai_active' ? 'default' : 'secondary'} className={selectedConversation.control_mode === 'ai_active' ? 'bg-success/15 text-success hover:bg-success/15' : ''}>
                        {controlLabel[selectedConversation.control_mode]}
                      </Badge>
                      <Badge variant="outline">{statusLabel[selectedConversation.status]}</Badge>
                      {selectedHandoff?.priority === 'urgent' && <Badge variant="destructive">Prioridade de atendimento</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedConversation.phone}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedConversation.control_mode === 'ai_active' || selectedConversation.control_mode === 'handoff_pending') && (
                    <Button variant="outline" size="sm" onClick={() => handoffAction.mutate({ action: 'takeover' })} disabled={handoffAction.isPending}>
                      <UserRoundCheck className="mr-2 w-4 h-4" />
                      Assumir atendimento
                    </Button>
                    )}
                    {selectedConversation.control_mode === 'human_active' && isOwner && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handoffAction.mutate({ action: 'unassign' })} disabled={handoffAction.isPending}>Liberar para fila</Button>
                        <Button variant="outline" size="sm" onClick={() => handoffAction.mutate({ action: 'return_ai' })} disabled={handoffAction.isPending}>
                          <RotateCcw className="mr-2 w-4 h-4" />Devolver para Aura
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handoffAction.mutate({ action: 'resolve' })} disabled={handoffAction.isPending}>
                          <CheckCircle2 className="mr-2 w-4 h-4" />Encerrar atendimento
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => navigate('/clinic/crm')}>
                      CRM
                    </Button>
                  </div>
                </div>

                {selectedHandoff && (
                  <div className="border-b bg-muted/30 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">Resumo para atendimento</p>
                      <span className="text-xs text-muted-foreground">Na fila {relativeDate(selectedHandoff.requested_at)}</span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{reasonLabel[selectedHandoff.reason] || 'Motivo operacional'}</p>
                    {!!selectedHandoff.summary?.knownAdministrativeContext?.length && (
                      <ul className="mt-2 list-inside list-disc text-muted-foreground">
                        {selectedHandoff.summary.knownAdministrativeContext.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    {selectedHandoff.summary?.requestedDate && <p className="mt-1 text-muted-foreground">Data solicitada: {selectedHandoff.summary.requestedDate}</p>}
                    {selectedHandoff.summary?.lastToolOutcome && <p className="mt-1 text-muted-foreground">Última tentativa da Aura: {selectedHandoff.summary.lastToolOutcome}</p>}
                    {selectedConversation.control_mode === 'human_active' && isOwner && staff.filter((item) => item.user_id !== currentUser?.id).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select value={transferUserId} onChange={(event) => setTransferUserId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
                          <option value="">Transferir para...</option>
                          {staff.filter((item) => item.user_id !== currentUser?.id).map((item) => <option key={item.user_id} value={item.user_id}>{item.label}</option>)}
                        </select>
                        <Button size="sm" variant="outline" disabled={!transferUserId || handoffAction.isPending} onClick={() => handoffAction.mutate({ action: 'transfer', targetUserId: transferUserId })}>Transferir</Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/20 p-4">
                  {messagesLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Bot className="mb-3 w-9 h-9 text-muted-foreground/60" />
                      <p className="text-sm font-medium text-foreground">Sem mensagens salvas</p>
                      <p className="mt-1 text-xs text-muted-foreground">A conversa foi criada, mas ainda não há histórico de chat.</p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const outbound = message.direction === 'outbound';
                      return (
                        <div key={message.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
                          <div className={cn(
                            'max-w-[78%] rounded-lg px-4 py-3 text-sm shadow-sm',
                            outbound ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground border',
                          )}>
                            <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                            <p className={cn('mt-2 text-[11px]', outbound ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                              {relativeDate(message.created_at)}
                              {message.message_origin === 'human' ? ' • Equipe' : message.message_origin === 'ai' ? ' • Aura' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedConversation.control_mode === 'human_active' && (
                  <div className="border-t p-4">
                    {isOwner ? (
                      <div className="flex items-end gap-2">
                        <Textarea value={humanMessage} onChange={(event) => setHumanMessage(event.target.value)} rows={2} maxLength={2000} placeholder="Responder como equipe da clínica" />
                        <Button size="icon" onClick={() => sendHumanMessage.mutate()} disabled={!humanMessage.trim() || sendHumanMessage.isPending} aria-label="Enviar mensagem humana">
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Esta conversa está sob responsabilidade de outro membro da equipe.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
