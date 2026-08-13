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
