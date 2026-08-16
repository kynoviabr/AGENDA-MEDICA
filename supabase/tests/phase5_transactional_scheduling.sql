-- Run with `supabase test db` against a disposable/local database.
-- Every fixture is rolled back.
BEGIN;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('service_role', 'public.appointments', 'SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.professional_availability', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.professional_availability', 'SELECT') THEN
    RAISE EXCEPTION 'TEST_FAILED: SECURITY INVOKER scheduling table grants are missing';
  END IF;
END
$$;

-- The local migration history does not grant DML on every legacy public table
-- to service_role. The fixtures exercise SECURITY INVOKER RPCs as service_role,
-- so grant access only inside this transaction; ROLLBACK removes these grants.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  c1 constant uuid := '51000000-0000-0000-0000-000000000001';
  c2 constant uuid := '51000000-0000-0000-0000-000000000002';
  p1 constant uuid := '52000000-0000-0000-0000-000000000001';
  t1 constant uuid := '53000000-0000-0000-0000-000000000001';
  l1 uuid; l2 uuid; a1 public.appointments; a2 public.appointments; slots integer;
BEGIN
  INSERT INTO public.clinics(id,name,slug) VALUES
    (c1,'Phase 5 Clinic A','phase5-test-a'),(c2,'Phase 5 Clinic B','phase5-test-b');
  SELECT id INTO l1 FROM public.clinic_locations WHERE clinic_id=c1 AND is_primary;
  INSERT INTO public.clinic_locations(clinic_id,name,timezone) VALUES(c1,'Unit 2','America/Sao_Paulo') RETURNING id INTO l2;
  UPDATE public.clinic_locations
  SET opening_hours = jsonb_build_object('schemaVersion', 1, 'weekdays', jsonb_build_object(
    EXTRACT(DOW FROM DATE '2099-01-05')::integer::text,
    jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00'))
  ))
  WHERE id IN (l1, l2);
  INSERT INTO public.professionals(id,clinic_id,user_id,full_name,status)
    VALUES(p1,c1,NULL,'Professional without login','active');
  INSERT INTO public.professional_locations(clinic_id,professional_id,location_id) VALUES
    (c1,p1,l1),
    (c1,p1,l2);
  INSERT INTO public.treatments(id,clinic_id,name,duration_minutes) VALUES(t1,c1,'Phase 5 treatment',60);
  INSERT INTO public.professional_treatments(clinic_id,professional_id,treatment_id,duration_minutes,status)
    VALUES(c1,p1,t1,45,'active');
  INSERT INTO public.professional_availability(clinic_id,location_id,professional_id,day_of_week,start_time,end_time)
  VALUES
    (c1,l1,p1,EXTRACT(DOW FROM DATE '2099-01-05')::integer,'08:00','18:00'),
    (c1,l2,p1,EXTRACT(DOW FROM DATE '2099-01-05')::integer,'08:00','18:00');

  IF public.resolve_appointment_duration(c1,p1,t1) <> 60 THEN
    RAISE EXCEPTION 'TEST_FAILED: canonical private duration precedence';
  END IF;
  SELECT count(*) INTO slots FROM public.get_available_slots(c1,l1,p1,t1,'2099-01-05','2099-01-05',15);
  IF slots = 0 THEN RAISE EXCEPTION 'TEST_FAILED: weekly availability'; END IF;

  INSERT INTO public.appointment_blocks(clinic_id,location_id,professional_id,start_at,end_at)
    VALUES(c1,l1,p1,'2099-01-05 13:00+00','2099-01-05 14:00+00');
  IF EXISTS(SELECT 1 FROM public.get_available_slots(c1,l1,p1,t1,'2099-01-05','2099-01-05',15)
    WHERE start_time<'2099-01-05 14:00+00' AND end_time>'2099-01-05 13:00+00') THEN
    RAISE EXCEPTION 'TEST_FAILED: professional block';
  END IF;
  DELETE FROM public.appointment_blocks WHERE clinic_id=c1;

  a1 := public.create_appointment_secure(c1,l1,p1,NULL,NULL,t1,'2099-01-05 12:00+00','session',NULL,NULL,NULL,NULL);

  BEGIN
    PERFORM public.create_appointment_secure(c1,l2,p1,NULL,NULL,t1,'2099-01-05 12:15+00','session',NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'TEST_FAILED: concurrent/cross-unit double booking accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  a1 := public.cancel_appointment_secure(c1,a1.id,'test cancellation','cancelled');
  a2 := public.create_appointment_secure(c1,l1,p1,NULL,NULL,t1,'2099-01-05 12:00+00','session',NULL,NULL,NULL,NULL);
  IF a2.id IS NULL THEN RAISE EXCEPTION 'TEST_FAILED: cancellation did not free slot'; END IF;

  a1 := public.reschedule_appointment_secure(c1,a2.id,'2099-01-05 15:00+00',p1,l1,NULL,NULL,'test reschedule');
  IF NOT EXISTS(SELECT 1 FROM public.appointments WHERE id=a2.id AND status='rescheduled' AND rescheduled_to=a1.id) THEN
    RAISE EXCEPTION 'TEST_FAILED: safe reschedule chain';
  END IF;

  BEGIN
    PERFORM public.create_appointment_secure(c2,l1,p1,NULL,NULL,t1,'2099-01-05 16:00+00','session',NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant operation accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

ROLLBACK;
