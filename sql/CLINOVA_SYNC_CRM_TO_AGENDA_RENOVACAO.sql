-- CLINOVA SYNC PACK
-- Escopo: CRM Kanban + Agenda Inteligente + Renovacao Automatizada
-- Gerado automaticamente em 2026-05-16



-- =====================================================================
-- [1/7] 20260429120000_crm_kanban_agenda.sql
-- =====================================================================

-- CRM Kanban + Agenda foundation

ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'rescheduled';

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  cpf text,
  birth_date date,
  email text,
  kanban_stage text NOT NULL DEFAULT 'new_lead',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  treatments_of_interest text[] DEFAULT '{}',
  notes text,
  lost_reason text,
  lost_reason_notes text,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  credit_consent boolean NOT NULL DEFAULT false,
  credit_consent_at timestamptz,
  last_credit_risk_level text DEFAULT 'unknown',
  last_boleto_eligible boolean,
  last_recommended_payment text,
  last_credit_check_at timestamptz,
  last_interaction_at timestamptz,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_leads_clinic_stage ON public.leads(clinic_id, kanban_stage);
CREATE INDEX IF NOT EXISTS idx_leads_clinic_phone ON public.leads(clinic_id, phone);
CREATE INDEX IF NOT EXISTS idx_leads_clinic_cpf ON public.leads(clinic_id, cpf);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);

CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  notes text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead ON public.lead_interactions(lead_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON public.lead_stage_history(lead_id, changed_at DESC);

ALTER TABLE public.appointments
  ALTER COLUMN patient_id DROP NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type text NOT NULL DEFAULT 'treatment_session',
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_item_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS no_show_reason text,
  ADD COLUMN IF NOT EXISTS rescheduled_from uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_to uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_check_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_check_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS credit_decision_id uuid,
  ADD COLUMN IF NOT EXISTS is_batch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_id uuid;

UPDATE public.appointments
SET scheduled_at = COALESCE(scheduled_at, start_time),
    duration_minutes = GREATEST(15, EXTRACT(EPOCH FROM (end_time - start_time))::integer / 60),
    appointment_type = COALESCE(appointment_type, 'treatment_session')
WHERE scheduled_at IS NULL
   OR duration_minutes IS NULL
   OR appointment_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_lead ON public.appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_type ON public.appointments(clinic_id, appointment_type);

CREATE TABLE IF NOT EXISTS public.professional_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointment_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views leads" ON public.leads;
CREATE POLICY "Staff views leads"
  ON public.leads FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff creates leads" ON public.leads;
CREATE POLICY "Staff creates leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff updates leads" ON public.leads;
CREATE POLICY "Staff updates leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin soft deletes leads" ON public.leads;
CREATE POLICY "Admin soft deletes leads"
  ON public.leads FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff views lead interactions" ON public.lead_interactions;
CREATE POLICY "Staff views lead interactions"
  ON public.lead_interactions FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff creates lead interactions" ON public.lead_interactions;
CREATE POLICY "Staff creates lead interactions"
  ON public.lead_interactions FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views lead stage history" ON public.lead_stage_history;
CREATE POLICY "Staff views lead stage history"
  ON public.lead_stage_history FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff creates lead stage history" ON public.lead_stage_history;
CREATE POLICY "Staff creates lead stage history"
  ON public.lead_stage_history FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views professional availability" ON public.professional_availability;
CREATE POLICY "Staff views professional availability"
  ON public.professional_availability FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin manages professional availability" ON public.professional_availability;
CREATE POLICY "Admin manages professional availability"
  ON public.professional_availability FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff views appointment blocks" ON public.appointment_blocks;
CREATE POLICY "Staff views appointment blocks"
  ON public.appointment_blocks FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin manages appointment blocks" ON public.appointment_blocks;
CREATE POLICY "Admin manages appointment blocks"
  ON public.appointment_blocks FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE OR REPLACE FUNCTION public.touch_lead_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_updated_at();

CREATE OR REPLACE FUNCTION public.sync_lead_interaction_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.leads
  SET last_interaction_at = NEW.performed_at,
      updated_at = now()
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_interactions_touch_lead ON public.lead_interactions;
CREATE TRIGGER trg_lead_interactions_touch_lead
  AFTER INSERT ON public.lead_interactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_interaction_timestamp();

CREATE OR REPLACE FUNCTION public.track_lead_stage_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.kanban_stage IS DISTINCT FROM OLD.kanban_stage THEN
    NEW.stage_changed_at := now();

    INSERT INTO public.lead_stage_history (
      clinic_id,
      lead_id,
      from_stage,
      to_stage,
      changed_by
    ) VALUES (
      NEW.clinic_id,
      NEW.id,
      OLD.kanban_stage,
      NEW.kanban_stage,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_lead_stage_change ON public.leads;
CREATE TRIGGER trg_track_lead_stage_change
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.track_lead_stage_change();



-- =====================================================================
-- [2/7] 20260430123000_crm_follow_up.sql
-- =====================================================================

-- CRM follow-up / next action support

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_action_at
  ON public.leads(clinic_id, next_action_at);



-- =====================================================================
-- [3/7] 20260430124500_crm_priority.sql
-- =====================================================================

-- CRM priority support

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS priority_level text NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_leads_priority_level
  ON public.leads(clinic_id, priority_level);



-- =====================================================================
-- [4/7] 20260515231500_agenda_avancada_waitlist.sql
-- =====================================================================

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



-- =====================================================================
-- [5/7] 20260515235000_agenda_whatsapp_foundation.sql
-- =====================================================================

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



-- =====================================================================
-- [6/7] 20260516015000_agenda_jobs_orchestrator.sql
-- =====================================================================

-- Agenda Avançada - Orquestrador de Jobs (cron-safe)

CREATE TABLE IF NOT EXISTS public.agenda_job_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_name, run_key, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_agenda_job_executions_job_started
  ON public.agenda_job_executions (job_name, started_at DESC);

ALTER TABLE public.agenda_job_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic staff can view agenda job executions" ON public.agenda_job_executions;
CREATE POLICY "clinic staff can view agenda job executions"
ON public.agenda_job_executions
FOR SELECT
USING (clinic_id IS NULL OR public.is_clinic_staff(auth.uid(), clinic_id));



-- =====================================================================
-- [7/7] 20260516120000_renewal_automation_module.sql
-- =====================================================================

-- Renovação automática de pacientes (MVP)
-- Verificação de duplicidade: adiciona apenas campos/objetos inexistentes.

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS renewal_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_trigger_days integer NOT NULL DEFAULT 7 CHECK (renewal_trigger_days BETWEEN 1 AND 365);

CREATE TABLE IF NOT EXISTS public.renewal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  contract_item_id uuid,
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('session_based', 'time_based')),
  trigger_session_id uuid REFERENCES public.session_records(id) ON DELETE SET NULL,
  sessions_completed integer,
  sessions_total integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'revaluation_scheduled', 'snoozed', 'converted', 'discarded')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suggested_treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  suggested_treatment_rule text,
  suggestion_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_action_at timestamptz,
  last_action_type text,
  snoozed_until timestamptz,
  snooze_count integer NOT NULL DEFAULT 0,
  converted_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  discarded_reason text,
  discarded_reason_notes text,
  sla_yellow_at timestamptz,
  sla_red_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_tasks_clinic_status ON public.renewal_tasks(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_renewal_tasks_patient_treatment ON public.renewal_tasks(patient_id, treatment_id);
CREATE INDEX IF NOT EXISTS idx_renewal_tasks_scheduled_for ON public.renewal_tasks(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_renewal_tasks_snoozed_until ON public.renewal_tasks(snoozed_until);

CREATE TABLE IF NOT EXISTS public.renewal_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  renewal_task_id uuid NOT NULL REFERENCES public.renewal_tasks(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('whatsapp_sent', 'call_attempted', 'call_made', 'revaluation_scheduled', 'note', 'snoozed', 'converted', 'discarded')),
  notes text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_interactions_task ON public.renewal_interactions(renewal_task_id, performed_at DESC);

ALTER TABLE public.renewal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view renewal tasks" ON public.renewal_tasks;
CREATE POLICY "Staff view renewal tasks"
  ON public.renewal_tasks FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Service create renewal tasks" ON public.renewal_tasks;
CREATE POLICY "Service create renewal tasks"
  ON public.renewal_tasks FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff update renewal tasks" ON public.renewal_tasks;
CREATE POLICY "Staff update renewal tasks"
  ON public.renewal_tasks FOR UPDATE TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin delete renewal tasks" ON public.renewal_tasks;
CREATE POLICY "Admin delete renewal tasks"
  ON public.renewal_tasks FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff view renewal interactions" ON public.renewal_interactions;
CREATE POLICY "Staff view renewal interactions"
  ON public.renewal_interactions FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff create renewal interactions" ON public.renewal_interactions;
CREATE POLICY "Staff create renewal interactions"
  ON public.renewal_interactions FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

CREATE OR REPLACE FUNCTION public.touch_renewal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renewal_tasks_updated_at ON public.renewal_tasks;
CREATE TRIGGER trg_renewal_tasks_updated_at
  BEFORE UPDATE ON public.renewal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_renewal_updated_at();

CREATE OR REPLACE FUNCTION public.get_renewal_suggestion(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_treatment_id uuid,
  p_min_rating numeric
)
RETURNS TABLE (suggested_treatment_id uuid, suggested_rule text, suggestion_context jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_interest text;
  v_interest_treatment_id uuid;
  v_current_category text;
  v_current_sessions integer;
BEGIN
  SELECT t.category, COALESCE(t.num_sessions, 1)
    INTO v_current_category, v_current_sessions
  FROM public.treatments t
  WHERE t.id = p_treatment_id;

  SELECT li
    INTO v_interest
  FROM public.leads l
  CROSS JOIN LATERAL unnest(COALESCE(l.treatments_of_interest, ARRAY[]::text[])) AS li
  WHERE l.clinic_id = p_clinic_id
    AND l.patient_id = p_patient_id
    AND l.deleted_at IS NULL
    AND li IS NOT NULL
    AND trim(li) <> ''
    AND lower(trim(li)) <> lower((SELECT name FROM public.treatments WHERE id = p_treatment_id))
  ORDER BY l.updated_at DESC
  LIMIT 1;

  IF v_interest IS NOT NULL THEN
    SELECT t.id
      INTO v_interest_treatment_id
    FROM public.treatments t
    WHERE t.clinic_id = p_clinic_id
      AND t.is_active = true
      AND lower(t.name) = lower(v_interest)
    LIMIT 1;

    IF v_interest_treatment_id IS NOT NULL THEN
      RETURN QUERY SELECT v_interest_treatment_id, 'interest', jsonb_build_object('interest', v_interest, 'avg_rating', p_min_rating);
      RETURN;
    END IF;
  END IF;

  IF v_current_sessions > 1 AND p_min_rating >= 4 THEN
    RETURN QUERY SELECT p_treatment_id, 'extension', jsonb_build_object('avg_rating', p_min_rating);
    RETURN;
  END IF;

  RETURN QUERY
  WITH top_co AS (
    SELECT pi2.treatment_id AS treatment_id, count(*) AS total
    FROM public.proposals p
    JOIN public.proposal_items pi ON pi.proposal_id = p.id
    JOIN public.proposal_items pi2 ON pi2.proposal_id = p.id
    WHERE p.clinic_id = p_clinic_id
      AND pi.treatment_id = p_treatment_id
      AND pi2.treatment_id <> p_treatment_id
    GROUP BY pi2.treatment_id
    ORDER BY total DESC
    LIMIT 1
  )
  SELECT top_co.treatment_id, 'cooccurrence', jsonb_build_object('avg_rating', p_min_rating)
  FROM top_co;

  IF FOUND THEN
    RETURN;
  END IF;

  IF v_current_category IS NOT NULL THEN
    RETURN QUERY
    SELECT t.id, 'category', jsonb_build_object('category', v_current_category, 'avg_rating', p_min_rating)
    FROM public.treatments t
    JOIN public.proposal_items pi ON pi.treatment_id = t.id
    JOIN public.proposals p ON p.id = pi.proposal_id
    WHERE t.clinic_id = p_clinic_id
      AND t.is_active = true
      AND t.category = v_current_category
      AND t.id <> p_treatment_id
    GROUP BY t.id
    ORDER BY count(*) DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT t.id, 'fallback', jsonb_build_object('avg_rating', p_min_rating)
  FROM public.treatments t
  JOIN public.proposal_items pi ON pi.treatment_id = t.id
  JOIN public.proposals p ON p.id = pi.proposal_id
  WHERE t.clinic_id = p_clinic_id
    AND t.is_active = true
  GROUP BY t.id
  ORDER BY count(*) DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_renewal_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_treatment record;
  v_contract_id uuid;
  v_sessions_total integer;
  v_sessions_completed integer;
  v_threshold integer;
  v_avg_rating numeric := 0;
  v_suggested uuid;
  v_suggested_rule text;
  v_suggestion_context jsonb := '{}'::jsonb;
  v_exists uuid;
BEGIN
  SELECT t.id, t.name, t.num_sessions, t.renewal_enabled, t.renewal_trigger_days
    INTO v_treatment
  FROM public.treatments t
  WHERE t.id = NEW.treatment_id;

  IF v_treatment.id IS NULL OR COALESCE(v_treatment.renewal_enabled, true) = false THEN
    RETURN NEW;
  END IF;

  SELECT a.contract_id
    INTO v_contract_id
  FROM public.appointments a
  WHERE a.id = NEW.appointment_id;

  IF v_contract_id IS NULL THEN
    SELECT c.id
      INTO v_contract_id
    FROM public.contracts c
    WHERE c.clinic_id = NEW.clinic_id
      AND c.patient_id = NEW.patient_id
      AND c.status IN ('active', 'draft')
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(sum(COALESCE(pi.quantity, 1) * COALESCE(t2.num_sessions, 1)), 0)
    INTO v_sessions_total
  FROM public.contracts c
  JOIN public.proposal_items pi ON pi.proposal_id = c.proposal_id
  JOIN public.treatments t2 ON t2.id = pi.treatment_id
  WHERE c.id = v_contract_id
    AND pi.treatment_id = NEW.treatment_id;

  IF v_sessions_total <= 0 THEN
    v_sessions_total := GREATEST(COALESCE(NEW.total_sessions, 1), COALESCE(v_treatment.num_sessions, 1));
  END IF;

  SELECT count(*)
    INTO v_sessions_completed
  FROM public.session_records sr
  LEFT JOIN public.appointments a ON a.id = sr.appointment_id
  WHERE sr.clinic_id = NEW.clinic_id
    AND sr.patient_id = NEW.patient_id
    AND sr.treatment_id = NEW.treatment_id
    AND (v_contract_id IS NULL OR a.contract_id IS NULL OR a.contract_id = v_contract_id);

  IF v_sessions_completed <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(avg(sf.rating), 0)
    INTO v_avg_rating
  FROM public.session_feedback sf
  WHERE sf.clinic_id = NEW.clinic_id
    AND sf.patient_id = NEW.patient_id
    AND sf.treatment_id = NEW.treatment_id;

  SELECT suggested_treatment_id, suggested_rule, suggestion_context
    INTO v_suggested, v_suggested_rule, v_suggestion_context
  FROM public.get_renewal_suggestion(NEW.clinic_id, NEW.patient_id, NEW.treatment_id, v_avg_rating)
  LIMIT 1;

  SELECT rt.id
    INTO v_exists
  FROM public.renewal_tasks rt
  WHERE rt.clinic_id = NEW.clinic_id
    AND rt.patient_id = NEW.patient_id
    AND rt.treatment_id = NEW.treatment_id
    AND (rt.contract_id IS NOT DISTINCT FROM v_contract_id)
    AND rt.status IN ('pending', 'contacted', 'snoozed', 'revaluation_scheduled')
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_treatment.num_sessions, 1) <= 1 THEN
    INSERT INTO public.renewal_tasks (
      clinic_id, patient_id, contract_id, treatment_id, trigger_type, trigger_session_id,
      sessions_completed, sessions_total, status, suggested_treatment_id,
      suggested_treatment_rule, suggestion_context, scheduled_for
    ) VALUES (
      NEW.clinic_id, NEW.patient_id, v_contract_id, NEW.treatment_id, 'time_based', NEW.id,
      v_sessions_completed, v_sessions_total, 'pending', v_suggested,
      v_suggested_rule, COALESCE(v_suggestion_context, '{}'::jsonb),
      COALESCE(NEW.performed_at, now()) + make_interval(days => GREATEST(COALESCE(v_treatment.renewal_trigger_days, 7), 1))
    );
    RETURN NEW;
  END IF;

  IF v_sessions_total = 2 THEN
    v_threshold := 1;
  ELSE
    v_threshold := GREATEST(v_sessions_total - 2, 1);
  END IF;

  IF v_sessions_completed >= v_threshold THEN
    INSERT INTO public.renewal_tasks (
      clinic_id, patient_id, contract_id, treatment_id, trigger_type, trigger_session_id,
      sessions_completed, sessions_total, status, suggested_treatment_id,
      suggested_treatment_rule, suggestion_context, scheduled_for
    ) VALUES (
      NEW.clinic_id, NEW.patient_id, v_contract_id, NEW.treatment_id, 'session_based', NEW.id,
      v_sessions_completed, v_sessions_total, 'pending', v_suggested,
      v_suggested_rule, COALESCE(v_suggestion_context, '{}'::jsonb), now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_renewal_on_session_record ON public.session_records;
CREATE TRIGGER trg_detect_renewal_on_session_record
  AFTER INSERT ON public.session_records
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_renewal_from_session();

CREATE OR REPLACE FUNCTION public.renewal_tasks_daily_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.renewal_tasks
  SET status = 'pending',
      last_action_type = COALESCE(last_action_type, 'snooze_expired'),
      updated_at = now()
  WHERE status = 'snoozed'
    AND snoozed_until IS NOT NULL
    AND snoozed_until <= now();

  UPDATE public.renewal_tasks
  SET sla_yellow_at = COALESCE(sla_yellow_at, now())
  WHERE status IN ('pending', 'contacted', 'revaluation_scheduled')
    AND COALESCE(last_action_at, created_at) <= now() - interval '3 days'
    AND sla_yellow_at IS NULL;

  UPDATE public.renewal_tasks
  SET sla_red_at = COALESCE(sla_red_at, now())
  WHERE status IN ('pending', 'contacted', 'revaluation_scheduled')
    AND COALESCE(last_action_at, created_at) <= now() - interval '7 days'
    AND sla_red_at IS NULL;
END;
$$;

CREATE OR REPLACE VIEW public.v_renewal_tasks_active AS
WITH ltv_by_patient AS (
  SELECT pp.patient_id, COALESCE(sum(pi.amount), 0)::numeric AS total_ltv
  FROM public.payment_plans pp
  JOIN public.payment_installments pi ON pi.payment_plan_id = pp.id
  WHERE pi.status = 'paid'
  GROUP BY pp.patient_id
),
rating_by_patient_treatment AS (
  SELECT sf.patient_id, sf.treatment_id, avg(sf.rating)::numeric(10,2) AS avg_rating
  FROM public.session_feedback sf
  GROUP BY sf.patient_id, sf.treatment_id
)
SELECT
  rt.*,
  p.full_name AS patient_name,
  p.phone AS patient_phone,
  p.created_at AS patient_created_at,
  t.name AS treatment_name,
  ts.name AS suggested_treatment_name,
  COALESCE(ltv.total_ltv, 0)::numeric AS patient_ltv,
  COALESCE(r.avg_rating, 0)::numeric(10,2) AS avg_rating,
  GREATEST(date_part('day', now() - COALESCE(rt.last_action_at, rt.created_at)), 0)::int AS days_since_last_action,
  GREATEST(date_part('day', now() - rt.created_at), 0)::int AS days_since_created
FROM public.renewal_tasks rt
JOIN public.patients p ON p.id = rt.patient_id
JOIN public.treatments t ON t.id = rt.treatment_id
LEFT JOIN public.treatments ts ON ts.id = rt.suggested_treatment_id
LEFT JOIN ltv_by_patient ltv ON ltv.patient_id = rt.patient_id
LEFT JOIN rating_by_patient_treatment r ON r.patient_id = rt.patient_id AND r.treatment_id = rt.treatment_id
WHERE rt.status NOT IN ('converted', 'discarded')
  AND (rt.scheduled_for IS NULL OR rt.scheduled_for <= now())
  AND (rt.snoozed_until IS NULL OR rt.snoozed_until <= now());

