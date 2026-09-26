-- WhatsApp AI lead responder MVP

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handoff', 'closed')),
  ai_enabled boolean NOT NULL DEFAULT true,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, phone)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_ai_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  body text NOT NULL,
  provider_message_id text,
  provider_status text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  display_phone_number text,
  phone_number_id_last4 text,
  openai_model text NOT NULL DEFAULT 'gpt-5.6-luna',
  welcome_message text,
  handoff_message text NOT NULL DEFAULT 'Vou chamar uma pessoa da equipe para te ajudar melhor.',
  default_goal text NOT NULL DEFAULT 'Conduzir leads para uma avaliacao humana.',
  webhook_verify_token_configured boolean NOT NULL DEFAULT false,
  meta_app_secret_configured boolean NOT NULL DEFAULT false,
  openai_key_configured boolean NOT NULL DEFAULT false,
  meta_token_configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_conversations_clinic
  ON public.whatsapp_ai_conversations (clinic_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_conversations_lead
  ON public.whatsapp_ai_conversations (lead_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_messages_conversation
  ON public.whatsapp_ai_messages (conversation_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_ai_messages_provider_inbound
  ON public.whatsapp_ai_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND direction = 'inbound';

DROP TRIGGER IF EXISTS update_whatsapp_ai_conversations_updated_at ON public.whatsapp_ai_conversations;
CREATE TRIGGER update_whatsapp_ai_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_ai_settings_updated_at ON public.whatsapp_ai_settings;
CREATE TRIGGER update_whatsapp_ai_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views whatsapp ai conversations" ON public.whatsapp_ai_conversations;
CREATE POLICY "Staff views whatsapp ai conversations"
  ON public.whatsapp_ai_conversations FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff updates whatsapp ai conversations" ON public.whatsapp_ai_conversations;
CREATE POLICY "Staff updates whatsapp ai conversations"
  ON public.whatsapp_ai_conversations FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views whatsapp ai messages" ON public.whatsapp_ai_messages;
CREATE POLICY "Staff views whatsapp ai messages"
  ON public.whatsapp_ai_messages FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views whatsapp ai settings" ON public.whatsapp_ai_settings;
CREATE POLICY "Staff views whatsapp ai settings"
  ON public.whatsapp_ai_settings FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff creates whatsapp ai settings" ON public.whatsapp_ai_settings;
CREATE POLICY "Staff creates whatsapp ai settings"
  ON public.whatsapp_ai_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff updates whatsapp ai settings" ON public.whatsapp_ai_settings;
CREATE POLICY "Staff updates whatsapp ai settings"
  ON public.whatsapp_ai_settings FOR UPDATE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT clinic_id, id, 'whatsapp_ai.view', true
FROM public.access_groups
WHERE is_system = true
  AND code IN ('admin', 'gestor', 'comercial', 'recepcao')
ON CONFLICT (group_id, permission_key) DO NOTHING;
