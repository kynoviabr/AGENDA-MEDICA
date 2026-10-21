import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bot, CheckCircle, Link2, MessageSquare, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import AdministrativeKnowledgeSettings from './AdministrativeKnowledgeSettings';

type WhatsAppAiSettings = {
  clinic_id: string;
  openai_model: string;
  assistant_name: string;
  assistant_personality: string | null;
  handoff_message: string;
  default_goal: string;
  ai_engine_mode: 'legacy' | 'shadow' | 'active';
  ai_handoff_enabled: boolean;
  ai_handoff_validated_at: string | null;
};

type WhatsAppConnection = {
  display_phone_number: string | null;
  business_name: string | null;
  status: 'connected' | 'attention' | 'disconnected';
  connected_at: string;
};

type EmbeddedSignupData = { phoneNumberId: string; wabaId: string };
type ReadinessIssue = { code: string; message: string; check: string };
type PilotHealthResponse = {
  ok: boolean;
  environment: 'local' | 'staging' | 'production' | 'unknown';
  readiness: { ready: boolean; stage: string; blockers: ReadinessIssue[]; warnings: ReadinessIssue[]; health: { state: string } };
  metrics: null | { conversations?: number; aiResponses?: number; handoffs?: number; toolFailures?: number; outboundFailures?: number };
};

const readinessLabels: Record<string, string> = {
  APP_ENV_MISSING: 'O ambiente APP_ENV ainda não foi identificado.',
  PILOT_ENVIRONMENT_LOCAL: 'Ambiente local não pode ser aprovado como piloto real.',
  GLOBAL_SWITCH_NOT_CONFIGURED: 'O kill switch global ainda não foi configurado explicitamente.',
  DATABASE_UNAVAILABLE: 'O banco não respondeu ao health check.',
  GLOBAL_AI_DISABLED: 'O kill switch global da Aura está acionado.',
  WHATSAPP_NOT_CONFIGURED: 'O WhatsApp da clínica não está conectado.',
  OPENAI_NOT_CONFIGURED: 'A credencial backend da OpenAI não está configurada.',
  CLINIC_CATALOG: 'Cadastre unidade, profissional e serviço ativos.',
  SCHEDULING_NOT_CONFIGURED: 'Configure as regras de agenda dos profissionais.',
  NO_AUTHORIZED_STAFF: 'Não há equipe autorizada para assumir handoffs.',
  CLINIC_AI_DISABLED: 'A IA da clínica está desligada.',
  NO_ACTIVE_INSURANCE: 'Nenhum convênio ativo foi cadastrado.',
  LOW_KNOWLEDGE_COVERAGE: 'A base administrativa ainda não possui conteúdo publicado.',
  HANDOFF_AUTOMATION_DISABLED: 'O handoff automático ainda não foi homologado.',
};

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const metaAppId = import.meta.env.VITE_META_APP_ID as string | undefined;
const metaConfigId = import.meta.env.VITE_META_CONFIG_ID as string | undefined;

const defaultSettings = (clinicId: string): WhatsAppAiSettings => ({
  clinic_id: clinicId,
  openai_model: 'gpt-5.6-luna',
  assistant_name: 'Aura',
  assistant_personality: null,
  handoff_message: 'Vou chamar uma pessoa da equipe para te ajudar melhor.',
  default_goal: 'Conduzir leads para uma avaliação humana.',
  ai_engine_mode: 'legacy',
  ai_handoff_enabled: false,
  ai_handoff_validated_at: null,
});

async function loadMetaSdk() {
  if (window.FB) return;
  await new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: metaAppId, autoLogAppEvents: true, xfbml: true, version: 'v23.0' });
      resolve();
    };
    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Não foi possível carregar a conexão da Meta.'));
    document.body.appendChild(script);
  });
}

export default function WhatsAppAiSettingsTab() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WhatsAppAiSettings | null>(null);
  const canManage = role === 'admin';

  const settingsQuery = useQuery({
    queryKey: ['whatsapp-ai-settings', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_ai_settings' as never)
        .select('clinic_id, openai_model, assistant_name, assistant_personality, handoff_message, default_goal, ai_engine_mode, ai_handoff_enabled, ai_handoff_validated_at').eq('clinic_id', clinicId!).maybeSingle();
      if (error) throw error;
      return (data as WhatsAppAiSettings | null) || defaultSettings(clinicId!);
    },
    enabled: !!clinicId,
    retry: false,
  });

  const connectionQuery = useQuery({
    queryKey: ['whatsapp-connection', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_connections' as never)
        .select('display_phone_number, business_name, status, connected_at').eq('clinic_id', clinicId!).maybeSingle();
      if (error) throw error;
      return data as WhatsAppConnection | null;
    },
    enabled: !!clinicId,
    retry: false,
  });

  const readinessQuery = useQuery({
    queryKey: ['aura-pilot-readiness', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('aura-operational-health', { body: { clinicId, range: 'today' } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'readiness_unavailable');
      return data as PilotHealthResponse;
    },
    enabled: !!clinicId,
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !form) return;
      const { error } = await supabase.from('whatsapp_ai_settings' as never).upsert({
        clinic_id: clinicId,
        is_enabled: true,
        openai_model: form.openai_model,
        assistant_name: (form.assistant_name || '').trim() || 'Aura',
        assistant_personality: form.assistant_personality?.trim() || null,
        handoff_message: form.handoff_message,
        default_goal: form.default_goal,
      } as never, { onConflict: 'clinic_id' });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: 'Preferências da assistente salvas' }),
    onError: (error: Error) => toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !metaAppId || !metaConfigId) throw new Error('A plataforma ainda não liberou a conexão com a Meta.');
      await loadMetaSdk();
      const signupData = new Promise<EmbeddedSignupData>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('A Meta não retornou os dados do número.')), 120000);
        const listener = (event: MessageEvent) => {
          if (!event.origin.endsWith('facebook.com')) return;
          let data = event.data;
          try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
          if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
          const phoneNumberId = data?.data?.phone_number_id;
          const wabaId = data?.data?.waba_id;
          if (data?.event === 'FINISH' && phoneNumberId && wabaId) {
            window.clearTimeout(timeout);
            window.removeEventListener('message', listener);
            resolve({ phoneNumberId, wabaId });
          }
        };
        window.addEventListener('message', listener);
      });
      const code = await new Promise<string>((resolve, reject) => {
        window.FB?.login((response) => {
          const value = response.authResponse?.code;
          if (value) resolve(value); else reject(new Error('Conexão cancelada ou não autorizada.'));
        }, { config_id: metaConfigId, response_type: 'code', override_default_response_type: true, extras: { setup: {} } });
      });
      const data = await signupData;
      const { data: result, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'connect', clinicId, code, ...data },
      });
      if (error) throw error;
      if (!result?.ok) throw new Error(result?.error || 'Falha ao conectar WhatsApp.');
    },
    onSuccess: () => {
      toast({ title: 'WhatsApp conectado com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connection', clinicId] });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível conectar', description: error.message, variant: 'destructive' }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-connect', { body: { action: 'disconnect', clinicId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao desconectar.');
    },
    onSuccess: () => {
      toast({ title: 'WhatsApp desconectado' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connection', clinicId] });
    },
  });

  if (settingsQuery.error || connectionQuery.error) {
    return <Card><CardContent className="flex gap-3 p-6 text-sm"><AlertTriangle className="h-5 w-5 text-warning" />A estrutura do WhatsApp IA ainda precisa ser publicada no Supabase.</CardContent></Card>;
  }
  if (settingsQuery.isLoading || connectionQuery.isLoading || !form) {
    return <Card><CardContent className="p-8 text-sm text-muted-foreground">Carregando WhatsApp IA...</CardContent></Card>;
  }

  const connection = connectionQuery.data;
  const connected = connection?.status === 'connected';

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Status de prontidão da Aura</CardTitle>
            <Button variant="outline" size="sm" onClick={() => readinessQuery.refetch()} disabled={readinessQuery.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${readinessQuery.isFetching ? 'animate-spin' : ''}`} />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {readinessQuery.isLoading && <p className="text-sm text-muted-foreground">Verificando ambiente e configuração...</p>}
          {readinessQuery.error && <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-warning" />Health operacional ainda não publicado ou indisponível.</div>}
          {readinessQuery.data && <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={readinessQuery.data.readiness.ready ? 'default' : 'destructive'}>{readinessQuery.data.readiness.ready ? 'Pronta para o estágio atual' : 'Não pronta'}</Badge>
              <Badge variant="outline">Ambiente: {readinessQuery.data.environment}</Badge>
              <Badge variant="outline">Estágio: {readinessQuery.data.readiness.stage}</Badge>
            </div>
            {readinessQuery.data.metrics && <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              {[
                ['Conversas hoje', readinessQuery.data.metrics.conversations || 0],
                ['Respostas IA', readinessQuery.data.metrics.aiResponses || 0],
                ['Handoffs', readinessQuery.data.metrics.handoffs || 0],
                ['Falhas de tools', readinessQuery.data.metrics.toolFailures || 0],
                ['Falhas outbound', readinessQuery.data.metrics.outboundFailures || 0],
              ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></div>)}
            </div>}
            {!!readinessQuery.data.readiness.blockers.length && <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Bloqueadores</p>
              {readinessQuery.data.readiness.blockers.map((item) => <p key={item.code}>• {readinessLabels[item.code] || item.code}</p>)}
            </div>}
            {!!readinessQuery.data.readiness.warnings.length && <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Avisos</p>
              {readinessQuery.data.readiness.warnings.map((item) => <p key={item.code}>• {readinessLabels[item.code] || item.code}</p>)}
            </div>}
          </>}
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />WhatsApp com IA</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              {connected ? <CheckCircle className="mt-0.5 h-5 w-5 text-success" /> : <Link2 className="mt-0.5 h-5 w-5 text-primary" />}
              <div>
                <p className="font-medium">{connected ? connection.business_name || 'WhatsApp conectado' : 'Conecte o WhatsApp da clínica'}</p>
                <p className="text-sm text-muted-foreground">{connected ? `${connection.display_phone_number || 'Número autorizado'} · IA ativa` : 'Entre com a conta Meta e escolha o número. Nenhuma chave técnica será solicitada.'}</p>
              </div>
            </div>
            {connected ? (
              <div className="flex items-center gap-2"><Badge className="bg-success/15 text-success hover:bg-success/15">Ativo</Badge>{canManage && <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>}</div>
            ) : (
              <Button className="gradient-primary text-primary-foreground" onClick={() => connectMutation.mutate()} disabled={!canManage || connectMutation.isPending}><Link2 className="mr-2 h-4 w-4" />{connectMutation.isPending ? 'Conectando...' : 'Conectar WhatsApp'}</Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Nome da assistente</Label><Input value={form.assistant_name || ''} maxLength={40} onChange={(event) => setForm({ ...form, assistant_name: event.target.value })} placeholder="Aura" disabled={!canManage} /><p className="text-xs text-muted-foreground">É como ela se apresenta aos pacientes. Se perguntarem, ela informa que é uma assistente virtual com IA.</p></div>
            <div className="space-y-2"><Label>Jeito de falar</Label><Textarea value={form.assistant_personality || ''} maxLength={500} onChange={(event) => setForm({ ...form, assistant_personality: event.target.value })} rows={3} placeholder="Ex.: simpática e próxima, trata o paciente por você, usa emoji com moderação." disabled={!canManage} /></div>
            <div className="space-y-2"><Label>Objetivo da assistente</Label><Textarea value={form.default_goal} onChange={(event) => setForm({ ...form, default_goal: event.target.value })} rows={4} disabled={!canManage} /></div>
            <div className="space-y-2"><Label>Mensagem para atendimento humano</Label><Textarea value={form.handoff_message} onChange={(event) => setForm({ ...form, handoff_message: event.target.value })} rows={4} disabled={!canManage} /></div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /><p>App Meta, webhook e inteligência artificial são administrados pela plataforma. Cada clínica apenas autoriza o próprio número, e os tokens ficam criptografados no servidor.</p></div>
          <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-foreground">Transferência operacional para equipe</p>
              <p className="text-muted-foreground">A fila automática só é liberada após homologação da clínica. Takeover manual continua disponível para usuários autorizados.</p>
            </div>
            <Badge variant={form.ai_handoff_enabled && form.ai_handoff_validated_at && form.ai_engine_mode === 'active' ? 'default' : 'secondary'}>
              {form.ai_handoff_enabled && form.ai_handoff_validated_at && form.ai_engine_mode === 'active' ? 'Automação homologada' : 'Automação não habilitada'}
            </Badge>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={!canManage || saveMutation.isPending}><Bot className="mr-2 h-4 w-4" />{saveMutation.isPending ? 'Salvando...' : 'Salvar comportamento da IA'}</Button>
        </CardContent>
      </Card>
      <AdministrativeKnowledgeSettings />
    </div>
  );
}
