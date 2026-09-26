-- Agenda Avançada Clinova - Features 2, 3 e 4 (fundações WhatsApp)
-- Cria estruturas de lembrete/confirmação/cancelamento com segurança idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_channel') THEN
    CREATE TYPE public.reminder_channel AS ENUM ('whatsapp', 'email', 'sms');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_status') THEN
    CREATE TYPE public.reminder_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_command_status') THEN
    CREATE TYPE public.whatsapp_command_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel public.reminder_channel NOT NULL DEFAULT 'whatsapp',
  scheduled_for timestamptz NOT NULL,
  status public.reminder_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointment_whatsapp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status public.whatsapp_command_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_command text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_command_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  token_id uuid REFERENCES public.appointment_whatsapp_tokens(id) ON DELETE SET NULL,
  source_phone text,
  incoming_text text,
  parsed_command text,
  result_status text NOT NULL DEFAULT 'ignored',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_clinic_status ON public.appointment_reminders (clinic_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment ON public.appointment_reminders (appointment_id, channel);
CREATE INDEX IF NOT EXISTS idx_whatsapp_tokens_status_expiry ON public.appointment_whatsapp_tokens (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_clinic_created ON public.whatsapp_command_logs (clinic_id, created_at DESC);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_whatsapp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_command_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic staff can manage appointment_reminders" ON public.appointment_reminders;
CREATE POLICY "clinic staff can manage appointment_reminders"
ON public.appointment_reminders
FOR ALL
USING (public.is_clinic_staff(auth.uid(), clinic_id))
WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "clinic staff can manage appointment_whatsapp_tokens" ON public.appointment_whatsapp_tokens;
CREATE POLICY "clinic staff can manage appointment_whatsapp_tokens"
ON public.appointment_whatsapp_tokens
FOR ALL
USING (public.is_clinic_staff(auth.uid(), clinic_id))
WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "clinic staff can view whatsapp_command_logs" ON public.whatsapp_command_logs;
CREATE POLICY "clinic staff can view whatsapp_command_logs"
ON public.whatsapp_command_logs
FOR SELECT
USING (public.is_clinic_staff(auth.uid(), clinic_id));
