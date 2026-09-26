-- AURA PRE-BASELINE CLEANUP (TRANSITION ONLY)
--
-- This migration exists solely to prove that the historical migration chain can
-- reach the approved Aura baseline-ready contract. It must not be replayed after
-- the single baseline is generated, and it must not be applied to the preserved
-- staging project.

-- Structural roles: replace the historical enum instead of carrying portal and
-- sales values into the next baseline. Policies dependent on typed role helpers
-- are captured and restored around the enum replacement.
CREATE TEMP TABLE aura_role_policy_snapshot ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

UPDATE public.user_roles SET role = 'receptionist' WHERE role::text = 'sales';
DELETE FROM public.user_roles WHERE role::text = 'patient';
UPDATE public.team_invitations SET role = 'receptionist' WHERE role::text = 'sales';
DELETE FROM public.team_invitations WHERE role::text = 'patient';

ALTER TYPE public.app_role RENAME TO app_role_legacy;
CREATE TYPE public.app_role AS ENUM ('admin', 'receptionist', 'professional');

DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT DISTINCT procedure.oid::regprocedure AS signature
    FROM pg_proc procedure
    JOIN pg_depend dependency
      ON dependency.classid = 'pg_proc'::regclass
     AND dependency.objid = procedure.oid
    JOIN pg_type type ON type.oid = dependency.refobjid
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public' AND type.typname = 'app_role_legacy'
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', item.signature);
  END LOOP;
END
$$;

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
ALTER TABLE public.team_invitations
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
DROP TYPE public.app_role_legacy;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.has_clinic_role(
  _user_id uuid, _clinic_id uuid, _role public.app_role
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND clinic_id = _clinic_id
      AND role = _role AND is_active
  )
$$;

DO $$
DECLARE policy record;
DECLARE statement text;
BEGIN
  FOR policy IN SELECT * FROM aura_role_policy_snapshot LOOP
    IF to_regclass(format('%I.%I', policy.schemaname, policy.tablename)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies current_policy
         WHERE current_policy.schemaname = policy.schemaname
           AND current_policy.tablename = policy.tablename
           AND current_policy.policyname = policy.policyname
       ) THEN
      statement := format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
        policy.policyname, policy.schemaname, policy.tablename,
        policy.permissive, policy.cmd, array_to_string(policy.roles, ', ')
      );
      IF policy.qual IS NOT NULL THEN
        statement := statement || format(' USING (%s)', policy.qual);
      END IF;
      IF policy.with_check IS NOT NULL THEN
        statement := statement || format(' WITH CHECK (%s)', policy.with_check);
      END IF;
      EXECUTE statement;
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_clinic_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_clinic_role(uuid, uuid, public.app_role) TO authenticated, service_role;

-- Administrative patient lifecycle only.
UPDATE public.patients SET status = 'inactive' WHERE status::text = 'completed';
ALTER TABLE public.patients ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.patients ALTER COLUMN status TYPE text USING status::text;
DROP TYPE public.patient_status;
CREATE TYPE public.patient_status AS ENUM ('active', 'inactive', 'pending');
ALTER TABLE public.patients
  ALTER COLUMN status TYPE public.patient_status USING status::public.patient_status,
  ALTER COLUMN status SET DEFAULT 'active'::public.patient_status;

-- Remove portal policies on otherwise-current tables before removing their
-- helper functions and patient membership columns.
DROP POLICY IF EXISTS "Patient can view their clinic" ON public.clinics;
DROP POLICY IF EXISTS "Patient views own record" ON public.patients;
DROP POLICY IF EXISTS "Patient views clinic treatments" ON public.treatments;
DROP FUNCTION IF EXISTS public.auth_patient_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_patient_clinic_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_patient_ids_for_user(uuid) CASCADE;

-- Drop compatibility/legacy RPCs and triggers by their complete function name.
-- Canonical appointment functions are recreated below without removed columns.
DO $$
DECLARE function_name text;
DECLARE function_signature regprocedure;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'normalize_payment_method', 'parse_brl_amount',
    'backfill_contract_financial_forecast', 'get_finance_contract_forecast_detail',
    'get_finance_contract_sellers', 'get_finance_contracts_monthly_matrix',
    'get_finance_contracts_prediction_summary', 'upsert_contract_financial_forecast',
    'get_renewal_suggestion', 'renewal_tasks_daily_maintenance',
    'anamnese_before_upsert', 'generate_anamnese_number',
    'sync_patient_anamnese_status', 'detect_renewal_from_session',
    'flag_patient_dissatisfaction', 'notify_admin_negative_feedback',
    'touch_renewal_updated_at', 'determine_patient_consultation_type',
    'get_available_slots_for_consultation_type',
    'create_appointment_with_consultation_type_secure',
    'resolve_private_consultation_terms', 'enqueue_appointment_reminder_7d',
    'claim_appointment_reminder_7d', 'create_appointment_secure',
    'get_available_slots', 'resolve_appointment_type_terms',
    'get_available_slots_for_appointment_type',
    'create_appointment_with_type_secure', 'reschedule_appointment_secure'
  ] LOOP
    FOR function_signature IN
      SELECT procedure.oid::regprocedure
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public' AND procedure.proname = function_name
    LOOP
      EXECUTE format('DROP FUNCTION %s CASCADE', function_signature);
    END LOOP;
  END LOOP;
END
$$;

-- Remove the service-role-only cancellation overload retained for the old
-- global WhatsApp command flow. The tenant-scoped overload remains canonical.
DROP FUNCTION IF EXISTS public.cancel_appointment_secure(
  uuid, text, public.appointment_status
);

DROP VIEW IF EXISTS public.v_renewal_tasks_active CASCADE;

DROP TABLE IF EXISTS
  public.patient_portal_access,
  public.patient_users,
  public.documents,
  public.notifications,
  public.appointment_whatsapp_tokens,
  public.whatsapp_command_logs,
  public.patient_anamneses,
  public.patient_metrics,
  public.patient_photos,
  public.session_records,
  public.session_feedback,
  public.nps_responses,
  public.contract_installments,
  public.contract_payment_methods,
  public.contract_payment_plans,
  public.payment_installments,
  public.payment_plans,
  public.proposal_items,
  public.proposals,
  public.sales_goals,
  public.renewal_interactions,
  public.renewal_tasks,
  public.treatment_cost_items,
  public.cost_items,
  public.treatment_combo_items,
  public.treatment_combos,
  public.contracts,
  public.payers
CASCADE;

ALTER TABLE public.patients
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS payer_id,
  DROP COLUMN IF EXISTS is_self_payer,
  DROP COLUMN IF EXISTS dissatisfaction_flag,
  DROP COLUMN IF EXISTS dissatisfaction_level,
  DROP COLUMN IF EXISTS dissatisfaction_reason,
  DROP COLUMN IF EXISTS current_anamnese_id,
  DROP COLUMN IF EXISTS current_anamnese_status,
  DROP COLUMN IF EXISTS current_anamnese_expires_at,
  DROP COLUMN IF EXISTS has_valid_anamnese;

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS consultation_type,
  DROP COLUMN IF EXISTS contract_id,
  DROP COLUMN IF EXISTS contract_item_id,
  DROP COLUMN IF EXISTS credit_check_required,
  DROP COLUMN IF EXISTS credit_check_status,
  DROP COLUMN IF EXISTS credit_decision_id;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS proposal_id,
  DROP COLUMN IF EXISTS credit_consent,
  DROP COLUMN IF EXISTS credit_consent_at,
  DROP COLUMN IF EXISTS last_boleto_eligible,
  DROP COLUMN IF EXISTS last_credit_check_at,
  DROP COLUMN IF EXISTS last_credit_risk_level,
  DROP COLUMN IF EXISTS last_recommended_payment;

UPDATE public.treatments
SET price = default_price
WHERE default_price IS NOT NULL AND (price IS NULL OR price = 0);
ALTER TABLE public.treatments
  DROP COLUMN IF EXISTS num_sessions,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS default_price,
  DROP COLUMN IF EXISTS min_price,
  DROP COLUMN IF EXISTS cost,
  DROP COLUMN IF EXISTS renewal_enabled,
  DROP COLUMN IF EXISTS renewal_trigger_days;

-- Canonical appointment aliases only.
UPDATE public.appointments
SET appointment_type = CASE
  WHEN appointment_type IN ('first_visit','consultation','return_or_post_op','maintenance','procedure')
    THEN appointment_type
  WHEN appointment_type IN ('return','post_operative') THEN 'return_or_post_op'
  WHEN appointment_type IN ('session','treatment_session') THEN 'procedure'
  ELSE 'consultation'
END;
ALTER TABLE public.appointments
  ALTER COLUMN appointment_type SET NOT NULL,
  DROP CONSTRAINT IF EXISTS appointments_appointment_type_check,
  ADD CONSTRAINT appointments_appointment_type_check CHECK (
    appointment_type IN ('first_visit','consultation','return_or_post_op','maintenance','procedure')
  );
COMMENT ON COLUMN public.appointments.appointment_type IS
  'Canonical Aura appointment classification.';

-- Remove default access groups and permission keys tied to excluded modules.
WITH obsolete_groups AS (
  SELECT id FROM public.access_groups WHERE code IN ('comercial', 'financeiro')
)
DELETE FROM public.user_access_groups
WHERE group_id IN (SELECT id FROM obsolete_groups);
DELETE FROM public.access_groups WHERE code IN ('comercial', 'financeiro');
DELETE FROM public.access_group_permissions
WHERE permission_key NOT IN (
  'dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view',
  'treatments.view', 'appointments.view', 'professionals.view',
  'automations.view', 'settings.view'
);

-- Storage contract: clinic-logos only. Fail closed if a removed bucket still
-- contains objects; this transition never deletes patient or contract files.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND concat_ws(' ', qual, with_check) ~
        '(contracts|patient-anamneses|patient-photos|documents|patient-files)'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', policy.policyname);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id IN (
      'contracts','patient-anamneses','patient-photos','documents','patient-files'
    )
  ) THEN
    RAISE EXCEPTION 'AURA_CLEANUP_STORAGE_NOT_EMPTY';
  END IF;
END
$$;
SET LOCAL session_replication_role = replica;
DELETE FROM storage.buckets
WHERE id IN ('contracts','patient-anamneses','patient-photos','documents','patient-files');
SET LOCAL session_replication_role = origin;

-- First-visit classification is appointment_type=first_visit. Price and
-- duration overrides remain in professional_settings.
CREATE OR REPLACE FUNCTION public.determine_patient_appointment_type(
  p_clinic_id uuid, p_patient_id uuid, p_professional_id uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_patient_id IS NULL OR p_professional_id IS NULL THEN RETURN 'unknown'; END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.patients
       WHERE id = p_patient_id AND clinic_id = p_clinic_id
     ) OR NOT EXISTS (
       SELECT 1 FROM public.professionals
       WHERE id = p_professional_id AND clinic_id = p_clinic_id
     ) THEN
    RETURN 'unknown';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.clinic_id = p_clinic_id
      AND appointment.patient_id = p_patient_id
      AND appointment.professional_id = p_professional_id
      AND appointment.status = 'completed'
      AND NOT appointment.is_tombstone
      AND appointment.completed_at IS NOT NULL
  ) THEN
    RETURN 'consultation';
  END IF;
  RETURN 'first_visit';
END
$$;

CREATE OR REPLACE FUNCTION public.resolve_appointment_type_terms(
  p_clinic_id uuid, p_professional_id uuid, p_treatment_id uuid,
  p_billing_type text, p_health_insurance_id uuid, p_appointment_type text
) RETURNS TABLE(price numeric, duration_minutes integer, terms_source text)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_duration integer; v_price numeric;
BEGIN
  IF p_appointment_type NOT IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_APPOINTMENT_TYPE' USING ERRCODE='22023';
  END IF;
  IF p_billing_type NOT IN ('private','insurance') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_BILLING_TYPE' USING ERRCODE='22023';
  END IF;
  IF p_appointment_type = 'procedure' AND p_treatment_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_SERVICE_REQUIRED_FOR_PROCEDURE' USING ERRCODE='22023';
  END IF;

  IF p_appointment_type IN ('first_visit','consultation') AND p_billing_type = 'private' THEN
    RETURN QUERY
    SELECT
      CASE WHEN p_appointment_type = 'first_visit'
        THEN COALESCE(settings.first_visit_price, professional.private_consultation_price)
        ELSE professional.private_consultation_price END,
      CASE WHEN p_appointment_type = 'first_visit'
        THEN COALESCE(settings.first_visit_duration_minutes, settings.private_appointment_duration_minutes, 30)
        ELSE COALESCE(settings.private_appointment_duration_minutes, 30) END,
      CASE WHEN p_appointment_type = 'first_visit' AND settings.first_visit_duration_minutes IS NOT NULL
        THEN 'first_visit_override'
        WHEN p_appointment_type = 'first_visit' THEN 'standard_fallback'
        ELSE 'standard' END
    FROM public.professionals professional
    LEFT JOIN public.professional_settings settings
      ON settings.professional_id = professional.id
     AND settings.clinic_id = professional.clinic_id
    WHERE professional.id = p_professional_id
      AND professional.clinic_id = p_clinic_id;
    RETURN;
  END IF;

  IF p_appointment_type = 'procedure' THEN
    SELECT COALESCE(link.duration_minutes,treatment.duration_minutes,settings.default_appointment_duration_minutes,30),
           CASE WHEN p_billing_type='private' THEN COALESCE(link.private_price,treatment.price) ELSE NULL END
      INTO v_duration,v_price
    FROM public.professionals professional
    LEFT JOIN public.professional_settings settings
      ON settings.clinic_id=professional.clinic_id AND settings.professional_id=professional.id
    JOIN public.treatments treatment
      ON treatment.clinic_id=professional.clinic_id AND treatment.id=p_treatment_id AND treatment.is_active
    JOIN public.professional_treatments link
      ON link.clinic_id=professional.clinic_id AND link.professional_id=professional.id
     AND link.treatment_id=treatment.id AND link.status='active'
    WHERE professional.clinic_id=p_clinic_id AND professional.id=p_professional_id;
    IF v_duration IS NULL THEN
      RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE='23503';
    END IF;
    RETURN QUERY SELECT v_price,v_duration,'service'::text;
    RETURN;
  END IF;

  v_duration:=public.resolve_appointment_duration(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id
  );
  SELECT professional.private_consultation_price INTO v_price
  FROM public.professionals professional
  WHERE professional.clinic_id=p_clinic_id AND professional.id=p_professional_id;
  RETURN QUERY SELECT CASE WHEN p_billing_type='private' THEN v_price ELSE NULL END,
    v_duration,CASE WHEN p_billing_type='insurance' THEN 'insurance' ELSE 'standard' END::text;
END
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots_for_appointment_type(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid, p_treatment_id uuid,
  p_date_from date, p_date_to date, p_step_minutes integer,
  p_billing_type text, p_health_insurance_id uuid, p_appointment_type text
) RETURNS TABLE(start_time timestamptz,end_time timestamptz,duration_minutes integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_timezone text; v_duration integer;
BEGIN
  IF p_date_to<p_date_from OR p_date_to>p_date_from+120 THEN RAISE EXCEPTION 'AGENDA_INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
  IF p_step_minutes<5 OR p_step_minutes>60 THEN RAISE EXCEPTION 'AGENDA_INVALID_STEP' USING ERRCODE='22023'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT timezone INTO v_timezone FROM public.clinic_locations
   WHERE id=p_location_id AND clinic_id=p_clinic_id AND active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations WHERE clinic_id=p_clinic_id AND location_id=p_location_id AND professional_id=p_professional_id AND active) THEN RETURN; END IF;
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id,p_appointment_type
  ) terms;
  IF v_duration IS NULL OR v_duration<5 OR v_duration>480 THEN RAISE EXCEPTION 'AGENDA_INVALID_DURATION' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  WITH dates AS (
    SELECT day::date local_date FROM generate_series(p_date_from::timestamp,p_date_to::timestamp,interval '1 day') day
  ), windows AS (
    SELECT dates.local_date,
      ((dates.local_date+period.start_time) AT TIME ZONE v_timezone) window_start,
      ((dates.local_date+period.end_time) AT TIME ZONE v_timezone) window_end
    FROM dates CROSS JOIN LATERAL public.get_effective_working_periods(
      p_clinic_id,p_location_id,p_professional_id,dates.local_date
    ) period
  ), candidates AS (
    SELECT slot_start candidate_start,slot_start+make_interval(mins=>v_duration) candidate_end
    FROM windows CROSS JOIN LATERAL generate_series(
      window_start,window_end-make_interval(mins=>v_duration),make_interval(mins=>p_step_minutes)
    ) slot_start
  )
  SELECT candidate_start,candidate_end,v_duration FROM candidates candidate
  WHERE NOT EXISTS (SELECT 1 FROM public.appointments appointment
    WHERE appointment.clinic_id=p_clinic_id AND appointment.professional_id=p_professional_id
      AND appointment.status IN ('scheduled','confirmed','in_progress')
      AND tstzrange(appointment.start_time,appointment.end_time,'[)') && tstzrange(candidate.candidate_start,candidate.candidate_end,'[)'))
    AND NOT EXISTS (SELECT 1 FROM public.appointment_blocks block
      WHERE block.clinic_id=p_clinic_id AND block.location_id=p_location_id
        AND (block.professional_id IS NULL OR block.professional_id=p_professional_id)
        AND tstzrange(block.start_at,block.end_at,'[)') && tstzrange(candidate.candidate_start,candidate.candidate_end,'[)'))
  ORDER BY candidate_start;
END
$$;

CREATE OR REPLACE FUNCTION public.create_appointment_with_type_secure(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_patient_id uuid, p_lead_id uuid, p_treatment_id uuid,
  p_start_time timestamptz, p_appointment_type text,
  p_notes text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL,
  p_billing_type text DEFAULT 'private', p_health_insurance_id uuid DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_duration integer; v_end timestamptz; v_result public.appointments;
BEGIN
  IF p_appointment_type NOT IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN RAISE EXCEPTION 'AGENDA_INVALID_APPOINTMENT_TYPE' USING ERRCODE='22023'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_patient_id IS NULL AND p_lead_id IS NULL THEN RAISE EXCEPTION 'AGENDA_PATIENT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id=p_patient_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_PATIENT_INVALID' USING ERRCODE='23503'; END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id=p_lead_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_LEAD_INVALID' USING ERRCODE='23503'; END IF;
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id,p_appointment_type
  ) terms;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,p_location_id,p_professional_id,p_treatment_id,p_start_time,v_end,NULL);
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,start_time,end_time,
    scheduled_at,duration_minutes,appointment_type,notes,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,p_location_id,p_professional_id,p_patient_id,p_lead_id,p_treatment_id,p_start_time,v_end,
    p_start_time,v_duration,p_appointment_type,p_notes,(SELECT auth.uid()),p_billing_type,
    CASE WHEN p_billing_type='insurance' THEN p_health_insurance_id ELSE NULL END
  ) RETURNING * INTO v_result;
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END
$$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_secure(
  p_clinic_id uuid, p_appointment_id uuid, p_start_time timestamptz,
  p_professional_id uuid DEFAULT NULL, p_location_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL,
  p_reason text DEFAULT 'Remarcado'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_old public.appointments; v_new public.appointments; v_professional_id uuid; v_location_id uuid; v_duration integer; v_end timestamptz;
BEGIN
  SELECT * INTO v_old FROM public.appointments WHERE id=p_appointment_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_old.status NOT IN ('scheduled','confirmed','in_progress') THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE='22023'; END IF;
  v_professional_id:=COALESCE(p_professional_id,v_old.professional_id);
  v_location_id:=COALESCE(p_location_id,v_old.location_id);
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,v_professional_id,v_old.treatment_id,v_old.billing_type,v_old.health_insurance_id,v_old.appointment_type
  ) terms;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,v_location_id,v_professional_id,v_old.treatment_id,p_start_time,v_end,v_old.id);
  UPDATE public.appointments SET status='rescheduled',cancelled_reason=p_reason
  WHERE id=v_old.id AND clinic_id=p_clinic_id;
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,
    start_time,end_time,scheduled_at,duration_minutes,appointment_type,notes,status,
    rescheduled_from,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,v_location_id,v_professional_id,v_old.patient_id,v_old.lead_id,v_old.treatment_id,
    p_start_time,v_end,p_start_time,v_duration,v_old.appointment_type,COALESCE(p_notes,v_old.notes),'scheduled',
    v_old.id,(SELECT auth.uid()),v_old.billing_type,v_old.health_insurance_id
  ) RETURNING * INTO v_new;
  UPDATE public.appointments SET rescheduled_to=v_new.id
  WHERE id=v_old.id AND clinic_id=p_clinic_id;
  RETURN v_new;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END
$$;

REVOKE ALL ON FUNCTION public.determine_patient_appointment_type(uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.resolve_appointment_type_terms(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_available_slots_for_appointment_type(uuid,uuid,uuid,uuid,date,date,integer,text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_appointment_with_type_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment_secure(uuid,uuid,timestamptz,uuid,uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.determine_patient_appointment_type(uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_type_terms(uuid,uuid,uuid,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_appointment_type(uuid,uuid,uuid,uuid,date,date,integer,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_type_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,text,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_secure(uuid,uuid,timestamptz,uuid,uuid,text,integer,text) TO authenticated,service_role;

DROP TYPE IF EXISTS public.contract_status;
DROP TYPE IF EXISTS public.payment_method;
DROP TYPE IF EXISTS public.payment_status;
DROP TYPE IF EXISTS public.photo_type;
DROP TYPE IF EXISTS public.proposal_status;
DROP TYPE IF EXISTS public.whatsapp_command_status;

-- Final function exposure: no anonymous execution inherited from PostgreSQL's
-- default PUBLIC grant. Frontend/RLS helpers are explicit; queue mutation stays
-- service-role-only through its existing grants.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_clinic_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_clinic_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_menu_access(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_staff(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_clinic(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.location_opening_hours_are_valid(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_periods_are_valid(jsonb) TO authenticated, service_role;

ALTER FUNCTION public.sync_lead_interaction_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_lead_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.track_lead_stage_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.schedule_periods_are_valid(jsonb) STABLE;
ALTER FUNCTION public.location_opening_hours_are_valid(jsonb) STABLE;

-- Remove unused whole-row reads reported by plpgsql_check while preserving the
-- row lock and existence proof used by the handoff lifecycle.
CREATE OR REPLACE FUNCTION public.request_ai_conversation_handoff(
  p_clinic_id uuid, p_conversation_id uuid, p_reason text, p_priority text,
  p_source text, p_correlation_id uuid, p_summary jsonb DEFAULT '{}'::jsonb,
  p_description text DEFAULT NULL
) RETURNS public.ai_conversation_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
  v_service boolean := COALESCE((SELECT auth.role()) = 'service_role', false);
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT v_service AND NOT public.is_clinic_staff(v_actor, p_clinic_id) THEN
    RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_service AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_ai_settings
    WHERE clinic_id = p_clinic_id AND ai_engine_mode = 'active'
      AND ai_handoff_enabled = true AND ai_handoff_validated_at IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public.whatsapp_ai_conversations
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id = p_conversation_id
    AND status IN ('requested', 'queued', 'assigned', 'accepted')
  ORDER BY requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_handoff; END IF;
  INSERT INTO public.ai_conversation_handoffs (
    clinic_id, conversation_id, reason, priority, status, source, correlation_id,
    sanitized_description, summary, requested_by
  ) VALUES (
    p_clinic_id, p_conversation_id, p_reason, p_priority, 'queued', p_source,
    p_correlation_id, left(p_description, 240), COALESCE(p_summary, '{}'::jsonb),
    CASE WHEN v_service THEN NULL ELSE v_actor END
  ) RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET
    control_mode = 'handoff_pending', active_handoff_id = v_handoff.id,
    ai_enabled = false, status = 'handoff', assigned_user_id = NULL,
    control_revision = control_revision + 1,
    conversation_state = jsonb_set(
      jsonb_set(conversation_state, '{lastPresentedOptions}', '[]'::jsonb, true),
      '{activeIntentStatus}', '"collecting"'::jsonb, true
    )
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id;
  INSERT INTO public.ai_handoff_events(
    clinic_id, conversation_id, handoff_id, action, actor_user_id, reason
  ) VALUES (
    p_clinic_id, p_conversation_id, v_handoff.id, 'requested',
    CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason
  );
  INSERT INTO public.ai_handoff_events(
    clinic_id, conversation_id, handoff_id, action, actor_user_id, reason
  ) VALUES (
    p_clinic_id, p_conversation_id, v_handoff.id, 'queued',
    CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason
  );
  RETURN v_handoff;
END
$$;

CREATE OR REPLACE FUNCTION public.take_over_ai_conversation(
  p_clinic_id uuid, p_conversation_id uuid
) RETURNS public.ai_conversation_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_staff(v_actor, p_clinic_id) THEN
    RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.whatsapp_ai_conversations
  WHERE id=p_conversation_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id=p_conversation_id
    AND status IN ('requested','queued','assigned','accepted')
  ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ai_conversation_handoffs(
      clinic_id,conversation_id,reason,priority,status,source,summary,requested_by
    ) VALUES (
      p_clinic_id,p_conversation_id,'staff_manual_takeover','normal','queued','staff',
      jsonb_build_object('reason','staff_manual_takeover','knownAdministrativeContext','[]'::jsonb,'whatAuraAlreadyTried','[]'::jsonb),v_actor
    ) RETURNING * INTO v_handoff;
    UPDATE public.whatsapp_ai_conversations SET active_handoff_id=v_handoff.id
    WHERE id=p_conversation_id;
    INSERT INTO public.ai_handoff_events(
      clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
    ) VALUES (
      p_clinic_id,p_conversation_id,v_handoff.id,'requested',v_actor,'staff_manual_takeover'
    );
  END IF;
  IF v_handoff.status='accepted' AND v_handoff.assigned_user_id=v_actor THEN
    RETURN v_handoff;
  END IF;
  IF v_handoff.assigned_user_id IS NOT NULL
     AND v_handoff.assigned_user_id <> v_actor
     AND v_handoff.status IN ('assigned','accepted') THEN
    RAISE EXCEPTION 'HANDOFF_ALREADY_ASSIGNED' USING ERRCODE='40001';
  END IF;
  UPDATE public.ai_conversation_handoffs SET
    status='accepted', assigned_user_id=v_actor,
    assigned_at=COALESCE(assigned_at,now()), accepted_at=COALESCE(accepted_at,now())
  WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET
    control_mode='human_active', active_handoff_id=v_handoff.id,
    assigned_user_id=v_actor, ai_enabled=false, status='handoff',
    control_revision=control_revision+1
  WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(
    clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
  ) VALUES (p_clinic_id,p_conversation_id,v_handoff.id,'assigned',v_actor,v_handoff.reason);
  INSERT INTO public.ai_handoff_events(
    clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
  ) VALUES (p_clinic_id,p_conversation_id,v_handoff.id,'accepted',v_actor,v_handoff.reason);
  RETURN v_handoff;
END
$$;
