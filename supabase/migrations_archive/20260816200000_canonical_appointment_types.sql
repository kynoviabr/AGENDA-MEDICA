-- Canonical Aura appointment taxonomy. appointment_type becomes the source of
-- truth for new records. consultation_type remains nullable for compatibility
-- with the first-visit rollout and is not backfilled.

CREATE OR REPLACE FUNCTION public.resolve_appointment_type_terms(
  p_clinic_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_billing_type text,
  p_health_insurance_id uuid,
  p_appointment_type text
) RETURNS TABLE(price numeric, duration_minutes integer, terms_source text)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duration integer;
  v_price numeric;
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

  IF p_appointment_type = 'first_visit' AND p_billing_type = 'private' THEN
    RETURN QUERY
      SELECT terms.price, terms.duration_minutes, terms.terms_source
      FROM public.resolve_private_consultation_terms(p_clinic_id,p_professional_id,'first_visit') terms;
    RETURN;
  END IF;

  IF p_appointment_type = 'procedure' THEN
    SELECT COALESCE(pt.duration_minutes,t.duration_minutes,ps.default_appointment_duration_minutes,30),
           CASE WHEN p_billing_type='private' THEN COALESCE(pt.private_price,t.price) ELSE NULL END
      INTO v_duration,v_price
    FROM public.professionals professional
    LEFT JOIN public.professional_settings ps
      ON ps.clinic_id=professional.clinic_id AND ps.professional_id=professional.id
    JOIN public.treatments t
      ON t.clinic_id=professional.clinic_id AND t.id=p_treatment_id AND t.is_active
    JOIN public.professional_treatments pt
      ON pt.clinic_id=professional.clinic_id AND pt.professional_id=professional.id
     AND pt.treatment_id=t.id AND pt.status='active'
    WHERE professional.clinic_id=p_clinic_id AND professional.id=p_professional_id;
    IF v_duration IS NULL THEN RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE='23503'; END IF;
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
DECLARE v_duration integer; v_end timestamptz; v_result public.appointments; v_consultation_type text;
BEGIN
  IF p_appointment_type NOT IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_APPOINTMENT_TYPE' USING ERRCODE='22023';
  END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_patient_id IS NULL AND p_lead_id IS NULL THEN RAISE EXCEPTION 'AGENDA_PATIENT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id=p_patient_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_PATIENT_INVALID' USING ERRCODE='23503'; END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id=p_lead_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_LEAD_INVALID' USING ERRCODE='23503'; END IF;
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id,p_appointment_type
  ) terms;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  v_consultation_type:=CASE p_appointment_type WHEN 'first_visit' THEN 'first_visit' WHEN 'consultation' THEN 'standard' ELSE NULL END;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,p_location_id,p_professional_id,p_treatment_id,p_start_time,v_end,NULL);
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,start_time,end_time,
    scheduled_at,duration_minutes,appointment_type,consultation_type,notes,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,p_location_id,p_professional_id,p_patient_id,p_lead_id,p_treatment_id,p_start_time,v_end,
    p_start_time,v_duration,p_appointment_type,v_consultation_type,p_notes,(SELECT auth.uid()),p_billing_type,
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
  v_professional_id:=COALESCE(p_professional_id,v_old.professional_id); v_location_id:=COALESCE(p_location_id,v_old.location_id);
  IF v_old.appointment_type IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN
    SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
      p_clinic_id,v_professional_id,v_old.treatment_id,v_old.billing_type,v_old.health_insurance_id,v_old.appointment_type
    ) terms;
  ELSE
    v_duration:=v_old.duration_minutes;
  END IF;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,v_location_id,v_professional_id,v_old.treatment_id,p_start_time,v_end,v_old.id);
  UPDATE public.appointments SET status='rescheduled',cancelled_reason=p_reason WHERE id=v_old.id AND clinic_id=p_clinic_id;
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,contract_id,contract_item_id,
    start_time,end_time,scheduled_at,duration_minutes,appointment_type,consultation_type,notes,status,
    credit_check_required,credit_check_status,rescheduled_from,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,v_location_id,v_professional_id,v_old.patient_id,v_old.lead_id,v_old.treatment_id,v_old.contract_id,v_old.contract_item_id,
    p_start_time,v_end,p_start_time,v_duration,v_old.appointment_type,v_old.consultation_type,COALESCE(p_notes,v_old.notes),'scheduled',
    v_old.credit_check_required,v_old.credit_check_status,v_old.id,(SELECT auth.uid()),v_old.billing_type,v_old.health_insurance_id
  ) RETURNING * INTO v_new;
  UPDATE public.appointments SET rescheduled_to=v_new.id WHERE id=v_old.id AND clinic_id=p_clinic_id;
  RETURN v_new;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END
$$;

REVOKE ALL ON FUNCTION public.resolve_appointment_type_terms(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_available_slots_for_appointment_type(uuid,uuid,uuid,uuid,date,date,integer,text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_appointment_with_type_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_type_terms(uuid,uuid,uuid,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_appointment_type(uuid,uuid,uuid,uuid,date,date,integer,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_type_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,text,uuid) TO authenticated,service_role;

COMMENT ON COLUMN public.appointments.appointment_type IS 'Canonical Aura appointment type for new records. Legacy values remain untouched and unclassified.';
COMMENT ON COLUMN public.appointments.consultation_type IS 'Deprecated compatibility detail for the first-visit rollout. appointment_type is canonical for new records.';
