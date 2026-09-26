-- Phase 5.5B.1: harden the internal scheduling provider authority.
-- PostgreSQL remains authoritative for duration, availability and lifecycle transitions.

CREATE OR REPLACE FUNCTION public.resolve_appointment_duration(
  p_clinic_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_billing_type text,
  p_health_insurance_id uuid
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duration integer;
BEGIN
  IF p_billing_type NOT IN ('private', 'insurance') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_BILLING_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_billing_type = 'insurance' THEN
    IF p_health_insurance_id IS NULL THEN
      RAISE EXCEPTION 'AGENDA_INSURANCE_REQUIRED' USING ERRCODE = '22023';
    END IF;

    SELECT phi.appointment_duration_minutes
      INTO v_duration
    FROM public.professional_health_insurances phi
    JOIN public.health_insurances hi
      ON hi.id = phi.health_insurance_id
     AND hi.clinic_id = phi.clinic_id
    WHERE phi.clinic_id = p_clinic_id
      AND phi.professional_id = p_professional_id
      AND phi.health_insurance_id = p_health_insurance_id
      AND phi.status = 'active'
      AND hi.status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'AGENDA_INVALID_PROFESSIONAL_INSURANCE' USING ERRCODE = '22023';
    END IF;

    RETURN COALESCE(
      v_duration,
      (SELECT pt.duration_minutes
       FROM public.professional_treatments pt
       WHERE pt.clinic_id = p_clinic_id
         AND pt.professional_id = p_professional_id
         AND pt.treatment_id = p_treatment_id
         AND pt.status = 'active'
       LIMIT 1),
      (SELECT t.duration_minutes
       FROM public.treatments t
       WHERE t.clinic_id = p_clinic_id
         AND t.id = p_treatment_id
         AND t.is_active
       LIMIT 1),
      (SELECT ps.default_appointment_duration_minutes
       FROM public.professional_settings ps
       WHERE ps.clinic_id = p_clinic_id
         AND ps.professional_id = p_professional_id
       LIMIT 1),
      30
    )::integer;
  END IF;

  RETURN COALESCE(
    (SELECT ps.private_appointment_duration_minutes
     FROM public.professional_settings ps
     WHERE ps.clinic_id = p_clinic_id
       AND ps.professional_id = p_professional_id
     LIMIT 1),
    (SELECT pt.duration_minutes
     FROM public.professional_treatments pt
     WHERE pt.clinic_id = p_clinic_id
       AND pt.professional_id = p_professional_id
       AND pt.treatment_id = p_treatment_id
       AND pt.status = 'active'
     LIMIT 1),
    (SELECT t.duration_minutes
     FROM public.treatments t
     WHERE t.clinic_id = p_clinic_id
       AND t.id = p_treatment_id
       AND t.is_active
     LIMIT 1),
    (SELECT ps.default_appointment_duration_minutes
     FROM public.professional_settings ps
     WHERE ps.clinic_id = p_clinic_id
       AND ps.professional_id = p_professional_id
     LIMIT 1),
    30
  )::integer;
END
$$;

-- Backward-compatible private-mode resolver used by existing SQL callers.
CREATE OR REPLACE FUNCTION public.resolve_appointment_duration(
  p_clinic_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    p_treatment_id,
    'private',
    NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_clinic_id uuid,
  p_location_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_date_from date,
  p_date_to date,
  p_step_minutes integer,
  p_billing_type text,
  p_health_insurance_id uuid
) RETURNS TABLE(
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_duration integer;
BEGIN
  IF p_date_to < p_date_from OR p_date_to > p_date_from + 120 THEN
    RAISE EXCEPTION 'AGENDA_INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF p_step_minutes < 5 OR p_step_minutes > 60 THEN
    RAISE EXCEPTION 'AGENDA_INVALID_STEP' USING ERRCODE = '22023';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT l.timezone
    INTO v_timezone
  FROM public.clinic_locations l
  WHERE l.id = p_location_id
    AND l.clinic_id = p_clinic_id
    AND l.active;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.professional_locations pl
    WHERE pl.clinic_id = p_clinic_id
      AND pl.location_id = p_location_id
      AND pl.professional_id = p_professional_id
      AND pl.active
  ) THEN
    RETURN;
  END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.professional_treatments pt
    WHERE pt.clinic_id = p_clinic_id
      AND pt.professional_id = p_professional_id
      AND pt.treatment_id = p_treatment_id
      AND pt.status = 'active'
  ) THEN
    RETURN;
  END IF;

  v_duration := public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    p_treatment_id,
    p_billing_type,
    p_health_insurance_id
  );

  RETURN QUERY
  WITH windows AS (
    SELECT a.*,
      d::date AS local_date,
      ((d::date + a.start_time) AT TIME ZONE v_timezone) AS window_start,
      ((d::date + a.end_time) AT TIME ZONE v_timezone) AS window_end
    FROM generate_series(p_date_from::timestamp, p_date_to::timestamp, interval '1 day') d
    JOIN public.professional_availability a
      ON a.clinic_id = p_clinic_id
     AND a.location_id = p_location_id
     AND a.professional_id = p_professional_id
     AND a.is_active
     AND a.day_of_week = EXTRACT(DOW FROM d)::integer
     AND (a.valid_from IS NULL OR a.valid_from <= d::date)
     AND (a.valid_until IS NULL OR a.valid_until >= d::date)
  ), candidates AS (
    SELECT gs AS candidate_start,
      gs + make_interval(mins => v_duration) AS candidate_end
    FROM windows w
    CROSS JOIN LATERAL generate_series(
      w.window_start,
      w.window_end - make_interval(mins => v_duration),
      make_interval(mins => p_step_minutes)
    ) gs
  )
  SELECT c.candidate_start, c.candidate_end, v_duration
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.professional_id = p_professional_id
      AND a.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.start_time, a.end_time, '[)')
          && tstzrange(c.candidate_start, c.candidate_end, '[)')
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointment_blocks b
      WHERE b.clinic_id = p_clinic_id
        AND b.location_id = p_location_id
        AND (b.professional_id IS NULL OR b.professional_id = p_professional_id)
        AND tstzrange(b.start_at, b.end_at, '[)')
            && tstzrange(c.candidate_start, c.candidate_end, '[)')
    )
  ORDER BY c.candidate_start;
END
$$;

-- Existing Agenda/Waitlist callers remain private-mode compatible.
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_clinic_id uuid,
  p_location_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_date_from date,
  p_date_to date,
  p_step_minutes integer DEFAULT 15
) RETURNS TABLE(
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.get_available_slots(
    p_clinic_id,
    p_location_id,
    p_professional_id,
    p_treatment_id,
    p_date_from,
    p_date_to,
    p_step_minutes,
    'private',
    NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.create_appointment_secure(
  p_clinic_id uuid,
  p_location_id uuid,
  p_professional_id uuid,
  p_patient_id uuid,
  p_lead_id uuid,
  p_treatment_id uuid,
  p_start_time timestamptz,
  p_appointment_type text DEFAULT 'treatment_session',
  p_notes text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_contract_id uuid DEFAULT NULL,
  p_contract_item_id uuid DEFAULT NULL,
  p_billing_type text DEFAULT 'private',
  p_health_insurance_id uuid DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_duration integer;
  v_end timestamptz;
  v_result public.appointments;
BEGIN
  IF p_patient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'AGENDA_PATIENT_INVALID' USING ERRCODE = '23503';
  END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = p_lead_id
      AND l.clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'AGENDA_LEAD_INVALID' USING ERRCODE = '23503';
  END IF;

  v_duration := public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    p_treatment_id,
    p_billing_type,
    p_health_insurance_id
  );
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes <> v_duration THEN
    RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF v_duration < 5 OR v_duration > 480 THEN
    RAISE EXCEPTION 'AGENDA_INVALID_DURATION' USING ERRCODE = '22023';
  END IF;

  v_end := p_start_time + make_interval(mins => v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text, 0));
  PERFORM public.assert_appointment_slot(
    p_clinic_id,
    p_location_id,
    p_professional_id,
    p_treatment_id,
    p_start_time,
    v_end,
    NULL
  );

  INSERT INTO public.appointments(
    clinic_id, location_id, professional_id, patient_id, lead_id, treatment_id,
    contract_id, contract_item_id, start_time, end_time, scheduled_at,
    duration_minutes, appointment_type, notes, created_by, billing_type,
    health_insurance_id
  ) VALUES (
    p_clinic_id, p_location_id, p_professional_id, p_patient_id, p_lead_id,
    p_treatment_id, p_contract_id, p_contract_item_id, p_start_time, v_end,
    p_start_time, v_duration, p_appointment_type, p_notes, (SELECT auth.uid()),
    p_billing_type,
    CASE WHEN p_billing_type = 'insurance' THEN p_health_insurance_id ELSE NULL END
  )
  RETURNING * INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
END
$$;

-- The previous 12-argument overload is removed. The modality-aware function has
-- defaults for the final two arguments, so existing positional callers remain valid
-- without leaving an ambiguous PostgREST overload behind.
DROP FUNCTION IF EXISTS public.create_appointment_secure(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, integer, uuid, uuid
);

DROP FUNCTION IF EXISTS public.reschedule_appointment_secure(
  uuid, timestamptz, uuid, uuid, text, integer, text
);

CREATE OR REPLACE FUNCTION public.reschedule_appointment_secure(
  p_clinic_id uuid,
  p_appointment_id uuid,
  p_start_time timestamptz,
  p_professional_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_reason text DEFAULT 'Remarcado'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_old public.appointments;
  v_new public.appointments;
  v_professional_id uuid;
  v_location_id uuid;
  v_duration integer;
  v_end timestamptz;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  v_professional_id := COALESCE(p_professional_id, v_old.professional_id);
  v_location_id := COALESCE(p_location_id, v_old.location_id);
  v_duration := public.resolve_appointment_duration(
    p_clinic_id,
    v_professional_id,
    v_old.treatment_id,
    v_old.billing_type,
    v_old.health_insurance_id
  );
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes <> v_duration THEN
    RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  v_end := p_start_time + make_interval(mins => v_duration);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_professional_id::text, 0));
  PERFORM public.assert_appointment_slot(
    p_clinic_id,
    v_location_id,
    v_professional_id,
    v_old.treatment_id,
    p_start_time,
    v_end,
    v_old.id
  );

  UPDATE public.appointments
  SET status = 'rescheduled',
      cancelled_reason = p_reason
  WHERE id = v_old.id
    AND clinic_id = p_clinic_id;

  INSERT INTO public.appointments(
    clinic_id, location_id, professional_id, patient_id, lead_id, treatment_id,
    contract_id, contract_item_id, start_time, end_time, scheduled_at,
    duration_minutes, appointment_type, notes, status, credit_check_required,
    credit_check_status, rescheduled_from, created_by, billing_type,
    health_insurance_id
  ) VALUES (
    p_clinic_id, v_location_id, v_professional_id, v_old.patient_id,
    v_old.lead_id, v_old.treatment_id, v_old.contract_id,
    v_old.contract_item_id, p_start_time, v_end, p_start_time, v_duration,
    v_old.appointment_type, COALESCE(p_notes, v_old.notes), 'scheduled',
    v_old.credit_check_required, v_old.credit_check_status, v_old.id,
    (SELECT auth.uid()), v_old.billing_type, v_old.health_insurance_id
  )
  RETURNING * INTO v_new;

  UPDATE public.appointments
  SET rescheduled_to = v_new.id
  WHERE id = v_old.id
    AND clinic_id = p_clinic_id;

  RETURN v_new;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
END
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_secure(
  p_clinic_id uuid,
  p_appointment_id uuid,
  p_reason text,
  p_status public.appointment_status DEFAULT 'cancelled'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  IF p_status NOT IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_CANCELLATION_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = p_status,
      cancelled_reason = CASE
        WHEN p_status = 'cancelled' THEN p_reason
        ELSE cancelled_reason
      END,
      no_show_reason = CASE
        WHEN p_status = 'no_show' THEN p_reason
        ELSE no_show_reason
      END
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;

-- Temporary compatibility for the unchanged service-role WhatsApp command flow.
CREATE OR REPLACE FUNCTION public.cancel_appointment_secure(
  p_appointment_id uuid,
  p_reason text,
  p_status public.appointment_status DEFAULT 'cancelled'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'AGENDA_CLINIC_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT a.clinic_id
    INTO v_clinic_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.cancel_appointment_secure(
    v_clinic_id,
    p_appointment_id,
    p_reason,
    p_status
  );
END
$$;

DROP FUNCTION IF EXISTS public.reassign_appointment_professional_secure(uuid, uuid);

CREATE OR REPLACE FUNCTION public.reassign_appointment_professional_secure(
  p_clinic_id uuid,
  p_appointment_id uuid,
  p_professional_id uuid
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_old public.appointments;
  v_duration integer;
  v_end timestamptz;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  v_duration := public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    v_old.treatment_id,
    v_old.billing_type,
    v_old.health_insurance_id
  );
  v_end := v_old.start_time + make_interval(mins => v_duration);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text, 0));
  PERFORM public.assert_appointment_slot(
    p_clinic_id,
    v_old.location_id,
    p_professional_id,
    v_old.treatment_id,
    v_old.start_time,
    v_end,
    v_old.id
  );

  UPDATE public.appointments
  SET professional_id = p_professional_id,
      end_time = v_end,
      duration_minutes = v_duration
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
END
$$;

CREATE OR REPLACE FUNCTION public.confirm_appointment_secure(
  p_clinic_id uuid,
  p_appointment_id uuid
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed',
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.transition_appointment_status_secure(
  p_clinic_id uuid,
  p_appointment_id uuid,
  p_status public.appointment_status
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_status = 'scheduled' AND v_old.status = 'scheduled' THEN
    RETURN v_old;
  ELSIF p_status = 'in_progress' AND v_old.status = 'confirmed' THEN
    NULL;
  ELSIF p_status = 'completed' AND v_old.status = 'in_progress' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'AGENDA_INVALID_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = p_status,
      checked_in_at = CASE
        WHEN p_status = 'in_progress' THEN now()
        ELSE checked_in_at
      END,
      completed_at = CASE
        WHEN p_status = 'completed' THEN now()
        ELSE completed_at
      END
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_slots(uuid, uuid, uuid, uuid, date, date, integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_slots(uuid, uuid, uuid, uuid, date, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_appointment_secure(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, integer, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment_secure(uuid, uuid, timestamptz, uuid, uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_appointment_secure(uuid, uuid, text, public.appointment_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_appointment_secure(uuid, text, public.appointment_status) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reassign_appointment_professional_secure(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_appointment_secure(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_appointment_status_secure(uuid, uuid, public.appointment_status) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, uuid, date, date, integer, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, uuid, date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_appointment_secure(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, integer, uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_secure(uuid, uuid, timestamptz, uuid, uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_secure(uuid, uuid, text, public.appointment_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_secure(uuid, text, public.appointment_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_appointment_professional_secure(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_secure(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_appointment_status_secure(uuid, uuid, public.appointment_status) TO authenticated, service_role;

-- SECURITY INVOKER RPCs require the caller to hold the underlying table
-- privileges. RLS remains authoritative for authenticated users and
-- service_role retains its normal bypass-RLS behavior.
GRANT SELECT ON TABLE
  public.clinic_locations,
  public.professionals,
  public.professional_locations,
  public.professional_treatments,
  public.professional_health_insurances,
  public.health_insurances,
  public.professional_settings,
  public.treatments,
  public.professional_availability,
  public.appointment_blocks,
  public.patients,
  public.leads
TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.appointments
TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid, text, uuid) IS
  'Canonical duration authority for private and insurance appointments.';
COMMENT ON FUNCTION public.get_available_slots(uuid, uuid, uuid, uuid, date, date, integer, text, uuid) IS
  'Canonical modality-aware availability engine. PostgreSQL resolves duration.';
COMMENT ON FUNCTION public.reschedule_appointment_secure(uuid, uuid, timestamptz, uuid, uuid, text, integer, text) IS
  'Tenant-explicit reschedule that preserves billing metadata and re-resolves duration.';
COMMENT ON FUNCTION public.reassign_appointment_professional_secure(uuid, uuid, uuid) IS
  'Tenant-explicit professional reassignment; start is preserved and end/duration are recalculated.';
COMMENT ON FUNCTION public.confirm_appointment_secure(uuid, uuid) IS
  'Tenant-explicit canonical appointment confirmation.';
COMMENT ON FUNCTION public.transition_appointment_status_secure(uuid, uuid, public.appointment_status) IS
  'Controlled tenant-explicit transition: confirmed to in_progress to completed.';
