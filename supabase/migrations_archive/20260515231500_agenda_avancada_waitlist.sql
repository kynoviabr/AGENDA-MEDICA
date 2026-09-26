-- Agenda Avançada Clinova - Feature 1 (Lista de Espera)
-- Segurança: tudo com IF NOT EXISTS / checagem prévia para evitar duplicidades.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_priority') THEN
    CREATE TYPE public.waitlist_priority AS ENUM ('normal', 'high', 'urgent');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE public.waitlist_status AS ENUM (
      'waiting',
      'match_found',
      'contact_attempted',
      'scheduled',
      'expired',
      'cancelled_by_patient',
      'cancelled_by_clinic'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_contact_preference') THEN
    CREATE TYPE public.waitlist_contact_preference AS ENUM ('whatsapp', 'phone', 'email');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_window_type') THEN
    CREATE TYPE public.waitlist_window_type AS ENUM ('this_week', 'next_week', 'this_month', 'custom');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  preferred_professional_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  window_type public.waitlist_window_type NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  preferred_periods text[] NOT NULL DEFAULT ARRAY['morning','afternoon','evening'],
  min_duration_minutes integer NOT NULL DEFAULT 60 CHECK (min_duration_minutes > 0),
  priority public.waitlist_priority NOT NULL DEFAULT 'normal',
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  contact_preference public.waitlist_contact_preference NOT NULL DEFAULT 'whatsapp',
  contact_phone text,
  notes text,
  resulting_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  last_checked_at timestamptz,
  match_found_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_patient_or_lead_required CHECK (patient_id IS NOT NULL OR lead_id IS NOT NULL),
  CONSTRAINT waitlist_window_valid CHECK (window_end >= window_start)
);

CREATE TABLE IF NOT EXISTS public.waitlist_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  waitlist_id uuid NOT NULL REFERENCES public.appointment_waitlist(id) ON DELETE CASCADE,
  matched_slot_start timestamptz NOT NULL,
  matched_slot_end timestamptz NOT NULL,
  matched_professional_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_sent_at timestamptz NOT NULL DEFAULT now(),
  action_taken text NOT NULL DEFAULT 'none',
  action_taken_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_taken_at timestamptz,
  resulting_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_notification_slot_valid CHECK (matched_slot_end > matched_slot_start)
);

CREATE TABLE IF NOT EXISTS public.waitlist_agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  entries_checked integer NOT NULL DEFAULT 0,
  matches_found integer NOT NULL DEFAULT 0,
  notifications_sent integer NOT NULL DEFAULT 0,
  errors jsonb,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_clinic_status ON public.appointment_waitlist (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_window ON public.appointment_waitlist (window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_waitlist_professional ON public.appointment_waitlist (preferred_professional_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_priority_created ON public.appointment_waitlist (priority, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_waitlist ON public.waitlist_notifications (waitlist_id, notification_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_logs_clinic_started ON public.waitlist_agent_logs (clinic_id, started_at DESC);

DROP TRIGGER IF EXISTS update_appointment_waitlist_updated_at ON public.appointment_waitlist;
CREATE TRIGGER update_appointment_waitlist_updated_at
BEFORE UPDATE ON public.appointment_waitlist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_agent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic staff can manage appointment_waitlist" ON public.appointment_waitlist;
CREATE POLICY "clinic staff can manage appointment_waitlist"
ON public.appointment_waitlist
FOR ALL
USING (public.is_clinic_staff(auth.uid(), clinic_id))
WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "clinic staff can manage waitlist_notifications" ON public.waitlist_notifications;
CREATE POLICY "clinic staff can manage waitlist_notifications"
ON public.waitlist_notifications
FOR ALL
USING (public.is_clinic_staff(auth.uid(), clinic_id))
WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "clinic staff can view waitlist_agent_logs" ON public.waitlist_agent_logs;
CREATE POLICY "clinic staff can view waitlist_agent_logs"
ON public.waitlist_agent_logs
FOR SELECT
USING (public.is_clinic_staff(auth.uid(), clinic_id));
