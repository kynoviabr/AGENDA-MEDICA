-- Phase 5: centralized availability and transactional appointment operations.
-- The database is the final authority for availability and concurrent booking.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
DECLARE conflicts jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('first_id', a.id, 'second_id', b.id,
    'professional_id', a.professional_id, 'first_start', a.start_time,
    'second_start', b.start_time))
  INTO conflicts
  FROM public.appointments a
  JOIN public.appointments b ON a.id < b.id
    AND a.professional_id = b.professional_id
    AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(b.start_time, b.end_time, '[)')
  WHERE a.status IN ('scheduled','confirmed','in_progress')
    AND b.status IN ('scheduled','confirmed','in_progress');

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE5_EXISTING_APPOINTMENT_CONFLICTS: %', conflicts USING ERRCODE='P0001';
  END IF;
END $$;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_valid_period CHECK (end_time > start_time);
ALTER TABLE public.appointment_blocks
  ADD CONSTRAINT appointment_blocks_valid_period CHECK (end_at > start_at);
ALTER TABLE public.professional_availability
  ADD CONSTRAINT professional_availability_valid_period CHECK (end_time > start_time);

ALTER TABLE public.professional_availability
  ADD COLUMN valid_from date,
  ADD COLUMN valid_until date,
  ADD CONSTRAINT professional_availability_valid_dates
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_professional_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (professional_id IS NOT NULL AND status IN ('scheduled','confirmed','in_progress'));

CREATE INDEX appointments_active_interval
  ON public.appointments (clinic_id, professional_id, start_time, end_time)
  WHERE status IN ('scheduled','confirmed','in_progress');
CREATE INDEX appointment_blocks_interval
  ON public.appointment_blocks (clinic_id, location_id, professional_id, start_at, end_at);
CREATE INDEX professional_availability_lookup
  ON public.professional_availability
  (clinic_id, location_id, professional_id, day_of_week, valid_from, valid_until)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.resolve_appointment_duration(
  p_clinic_id uuid, p_professional_id uuid, p_treatment_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(
    (SELECT pt.duration_minutes FROM public.professional_treatments pt
      WHERE pt.clinic_id=p_clinic_id AND pt.professional_id=p_professional_id
        AND pt.treatment_id=p_treatment_id AND pt.status='active' LIMIT 1),
    (SELECT t.duration_minutes FROM public.treatments t
      WHERE t.clinic_id=p_clinic_id AND t.id=p_treatment_id AND t.is_active LIMIT 1),
    (SELECT ps.default_appointment_duration_minutes FROM public.professional_settings ps
      WHERE ps.clinic_id=p_clinic_id AND ps.professional_id=p_professional_id LIMIT 1),
    30
  )::integer
$$;

CREATE OR REPLACE FUNCTION public.assert_appointment_slot(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_treatment_id uuid, p_start_time timestamptz, p_end_time timestamptz,
  p_ignore_appointment_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_timezone text; v_local_start timestamp; v_local_end timestamp;
BEGIN
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_professional_id IS NULL THEN RAISE EXCEPTION 'AGENDA_PROFESSIONAL_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'AGENDA_INVALID_PERIOD' USING ERRCODE='22023'; END IF;

  SELECT l.timezone INTO v_timezone FROM public.clinic_locations l
   WHERE l.id=p_location_id AND l.clinic_id=p_clinic_id AND l.active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations pl
    WHERE pl.clinic_id=p_clinic_id AND pl.location_id=p_location_id
      AND pl.professional_id=p_professional_id AND pl.active) THEN
    RAISE EXCEPTION 'AGENDA_PROFESSIONAL_NOT_AT_LOCATION' USING ERRCODE='23503';
  END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_treatments pt
    WHERE pt.clinic_id=p_clinic_id AND pt.professional_id=p_professional_id
      AND pt.treatment_id=p_treatment_id AND pt.status='active') THEN
    RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE='23503';
  END IF;

  v_local_start := p_start_time AT TIME ZONE v_timezone;
  v_local_end := p_end_time AT TIME ZONE v_timezone;
  IF v_local_start::date <> (v_local_end - interval '1 microsecond')::date OR NOT EXISTS (
    SELECT 1 FROM public.professional_availability a
    WHERE a.clinic_id=p_clinic_id AND a.location_id=p_location_id
      AND a.professional_id=p_professional_id AND a.is_active
      AND a.day_of_week=EXTRACT(DOW FROM v_local_start)::integer
      AND (a.valid_from IS NULL OR a.valid_from <= v_local_start::date)
      AND (a.valid_until IS NULL OR a.valid_until >= v_local_start::date)
      AND a.start_time <= v_local_start::time AND a.end_time >= v_local_end::time
  ) THEN RAISE EXCEPTION 'AGENDA_OUTSIDE_AVAILABILITY' USING ERRCODE='P0001'; END IF;

  IF EXISTS (SELECT 1 FROM public.appointment_blocks b
    WHERE b.clinic_id=p_clinic_id AND b.location_id=p_location_id
      AND (b.professional_id IS NULL OR b.professional_id=p_professional_id)
      AND tstzrange(b.start_at,b.end_at,'[)') && tstzrange(p_start_time,p_end_time,'[)')) THEN
    RAISE EXCEPTION 'AGENDA_BLOCKED' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointments a
    WHERE a.professional_id=p_professional_id AND a.status IN ('scheduled','confirmed','in_progress')
      AND (p_ignore_appointment_id IS NULL OR a.id<>p_ignore_appointment_id)
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(p_start_time,p_end_time,'[)')) THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_treatment_id uuid, p_date_from date, p_date_to date,
  p_step_minutes integer DEFAULT 15
) RETURNS TABLE(start_time timestamptz,end_time timestamptz,duration_minutes integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_timezone text; v_duration integer;
BEGIN
  IF p_date_to < p_date_from OR p_date_to > p_date_from + 120 THEN RAISE EXCEPTION 'AGENDA_INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
  IF p_step_minutes < 5 OR p_step_minutes > 60 THEN RAISE EXCEPTION 'AGENDA_INVALID_STEP' USING ERRCODE='22023'; END IF;
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT timezone INTO v_timezone FROM public.clinic_locations WHERE id=p_location_id AND clinic_id=p_clinic_id AND active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations WHERE clinic_id=p_clinic_id AND location_id=p_location_id AND professional_id=p_professional_id AND active) THEN RETURN; END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_treatments WHERE clinic_id=p_clinic_id AND professional_id=p_professional_id AND treatment_id=p_treatment_id AND status='active') THEN RETURN; END IF;
  v_duration := public.resolve_appointment_duration(p_clinic_id,p_professional_id,p_treatment_id);

  RETURN QUERY
  WITH windows AS (
    SELECT a.*, d::date AS local_date,
      ((d::date + a.start_time) AT TIME ZONE v_timezone) AS window_start,
      ((d::date + a.end_time) AT TIME ZONE v_timezone) AS window_end
    FROM generate_series(p_date_from::timestamp,p_date_to::timestamp,interval '1 day') d
    JOIN public.professional_availability a ON a.clinic_id=p_clinic_id
      AND a.location_id=p_location_id AND a.professional_id=p_professional_id
      AND a.is_active AND a.day_of_week=EXTRACT(DOW FROM d)::integer
      AND (a.valid_from IS NULL OR a.valid_from<=d::date)
      AND (a.valid_until IS NULL OR a.valid_until>=d::date)
  ), candidates AS (
    SELECT gs AS candidate_start, gs + make_interval(mins=>v_duration) AS candidate_end
    FROM windows w CROSS JOIN LATERAL generate_series(
      w.window_start, w.window_end-make_interval(mins=>v_duration), make_interval(mins=>p_step_minutes)
    ) gs
  )
  SELECT c.candidate_start,c.candidate_end,v_duration
  FROM candidates c
  WHERE NOT EXISTS (SELECT 1 FROM public.appointments a
    WHERE a.professional_id=p_professional_id AND a.status IN ('scheduled','confirmed','in_progress')
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(c.candidate_start,c.candidate_end,'[)'))
    AND NOT EXISTS (SELECT 1 FROM public.appointment_blocks b
      WHERE b.clinic_id=p_clinic_id AND b.location_id=p_location_id
        AND (b.professional_id IS NULL OR b.professional_id=p_professional_id)
        AND tstzrange(b.start_at,b.end_at,'[)') && tstzrange(c.candidate_start,c.candidate_end,'[)'))
  ORDER BY c.candidate_start;
END $$;

CREATE OR REPLACE FUNCTION public.create_appointment_secure(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_patient_id uuid, p_lead_id uuid, p_treatment_id uuid,
  p_start_time timestamptz, p_appointment_type text DEFAULT 'treatment_session',
  p_notes text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL,
  p_contract_id uuid DEFAULT NULL, p_contract_item_id uuid DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_duration integer; v_end timestamptz; v_result public.appointments;
BEGIN
  v_duration:=COALESCE(p_duration_minutes,public.resolve_appointment_duration(p_clinic_id,p_professional_id,p_treatment_id));
  IF v_duration < 5 OR v_duration > 480 THEN RAISE EXCEPTION 'AGENDA_INVALID_DURATION' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,p_location_id,p_professional_id,p_treatment_id,p_start_time,v_end,NULL);
  INSERT INTO public.appointments(clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,
    contract_id,contract_item_id,start_time,end_time,scheduled_at,duration_minutes,appointment_type,notes,created_by)
  VALUES(p_clinic_id,p_location_id,p_professional_id,p_patient_id,p_lead_id,p_treatment_id,
    p_contract_id,p_contract_item_id,p_start_time,v_end,p_start_time,v_duration,p_appointment_type,p_notes,(SELECT auth.uid()))
  RETURNING * INTO v_result;
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END $$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_secure(
  p_appointment_id uuid, p_start_time timestamptz,
  p_professional_id uuid DEFAULT NULL, p_location_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL,
  p_reason text DEFAULT 'Remarcado'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_old public.appointments; v_new public.appointments; v_prof uuid; v_loc uuid; v_duration integer; v_end timestamptz;
BEGIN
  SELECT * INTO v_old FROM public.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),v_old.clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_old.status NOT IN ('scheduled','confirmed','in_progress') THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  v_prof:=COALESCE(p_professional_id,v_old.professional_id); v_loc:=COALESCE(p_location_id,v_old.location_id);
  v_duration:=COALESCE(p_duration_minutes,public.resolve_appointment_duration(v_old.clinic_id,v_prof,v_old.treatment_id));
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_prof::text,0));
  PERFORM public.assert_appointment_slot(v_old.clinic_id,v_loc,v_prof,v_old.treatment_id,p_start_time,v_end,v_old.id);
  UPDATE public.appointments SET status='rescheduled',cancelled_reason=p_reason WHERE id=v_old.id;
  INSERT INTO public.appointments(clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,contract_id,contract_item_id,
    start_time,end_time,scheduled_at,duration_minutes,appointment_type,notes,status,credit_check_required,credit_check_status,rescheduled_from,created_by)
  VALUES(v_old.clinic_id,v_loc,v_prof,v_old.patient_id,v_old.lead_id,v_old.treatment_id,v_old.contract_id,v_old.contract_item_id,
    p_start_time,v_end,p_start_time,v_duration,v_old.appointment_type,COALESCE(p_notes,v_old.notes),'scheduled',v_old.credit_check_required,v_old.credit_check_status,v_old.id,(SELECT auth.uid()))
  RETURNING * INTO v_new;
  UPDATE public.appointments SET rescheduled_to=v_new.id WHERE id=v_old.id;
  RETURN v_new;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END $$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_secure(
  p_appointment_id uuid, p_reason text, p_status public.appointment_status DEFAULT 'cancelled'
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_result public.appointments;
BEGIN
  IF p_status NOT IN ('cancelled','no_show') THEN RAISE EXCEPTION 'AGENDA_INVALID_CANCELLATION_STATUS' USING ERRCODE='22023'; END IF;
  UPDATE public.appointments SET status=p_status,
    cancelled_reason=CASE WHEN p_status='cancelled' THEN p_reason ELSE cancelled_reason END,
    no_show_reason=CASE WHEN p_status='no_show' THEN p_reason ELSE no_show_reason END
  WHERE id=p_appointment_id AND (current_user='service_role' OR public.is_clinic_staff((SELECT auth.uid()),clinic_id))
    AND status IN ('scheduled','confirmed','in_progress') RETURNING * INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE_OR_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.reassign_appointment_professional_secure(
  p_appointment_id uuid, p_professional_id uuid
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_old public.appointments; v_result public.appointments;
BEGIN
  SELECT * INTO v_old FROM public.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),v_old.clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_old.status NOT IN ('scheduled','confirmed','in_progress') THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(v_old.clinic_id,v_old.location_id,p_professional_id,v_old.treatment_id,v_old.start_time,v_old.end_time,v_old.id);
  UPDATE public.appointments SET professional_id=p_professional_id WHERE id=v_old.id RETURNING * INTO v_result;
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END $$;

REVOKE ALL ON FUNCTION public.resolve_appointment_duration(uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.assert_appointment_slot(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_available_slots(uuid,uuid,uuid,uuid,date,date,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_appointment_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment_secure(uuid,timestamptz,uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_appointment_secure(uuid,text,public.appointment_status) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reassign_appointment_professional_secure(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_duration(uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assert_appointment_slot(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid,uuid,uuid,uuid,date,date,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_appointment_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_secure(uuid,timestamptz,uuid,uuid,text,integer,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_secure(uuid,text,public.appointment_status) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reassign_appointment_professional_secure(uuid,uuid) TO authenticated,service_role;

COMMENT ON CONSTRAINT appointments_no_professional_overlap ON public.appointments IS
  'Phase 5 concurrency authority: active appointments for a professional may not overlap, including across clinic locations.';
COMMENT ON FUNCTION public.get_available_slots(uuid,uuid,uuid,uuid,date,date,integer) IS
  'Canonical availability engine. Uses the clinic location timezone and a documented 15-minute default grid.';
