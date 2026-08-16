-- Phase 5.7.3: Aura-owned operating hours, date exceptions and authoritative availability.
-- Weekday convention is PostgreSQL EXTRACT(DOW): 0=Sunday ... 6=Saturday.

ALTER TABLE public.clinic_locations
  ADD COLUMN hide_closed_days boolean NOT NULL DEFAULT true,
  ADD COLUMN limit_calendar_to_operating_hours boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.schedule_periods_are_valid(p_periods jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period jsonb;
BEGIN
  IF jsonb_typeof(p_periods) <> 'array' OR jsonb_array_length(p_periods) > 6 THEN
    RETURN false;
  END IF;

  FOR v_period IN SELECT value FROM jsonb_array_elements(p_periods)
  LOOP
    IF jsonb_typeof(v_period) <> 'object'
       OR COALESCE(v_period->>'start', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       OR COALESCE(v_period->>'end', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_period->>'end')::time <= (v_period->>'start')::time THEN
      RETURN false;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_periods) WITH ORDINALITY first_period(value, position)
    JOIN jsonb_array_elements(p_periods) WITH ORDINALITY second_period(value, position)
      ON first_period.position < second_period.position
    WHERE (first_period.value->>'start')::time < (second_period.value->>'end')::time
      AND (second_period.value->>'start')::time < (first_period.value->>'end')::time
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION public.location_opening_hours_are_valid(p_hours jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry record;
BEGIN
  IF p_hours IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p_hours) <> 'object'
     OR p_hours->>'schemaVersion' <> '1'
     OR jsonb_typeof(p_hours->'weekdays') <> 'object' THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT key, value FROM jsonb_each(p_hours->'weekdays')
  LOOP
    IF v_entry.key !~ '^[0-6]$' OR NOT public.schedule_periods_are_valid(v_entry.value) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_location_schedule_configuration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'AGENDA_INVALID_TIMEZONE' USING ERRCODE = '22023';
  END IF;
  IF NOT public.location_opening_hours_are_valid(NEW.opening_hours) THEN
    RAISE EXCEPTION 'AGENDA_INVALID_OPENING_HOURS' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER validate_location_schedule_configuration
  BEFORE INSERT OR UPDATE OF timezone, opening_hours ON public.clinic_locations
  FOR EACH ROW EXECUTE FUNCTION public.validate_location_schedule_configuration();

CREATE TABLE public.scheduling_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  professional_id uuid,
  exception_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  periods jsonb,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('holiday', 'day_off', 'special_hours', 'other')),
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_exceptions_location_tenant_fk
    FOREIGN KEY (clinic_id, location_id) REFERENCES public.clinic_locations(clinic_id, id) ON DELETE CASCADE,
  CONSTRAINT scheduling_exceptions_professional_tenant_fk
    FOREIGN KEY (professional_id, clinic_id) REFERENCES public.professionals(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT scheduling_exceptions_reason_size CHECK (reason IS NULL OR char_length(reason) <= 500),
  CONSTRAINT scheduling_exceptions_periods_shape CHECK (
    (is_closed AND (periods IS NULL OR periods = '[]'::jsonb))
    OR (NOT is_closed AND periods IS NOT NULL AND jsonb_array_length(periods) > 0
        AND public.schedule_periods_are_valid(periods))
  )
);

CREATE UNIQUE INDEX scheduling_exceptions_location_date
  ON public.scheduling_exceptions (clinic_id, location_id, exception_date)
  WHERE professional_id IS NULL;
CREATE UNIQUE INDEX scheduling_exceptions_professional_date
  ON public.scheduling_exceptions (clinic_id, location_id, professional_id, exception_date)
  WHERE professional_id IS NOT NULL;
CREATE INDEX scheduling_exceptions_lookup
  ON public.scheduling_exceptions (clinic_id, location_id, exception_date, professional_id);

CREATE TRIGGER enforce_schedule_exception_professional_location
  BEFORE INSERT OR UPDATE OF clinic_id, location_id, professional_id ON public.scheduling_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_serves_location();
CREATE TRIGGER update_scheduling_exceptions_updated_at
  BEFORE UPDATE ON public.scheduling_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scheduling_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views scheduling exceptions"
  ON public.scheduling_exceptions FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Admin manages scheduling exceptions"
  ON public.scheduling_exceptions FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_exceptions TO authenticated;
GRANT ALL ON public.scheduling_exceptions TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_professional_availability_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM public.professional_availability existing
    WHERE existing.id <> NEW.id
      AND existing.clinic_id = NEW.clinic_id
      AND existing.location_id = NEW.location_id
      AND existing.professional_id = NEW.professional_id
      AND existing.day_of_week = NEW.day_of_week
      AND existing.is_active
      AND existing.start_time < NEW.end_time
      AND NEW.start_time < existing.end_time
      AND (existing.valid_until IS NULL OR NEW.valid_from IS NULL OR existing.valid_until >= NEW.valid_from)
      AND (NEW.valid_until IS NULL OR existing.valid_from IS NULL OR NEW.valid_until >= existing.valid_from)
  ) THEN
    RAISE EXCEPTION 'AGENDA_AVAILABILITY_OVERLAP' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER prevent_professional_availability_overlap
  BEFORE INSERT OR UPDATE OF clinic_id, location_id, professional_id, day_of_week,
    start_time, end_time, valid_from, valid_until, is_active
  ON public.professional_availability
  FOR EACH ROW EXECUTE FUNCTION public.prevent_professional_availability_overlap();

CREATE OR REPLACE FUNCTION public.get_location_operating_periods(
  p_clinic_id uuid, p_location_id uuid, p_date date
) RETURNS TABLE(start_time time, end_time time, source text)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exception public.scheduling_exceptions;
  v_periods jsonb;
BEGIN
  SELECT * INTO v_exception
  FROM public.scheduling_exceptions e
  WHERE e.clinic_id = p_clinic_id AND e.location_id = p_location_id
    AND e.professional_id IS NULL AND e.exception_date = p_date;

  IF FOUND THEN
    IF v_exception.is_closed THEN RETURN; END IF;
    v_periods := v_exception.periods;
    RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'location_exception'::text
      FROM jsonb_array_elements(v_periods) ORDER BY (value->>'start')::time;
    RETURN;
  END IF;

  SELECT l.opening_hours->'weekdays'->(EXTRACT(DOW FROM p_date)::integer)::text
    INTO v_periods
  FROM public.clinic_locations l
  WHERE l.clinic_id = p_clinic_id AND l.id = p_location_id AND l.active
    AND public.location_opening_hours_are_valid(l.opening_hours);

  IF v_periods IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'location_recurring'::text
    FROM jsonb_array_elements(v_periods) ORDER BY (value->>'start')::time;
END
$$;

CREATE OR REPLACE FUNCTION public.get_professional_working_periods(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid, p_date date
) RETURNS TABLE(start_time time, end_time time, source text)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exception public.scheduling_exceptions;
BEGIN
  SELECT * INTO v_exception
  FROM public.scheduling_exceptions e
  WHERE e.clinic_id = p_clinic_id AND e.location_id = p_location_id
    AND e.professional_id = p_professional_id AND e.exception_date = p_date;

  IF FOUND THEN
    IF v_exception.is_closed THEN RETURN; END IF;
    RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'professional_exception'::text
      FROM jsonb_array_elements(v_exception.periods) ORDER BY (value->>'start')::time;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.start_time, a.end_time, 'professional_recurring'::text
  FROM public.professional_availability a
  WHERE a.clinic_id = p_clinic_id AND a.location_id = p_location_id
    AND a.professional_id = p_professional_id AND a.is_active
    AND a.day_of_week = EXTRACT(DOW FROM p_date)::integer
    AND (a.valid_from IS NULL OR a.valid_from <= p_date)
    AND (a.valid_until IS NULL OR a.valid_until >= p_date)
  ORDER BY a.start_time;
END
$$;

CREATE OR REPLACE FUNCTION public.get_effective_working_periods(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid, p_date date
) RETURNS TABLE(start_time time, end_time time)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(location_period.start_time, professional_period.start_time),
         LEAST(location_period.end_time, professional_period.end_time)
  FROM public.get_location_operating_periods(p_clinic_id, p_location_id, p_date) location_period
  CROSS JOIN public.get_professional_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date) professional_period
  WHERE GREATEST(location_period.start_time, professional_period.start_time)
        < LEAST(location_period.end_time, professional_period.end_time)
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_schedule_restriction_reason(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid, p_date date
) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.get_location_operating_periods(p_clinic_id, p_location_id, p_date))
      THEN 'location_closed'
    WHEN NOT EXISTS (SELECT 1 FROM public.get_professional_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date))
      THEN 'professional_not_working'
    WHEN NOT EXISTS (SELECT 1 FROM public.get_effective_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date))
      THEN 'operating_hours_restriction'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_appointment_slot(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_treatment_id uuid, p_start_time timestamptz, p_end_time timestamptz,
  p_ignore_appointment_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
BEGIN
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_professional_id IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'AGENDA_INVALID_PERIOD' USING ERRCODE = '22023';
  END IF;

  SELECT l.timezone INTO v_timezone FROM public.clinic_locations l
  WHERE l.id = p_location_id AND l.clinic_id = p_clinic_id AND l.active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations pl WHERE pl.clinic_id = p_clinic_id
    AND pl.location_id = p_location_id AND pl.professional_id = p_professional_id AND pl.active) THEN
    RAISE EXCEPTION 'AGENDA_PROFESSIONAL_NOT_AT_LOCATION' USING ERRCODE = '23503';
  END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_treatments pt
    WHERE pt.clinic_id = p_clinic_id AND pt.professional_id = p_professional_id
      AND pt.treatment_id = p_treatment_id AND pt.status = 'active') THEN
    RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE = '23503';
  END IF;

  v_local_start := p_start_time AT TIME ZONE v_timezone;
  v_local_end := p_end_time AT TIME ZONE v_timezone;
  IF v_local_start::date <> (v_local_end - interval '1 microsecond')::date OR NOT EXISTS (
    SELECT 1 FROM public.get_effective_working_periods(
      p_clinic_id, p_location_id, p_professional_id, v_local_start::date
    ) period
    WHERE period.start_time <= v_local_start::time AND period.end_time >= v_local_end::time
  ) THEN
    RAISE EXCEPTION 'AGENDA_OUTSIDE_OPERATING_HOURS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.appointment_blocks b WHERE b.clinic_id = p_clinic_id
    AND b.location_id = p_location_id AND (b.professional_id IS NULL OR b.professional_id = p_professional_id)
    AND tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')) THEN
    RAISE EXCEPTION 'AGENDA_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointments a WHERE a.professional_id = p_professional_id
    AND a.status IN ('scheduled', 'confirmed', 'in_progress')
    AND (p_ignore_appointment_id IS NULL OR a.id <> p_ignore_appointment_id)
    AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')) THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid, p_treatment_id uuid,
  p_date_from date, p_date_to date, p_step_minutes integer,
  p_billing_type text, p_health_insurance_id uuid
) RETURNS TABLE(start_time timestamptz, end_time timestamptz, duration_minutes integer)
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
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT l.timezone INTO v_timezone FROM public.clinic_locations l
  WHERE l.id = p_location_id AND l.clinic_id = p_clinic_id AND l.active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations pl WHERE pl.clinic_id = p_clinic_id
    AND pl.location_id = p_location_id AND pl.professional_id = p_professional_id AND pl.active) THEN RETURN; END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_treatments pt
    WHERE pt.clinic_id = p_clinic_id AND pt.professional_id = p_professional_id
      AND pt.treatment_id = p_treatment_id AND pt.status = 'active') THEN RETURN; END IF;

  v_duration := public.resolve_appointment_duration(
    p_clinic_id, p_professional_id, p_treatment_id, p_billing_type, p_health_insurance_id
  );

  RETURN QUERY
  WITH dates AS (
    SELECT day::date AS local_date
    FROM generate_series(p_date_from::timestamp, p_date_to::timestamp, interval '1 day') day
  ), windows AS (
    SELECT dates.local_date,
      ((dates.local_date + period.start_time) AT TIME ZONE v_timezone) AS window_start,
      ((dates.local_date + period.end_time) AT TIME ZONE v_timezone) AS window_end
    FROM dates
    CROSS JOIN LATERAL public.get_effective_working_periods(
      p_clinic_id, p_location_id, p_professional_id, dates.local_date
    ) period
  ), candidates AS (
    SELECT slot_start AS candidate_start,
      slot_start + make_interval(mins => v_duration) AS candidate_end
    FROM windows
    CROSS JOIN LATERAL generate_series(
      window_start, window_end - make_interval(mins => v_duration), make_interval(mins => p_step_minutes)
    ) slot_start
  )
  SELECT candidate_start, candidate_end, v_duration
  FROM candidates candidate
  WHERE NOT EXISTS (SELECT 1 FROM public.appointments appointment
    WHERE appointment.professional_id = p_professional_id
      AND appointment.status IN ('scheduled', 'confirmed', 'in_progress')
      AND tstzrange(appointment.start_time, appointment.end_time, '[)')
          && tstzrange(candidate.candidate_start, candidate.candidate_end, '[)'))
    AND NOT EXISTS (SELECT 1 FROM public.appointment_blocks block
      WHERE block.clinic_id = p_clinic_id AND block.location_id = p_location_id
        AND (block.professional_id IS NULL OR block.professional_id = p_professional_id)
        AND tstzrange(block.start_at, block.end_at, '[)')
            && tstzrange(candidate.candidate_start, candidate.candidate_end, '[)'))
  ORDER BY candidate_start;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_location_operating_periods(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_professional_working_periods(uuid, uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_working_periods(uuid, uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_schedule_restriction_reason(uuid, uuid, uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_aura_pilot_snapshot(p_clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_settings public.whatsapp_ai_settings; v_result jsonb;
BEGIN
  IF NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN RAISE EXCEPTION 'AURA_PILOT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_settings FROM public.whatsapp_ai_settings WHERE clinic_id=p_clinic_id;
  SELECT jsonb_build_object(
    'databaseAvailable',true,
    'whatsappConfigured',EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE clinic_id=p_clinic_id AND status='connected'),
    'hasLocation',EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=p_clinic_id AND active),
    'hasProfessional',EXISTS(SELECT 1 FROM public.professionals WHERE clinic_id=p_clinic_id AND is_active),
    'hasService',EXISTS(SELECT 1 FROM public.treatments WHERE clinic_id=p_clinic_id AND is_active),
    'hasInsurance',EXISTS(SELECT 1 FROM public.health_insurances WHERE clinic_id=p_clinic_id AND is_active),
    'hasOperatingHours',EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=p_clinic_id AND active AND opening_hours IS NOT NULL AND public.location_opening_hours_are_valid(opening_hours)),
    'hasSchedulingRules',EXISTS(SELECT 1 FROM public.professional_availability WHERE clinic_id=p_clinic_id AND is_active),
    'authorizedStaffCount',(SELECT count(*) FROM public.user_roles WHERE clinic_id=p_clinic_id AND is_active),
    'publishedKnowledgeCount',(SELECT count(*) FROM public.administrative_knowledge_entries WHERE clinic_id=p_clinic_id AND status='published' AND verified_at IS NOT NULL),
    'gates',CASE WHEN v_settings.clinic_id IS NULL THEN jsonb_build_object(
      'clinicEnabled',false,'engineMode','legacy','readEnabled',false,'readValidated',false,
      'mutationEnabled',false,'knowledgeEnabled',false,'knowledgeValidated',false,
      'handoffEnabled',false,'handoffValidated',false
    ) ELSE jsonb_build_object(
      'clinicEnabled',v_settings.is_enabled,'engineMode',v_settings.ai_engine_mode,
      'readEnabled',v_settings.ai_read_tools_enabled,'readValidated',v_settings.ai_read_tools_validated_at IS NOT NULL,
      'mutationEnabled',v_settings.ai_mutation_tools_enabled,
      'knowledgeEnabled',v_settings.ai_knowledge_enabled,'knowledgeValidated',v_settings.ai_knowledge_validated_at IS NOT NULL,
      'handoffEnabled',v_settings.ai_handoff_enabled,'handoffValidated',v_settings.ai_handoff_validated_at IS NOT NULL)
    END
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_aura_pilot_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aura_pilot_snapshot(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.clinic_locations.opening_hours IS
  'Aura canonical weekly hours. Schema v1: {schemaVersion:1,weekdays:{"0".."6":[{start:"HH:mm",end:"HH:mm"}]}}.';
COMMENT ON TABLE public.scheduling_exceptions IS
  'Date-specific location/professional override. professional_id NULL means location-wide exception.';
COMMENT ON FUNCTION public.get_effective_working_periods(uuid, uuid, uuid, date) IS
  'Intersection of location hours and professional hours after date-specific exceptions.';
