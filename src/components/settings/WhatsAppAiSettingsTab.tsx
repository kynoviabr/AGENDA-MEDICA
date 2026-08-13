import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle, Copy, KeyRound, MessageSquare, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

type WhatsAppAiSettings = {
  id?: string;
  clinic_id: string;
  is_enabled: boolean;
  display_phone_number: string | null;
  phone_number_id_last4: string | null;
  openai_model: string;
  welcome_message: string | null;
  handoff_message: string;
  default_goal: string;
  webhook_verify_token_configured: boolean;
  meta_app_secret_configured: boolean;
  openai_key_configured: boolean;
  meta_token_configured: boolean;
};

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'qpqknsvbhfljhndloyda';
const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/whatsapp-ai-agent`;

const defaultSettings = (clinicId: string): WhatsAppAiSettings => ({
  clinic_id: clinicId,
  is_enabled: false,
  display_phone_number: '',
  phone_number_id_last4: '',
  openai_model: 'gpt-5.6-luna',
  welcome_message: '',
  handoff_message: 'Vou chamar uma pessoa da equipe para te ajudar melhor.',
  default_goal: 'Conduzir leads para uma avaliação humana.',
  webhook_verify_token_configured: false,
  meta_app_secret_configured: false,
  openai_key_configured: false,
  meta_token_configured: false,
});

export default function WhatsAppAiSettingsTab() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WhatsAppAiSettings | null>(null);
  const canManage = role === 'admin';

  const { data: settings, isLoading, error: settingsError } = useQuery({
    queryKey: ['whatsapp-ai-settings', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_ai_settings' as unknown)
        .select('*')
        .eq('clinic_id', clinicId!)
        .maybeSingle();
      if (error) throw error;
      return (data as WhatsAppAiSettings | null) || defaultSettings(clinicId!);
    },
    enabled: !!clinicId,
    retry: false,
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !form) return;
      const payload = {
        clinic_id: clinicId,
        is_enabled: form.is_enabled,
        display_phone_number: form.display_phone_number || null,
        phone_number_id_last4: form.phone_number_id_last4 || null,
        openai_model: form.openai_model || 'gpt-5.6-luna',
        welcome_message: form.welcome_message || null,
        handoff_message: form.handoff_message || defaultSettings(clinicId).handoff_message,
        default_goal: form.default_goal || defaultSettings(clinicId).default_goal,
        webhook_verify_token_configured: form.webhook_verify_token_configured,
        meta_app_secret_configured: form.meta_app_secret_configured,
        openai_key_configured: form.openai_key_configured,
        meta_token_configured: form.meta_token_configured,
      };
      const { error } = await supabase
        .from('whatsapp_ai_settings' as unknown)
        .upsert(payload as unknown, { onConflict: 'clinic_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Configuração do WhatsApp IA salva' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-ai-settings', clinicId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const updateField = <K extends keyof WhatsAppAiSettings>(key: K, value: WhatsAppAiSettings[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast({ title: 'URL copiada' });
  };

  if (settingsError) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 w-5 h-5 text-warning" />
          <div>
            <p className="font-medium text-foreground">Configuração ainda não disponível no banco</p>
            <p className="mt-1">A migration do WhatsApp IA precisa ser aplicada no Supabase antes desta aba salvar preferências.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !form) {
    return <Card className="shadow-card"><CardContent className="p-8 text-sm text-muted-foreground">Carregando configuração...</CardContent></Card>;
  }

  const readiness = [
    { label: 'Token Meta', ok: form.meta_token_configured },
    { label: 'Phone Number ID', ok: !!form.phone_number_id_last4 },
    { label: 'OpenAI Key', ok: form.openai_key_configured },
    { label: 'Webhook Verify Token', ok: form.webhook_verify_token_configured },
    { label: 'App Secret', ok: form.meta_app_secret_configured },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            WhatsApp IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Responder leads automaticamente</p>
              <p className="text-xs text-muted-foreground">Quando desligado, as mensagens podem ser registradas sem resposta da IA.</p>
            </div>
            <Switch checked={form.is_enabled} onCheckedChange={(checked) => updateField('is_enabled', checked)} disabled={!canManage} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Número conectado</Label>
              <Input value={form.display_phone_number || ''} onChange={(event) => updateField('display_phone_number', event.target.value)} placeholder="+55 11 99999-9999" disabled={!canManage} />
            </div>
            <div className="space-y-2">
              <Label>Final do Phone Number ID</Label>
              <Input value={form.phone_number_id_last4 || ''} onChange={(event) => updateField('phone_number_id_last4', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" disabled={!canManage} />
            </div>
            <div className="space-y-2">
              <Label>Modelo OpenAI</Label>
              <Input value={form.openai_model} onChange={(event) => updateField('openai_model', event.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-2">
              <Label>Callback URL Meta</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyWebhook} aria-label="Copiar URL">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Objetivo da IA</Label>
              <Textarea value={form.default_goal} onChange={(event) => updateField('default_goal', event.target.value)} rows={4} disabled={!canManage} />
            </div>
            <div className="space-y-2">
              <Label>Mensagem de atendimento humano</Label>
              <Textarea value={form.handoff_message} onChange={(event) => updateField('handoff_message', event.target.value)} rows={4} disabled={!canManage} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {readiness.map((item) => (
              <div key={item.label} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {item.ok ? <CheckCircle className="w-4 h-4 text-success" /> : <KeyRound className="w-4 h-4 text-warning" />}
                  {item.label}
                </div>
                <Badge variant={item.ok ? 'default' : 'secondary'} className={item.ok ? 'bg-success/15 text-success hover:bg-success/15' : ''}>
                  {item.ok ? 'Marcado' : 'Pendente'}
                </Badge>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              Token Meta configurado
              <Switch checked={form.meta_token_configured} onCheckedChange={(checked) => updateField('meta_token_configured', checked)} disabled={!canManage} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              OpenAI Key configurada
              <Switch checked={form.openai_key_configured} onCheckedChange={(checked) => updateField('openai_key_configured', checked)} disabled={!canManage} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              Verify Token configurado
              <Switch checked={form.webhook_verify_token_configured} onCheckedChange={(checked) => updateField('webhook_verify_token_configured', checked)} disabled={!canManage} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              App Secret configurado
              <Switch checked={form.meta_app_secret_configured} onCheckedChange={(checked) => updateField('meta_app_secret_configured', checked)} disabled={!canManage} />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 w-4 h-4 text-warning" />
              <p>Tokens e chaves reais ficam em Supabase Secrets. Esta tela guarda apenas status operacional e preferências da IA.</p>
            </div>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={!canManage || saveMutation.isPending} className="gradient-primary text-primary-foreground">
            <Bot className="mr-2 w-4 h-4" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar WhatsApp IA'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
