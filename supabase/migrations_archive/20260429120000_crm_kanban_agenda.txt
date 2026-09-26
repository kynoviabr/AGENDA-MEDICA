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
