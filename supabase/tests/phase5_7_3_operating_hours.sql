-- Phase 5.7.3 authoritative operating-hours tests. All fixtures are rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  clinic_a constant uuid := '71000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '71000000-0000-0000-0000-000000000002';
  professional_a constant uuid := '72000000-0000-0000-0000-000000000001';
  location_a uuid;
  location_b uuid;
  slot_count integer;
BEGIN
  INSERT INTO public.clinics(id, name, slug) VALUES
    (clinic_a, 'Operating Hours Clinic A', 'operating-hours-a'),
    (clinic_b, 'Operating Hours Clinic B', 'operating-hours-b');
  SELECT id INTO location_a FROM public.clinic_locations WHERE clinic_id = clinic_a AND is_primary;
  SELECT id INTO location_b FROM public.clinic_locations WHERE clinic_id = clinic_b AND is_primary;

  UPDATE public.clinic_locations SET opening_hours = jsonb_build_object(
    'schemaVersion', 1,
    'weekdays', jsonb_build_object(
      '1', jsonb_build_array(
        jsonb_build_object('start', '08:00', 'end', '12:00'),
        jsonb_build_object('start', '13:00', 'end', '18:00')
      ),
      '2', jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00')),
      '3', jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00')),
      '4', jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00')),
      '5', jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00'))
    )
  ) WHERE id = location_a;

  INSERT INTO public.professionals(id, clinic_id, user_id, full_name, status)
  VALUES (professional_a, clinic_a, NULL, 'Professional Operating Hours', 'active');
  INSERT INTO public.professional_locations(clinic_id, professional_id, location_id)
  VALUES (clinic_a, professional_a, location_a);
  INSERT INTO public.professional_availability(clinic_id, location_id, professional_id, day_of_week, start_time, end_time)
  VALUES
    (clinic_a, location_a, professional_a, 1, '07:00', '12:00'),
    (clinic_a, location_a, professional_a, 1, '13:00', '16:00');

  IF (SELECT jsonb_agg(jsonb_build_object('start', start_time, 'end', end_time) ORDER BY start_time)
      FROM public.get_effective_working_periods(clinic_a, location_a, professional_a, DATE '2026-08-17'))
      <> '[{"end": "12:00:00", "start": "08:00:00"}, {"end": "16:00:00", "start": "13:00:00"}]'::jsonb THEN
    RAISE EXCEPTION 'TEST_FAILED: clinic/professional intersection or split hours';
  END IF;

  SELECT count(*) INTO slot_count FROM public.get_available_slots(
    clinic_a, location_a, professional_a, NULL, DATE '2026-08-17', DATE '2026-08-17', 30, 'private', NULL
  );
  IF slot_count = 0 OR EXISTS (
    SELECT 1 FROM public.get_available_slots(clinic_a, location_a, professional_a, NULL, DATE '2026-08-17', DATE '2026-08-17', 30, 'private', NULL)
    WHERE (start_time AT TIME ZONE 'America/Sao_Paulo')::time >= TIME '12:00'
      AND (start_time AT TIME ZONE 'America/Sao_Paulo')::time < TIME '13:00'
  ) THEN RAISE EXCEPTION 'TEST_FAILED: lunch interval availability'; END IF;

  INSERT INTO public.scheduling_exceptions(clinic_id, location_id, exception_date, is_closed, kind, reason)
  VALUES (clinic_a, location_a, DATE '2026-08-17', true, 'holiday', 'Synthetic holiday');
  IF EXISTS (SELECT 1 FROM public.get_available_slots(
    clinic_a, location_a, professional_a, NULL, DATE '2026-08-17', DATE '2026-08-17', 30, 'private', NULL
  )) THEN RAISE EXCEPTION 'TEST_FAILED: closed holiday returned slots'; END IF;

  UPDATE public.scheduling_exceptions SET is_closed = false,
    periods = '[{"start":"10:00","end":"14:00"}]'::jsonb, kind = 'special_hours'
  WHERE clinic_id = clinic_a AND location_id = location_a AND exception_date = DATE '2026-08-17' AND professional_id IS NULL;
  IF NOT EXISTS (SELECT 1 FROM public.get_effective_working_periods(clinic_a, location_a, professional_a, DATE '2026-08-17')) THEN
    RAISE EXCEPTION 'TEST_FAILED: special hours removed all effective periods';
  END IF;

  INSERT INTO public.scheduling_exceptions(clinic_id, location_id, professional_id, exception_date, is_closed, kind)
  VALUES (clinic_a, location_a, professional_a, DATE '2026-08-17', true, 'day_off');
  IF public.get_schedule_restriction_reason(clinic_a, location_a, professional_a, DATE '2026-08-17') <> 'professional_not_working' THEN
    RAISE EXCEPTION 'TEST_FAILED: professional day-off reason';
  END IF;

  BEGIN
    UPDATE public.clinic_locations SET opening_hours = '{"schemaVersion":1,"weekdays":{"1":[{"start":"12:00","end":"08:00"}]}}'::jsonb WHERE id = location_a;
    RAISE EXCEPTION 'TEST_FAILED: invalid opening hours accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  BEGIN
    INSERT INTO public.professional_availability(clinic_id, location_id, professional_id, day_of_week, start_time, end_time)
    VALUES (clinic_a, location_a, professional_a, 1, '11:00', '14:00');
    RAISE EXCEPTION 'TEST_FAILED: overlapping professional periods accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_exceptions(clinic_id, location_id, professional_id, exception_date, is_closed, kind)
    VALUES (clinic_b, location_b, professional_a, DATE '2026-08-18', true, 'day_off');
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant professional exception accepted';
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
