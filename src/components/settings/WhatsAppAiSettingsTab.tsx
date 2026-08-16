import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle, Link2, MessageSquare, ShieldCheck, Unplug } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import AdministrativeKnowledgeSettings from './AdministrativeKnowledgeSettings';

type WhatsAppAiSettings = {
  clinic_id: string;
  openai_model: string;
  handoff_message: string;
  default_goal: string;
};

type WhatsAppConnection = {
  display_phone_number: string | null;
  business_name: string | null;
  status: 'connected' | 'attention' | 'disconnected';
  connected_at: string;
};

type EmbeddedSignupData = { phoneNumberId: string; wabaId: string };

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
  handoff_message: 'Vou chamar uma pessoa da equipe para te ajudar melhor.',
  default_goal: 'Conduzir leads para uma avaliação humana.',
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
        .select('clinic_id, openai_model, handoff_message, default_goal').eq('clinic_id', clinicId!).maybeSingle();
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
            <div className="space-y-2"><Label>Objetivo da assistente</Label><Textarea value={form.default_goal} onChange={(event) => setForm({ ...form, default_goal: event.target.value })} rows={4} disabled={!canManage} /></div>
            <div className="space-y-2"><Label>Mensagem para atendimento humano</Label><Textarea value={form.handoff_message} onChange={(event) => setForm({ ...form, handoff_message: event.target.value })} rows={4} disabled={!canManage} /></div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /><p>App Meta, webhook e inteligência artificial são administrados pela plataforma. Cada clínica apenas autoriza o próprio número, e os tokens ficam criptografados no servidor.</p></div>
          <Button onClick={() => saveMutation.mutate()} disabled={!canManage || saveMutation.isPending}><Bot className="mr-2 h-4 w-4" />{saveMutation.isPending ? 'Salvando...' : 'Salvar comportamento da IA'}</Button>
        </CardContent>
      </Card>
      <AdministrativeKnowledgeSettings />
    </div>
  );
}
