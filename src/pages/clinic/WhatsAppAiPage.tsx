import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bot, MessageCircle, PauseCircle, PlayCircle, Search, UserRound, UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  created_at: string;
};

const statusLabel: Record<Conversation['status'], string> = {
  open: 'Aberta',
  handoff: 'Humano',
  closed: 'Fechada',
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
  const [filter, setFilter] = useState<'all' | 'open' | 'handoff' | 'closed'>('all');

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

  const selectedConversation = useMemo(() => {
    if (!conversations.length) return null;
    return conversations.find((conversation) => conversation.id === selectedId) || conversations[0];
  }, [conversations, selectedId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['whatsapp-ai-messages', selectedConversation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_ai_messages' as unknown)
        .select('id, direction, role, body, ai_model, created_at')
        .eq('conversation_id', selectedConversation!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!selectedConversation?.id,
    retry: false,
  });

  const updateConversation = useMutation({
    mutationFn: async (patch: Partial<Pick<Conversation, 'status' | 'ai_enabled'>>) => {
      if (!selectedConversation) return;
      const { error } = await supabase
        .from('whatsapp_ai_conversations' as unknown)
        .update(patch as unknown)
        .eq('id', selectedConversation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-conversations', clinicId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar conversa', description: error.message, variant: 'destructive' });
    },
  });

  const filteredConversations = conversations.filter((conversation) => {
    if (filter !== 'all' && conversation.status !== filter) return false;
    const haystack = `${conversation.contact_name || ''} ${conversation.phone} ${conversation.leads?.full_name || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const openCount = conversations.filter((item) => item.status === 'open').length;
  const handoffCount = conversations.filter((item) => item.status === 'handoff').length;
  const aiPausedCount = conversations.filter((item) => !item.ai_enabled).length;

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
              <p className="text-xs text-muted-foreground">Humano assumiu</p>
              <p className="text-2xl font-semibold text-foreground">{handoffCount}</p>
            </div>
            <UserRoundCheck className="w-5 h-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">IA pausada</p>
              <p className="text-2xl font-semibold text-foreground">{aiPausedCount}</p>
            </div>
            <PauseCircle className="w-5 h-5 text-primary" />
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
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="all">Todas</TabsTrigger>
                  <TabsTrigger value="open">Abertas</TabsTrigger>
                  <TabsTrigger value="handoff">Humano</TabsTrigger>
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
                          <Badge variant={conversation.status === 'open' ? 'default' : 'secondary'}>{statusLabel[conversation.status]}</Badge>
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
                      <Badge variant={selectedConversation.ai_enabled ? 'default' : 'secondary'} className={selectedConversation.ai_enabled ? 'bg-success/15 text-success hover:bg-success/15' : ''}>
                        {selectedConversation.ai_enabled ? 'IA ativa' : 'IA pausada'}
                      </Badge>
                      <Badge variant="outline">{statusLabel[selectedConversation.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedConversation.phone}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateConversation.mutate({ ai_enabled: !selectedConversation.ai_enabled })}>
                      {selectedConversation.ai_enabled ? <PauseCircle className="mr-2 w-4 h-4" /> : <PlayCircle className="mr-2 w-4 h-4" />}
                      {selectedConversation.ai_enabled ? 'Pausar IA' : 'Ativar IA'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateConversation.mutate({ status: selectedConversation.status === 'handoff' ? 'open' : 'handoff', ai_enabled: selectedConversation.status === 'handoff' })}>
                      <UserRoundCheck className="mr-2 w-4 h-4" />
                      {selectedConversation.status === 'handoff' ? 'Liberar IA' : 'Assumir'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/clinic/crm')}>
                      CRM
                    </Button>
                  </div>
                </div>

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
                              {message.ai_model ? ` • ${message.ai_model}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
