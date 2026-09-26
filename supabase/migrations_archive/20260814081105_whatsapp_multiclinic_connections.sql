-- Multi-clinic WhatsApp Cloud API connections.
-- The Meta app, webhook and OpenAI key are platform-wide. Each clinic only
-- authorizes its own WhatsApp Business account through Embedded Signup.

CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  display_phone_number text,
  business_name text,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'attention', 'disconnected')),
  token_ciphertext text NOT NULL,
  token_expires_at timestamptz,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_phone
  ON public.whatsapp_connections (phone_number_id)
  WHERE status = 'connected';

DROP TRIGGER IF EXISTS update_whatsapp_connections_updated_at ON public.whatsapp_connections;
CREATE TRIGGER update_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views safe WhatsApp connection status" ON public.whatsapp_connections;
CREATE POLICY "Staff views safe WhatsApp connection status"
  ON public.whatsapp_connections FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

-- Connection writes happen only in the authenticated Edge Function.
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_connections FROM anon, authenticated;
REVOKE SELECT (token_ciphertext) ON public.whatsapp_connections FROM anon, authenticated;
GRANT SELECT (
  id, clinic_id, waba_id, phone_number_id, display_phone_number, business_name,
  status, token_expires_at, connected_by, connected_at, disconnected_at,
  metadata, created_at, updated_at
) ON public.whatsapp_connections TO authenticated;

COMMENT ON TABLE public.whatsapp_connections IS
  'One Meta WhatsApp Business connection per clinic. Tokens are AES-GCM encrypted by Edge Functions.';
COMMENT ON COLUMN public.whatsapp_connections.token_ciphertext IS
  'Server-only AES-GCM payload. Never return this column to the browser.';

-- Legacy status switches are no longer user-maintained. Connection readiness is
-- derived from whatsapp_connections and platform secrets.
ALTER TABLE public.whatsapp_ai_settings
  ALTER COLUMN is_enabled SET DEFAULT true;

UPDATE public.whatsapp_ai_settings SET is_enabled = true WHERE is_enabled = false;
