-- Run with `supabase test db` against a disposable/local database.
-- Every fixture and assertion is rolled back.
BEGIN;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.appointments', 'SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('service_role', 'public.appointments', 'SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.professional_health_insurances', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.professional_health_insurances', 'SELECT') THEN
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
  clinic_a constant uuid := '61000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '61000000-0000-0000-0000-000000000002';
  professional_a constant uuid := '62000000-0000-0000-0000-000000000001';
  professional_b constant uuid := '62000000-0000-0000-0000-000000000002';
  treatment_id constant uuid := '63000000-0000-0000-0000-000000000001';
  insurance_id constant uuid := '64000000-0000-0000-0000-000000000001';
  location_a uuid;
  private_slot_duration integer;
  legacy_slot_duration integer;
  insurance_slot_duration integer;
  private_appointment public.appointments;
  insurance_original public.appointments;
  insurance_rescheduled public.appointments;
  insurance_reassigned public.appointments;
  conflict_source public.appointments;
  conflict_target public.appointments;
  status_appointment public.appointments;
BEGIN
  INSERT INTO public.clinics(id, name, slug) VALUES
    (clinic_a, 'Phase 5.5B.1 Clinic A', 'phase5-5b1-test-a'),
    (clinic_b, 'Phase 5.5B.1 Clinic B', 'phase5-5b1-test-b');

  SELECT id
    INTO location_a
  FROM public.clinic_locations
  WHERE clinic_id = clinic_a
    AND is_primary;

  INSERT INTO public.professionals(id, clinic_id, user_id, full_name, status) VALUES
    (professional_a, clinic_a, NULL, 'Professional A', 'active'),
    (professional_b, clinic_a, NULL, 'Professional B', 'active');

  INSERT INTO public.professional_locations(clinic_id, professional_id, location_id) VALUES
    (clinic_a, professional_a, location_a),
    (clinic_a, professional_b, location_a);

  INSERT INTO public.treatments(id, clinic_id, name, duration_minutes)
  VALUES(treatment_id, clinic_a, 'Consulta hardening', 50);

  INSERT INTO public.professional_treatments(
    clinic_id, professional_id, treatment_id, duration_minutes, status
  ) VALUES
    (clinic_a, professional_a, treatment_id, 50, 'active'),
    (clinic_a, professional_b, treatment_id, 50, 'active');

  INSERT INTO public.professional_settings(
    clinic_id, professional_id, private_appointment_duration_minutes
  ) VALUES
    (clinic_a, professional_a, 60),
    (clinic_a, professional_b, 45)
  ON CONFLICT (professional_id) DO UPDATE
  SET private_appointment_duration_minutes = EXCLUDED.private_appointment_duration_minutes;

  INSERT INTO public.health_insurances(id, clinic_id, name, status)
  VALUES(insurance_id, clinic_a, 'Unimed hardening', 'active');

  INSERT INTO public.professional_health_insurances(
    clinic_id, professional_id, health_insurance_id, status,
    appointment_duration_minutes
  ) VALUES
    (clinic_a, professional_a, insurance_id, 'active', 30),
    (clinic_a, professional_b, insurance_id, 'active', 45);

  INSERT INTO public.professional_availability(
    clinic_id, location_id, professional_id, day_of_week, start_time, end_time
  ) VALUES
    (clinic_a, location_a, professional_a,
      EXTRACT(DOW FROM DATE '2099-01-05')::integer, '08:00', '18:00'),
    (clinic_a, location_a, professional_b,
      EXTRACT(DOW FROM DATE '2099-01-05')::integer, '08:00', '18:00');

  SELECT min(duration_minutes)
    INTO private_slot_duration
  FROM public.get_available_slots(
    clinic_a, location_a, professional_a, treatment_id,
    '2099-01-05', '2099-01-05', 15, 'private', NULL
  );
  IF private_slot_duration <> 60 THEN
    RAISE EXCEPTION 'TEST_FAILED: private slot duration should be 60, got %', private_slot_duration;
  END IF;

  SELECT min(duration_minutes)
    INTO legacy_slot_duration
  FROM public.get_available_slots(
    clinic_a, location_a, professional_a, treatment_id,
    '2099-01-05', '2099-01-05', 15
  );
  IF legacy_slot_duration <> 60 THEN
    RAISE EXCEPTION 'TEST_FAILED: legacy slot wrapper should remain private with 60 minutes, got %', legacy_slot_duration;
  END IF;

  BEGIN
    PERFORM public.resolve_appointment_duration(
      clinic_a, professional_a, treatment_id, 'insurance', NULL
    );
    RAISE EXCEPTION 'TEST_FAILED: insurance without health_insurance_id was accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  UPDATE public.health_insurances
  SET status = 'inactive'
  WHERE id = insurance_id AND clinic_id = clinic_a;
  BEGIN
    PERFORM public.resolve_appointment_duration(
      clinic_a, professional_a, treatment_id, 'insurance', insurance_id
    );
    RAISE EXCEPTION 'TEST_FAILED: inactive insurance was accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.health_insurances
  SET status = 'active'
  WHERE id = insurance_id AND clinic_id = clinic_a;

  UPDATE public.professional_health_insurances
  SET status = 'inactive'
  WHERE clinic_id = clinic_a
    AND professional_id = professional_a
    AND health_insurance_id = insurance_id;
  BEGIN
    PERFORM public.resolve_appointment_duration(
      clinic_a, professional_a, treatment_id, 'insurance', insurance_id
    );
    RAISE EXCEPTION 'TEST_FAILED: inactive professional insurance link was accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.professional_health_insurances
  SET status = 'active'
  WHERE clinic_id = clinic_a
    AND professional_id = professional_a
    AND health_insurance_id = insurance_id;

  SELECT min(duration_minutes)
    INTO insurance_slot_duration
  FROM public.get_available_slots(
    clinic_a, location_a, professional_a, treatment_id,
    '2099-01-05', '2099-01-05', 15, 'insurance', insurance_id
  );
  IF insurance_slot_duration <> 30 THEN
    RAISE EXCEPTION 'TEST_FAILED: insurance slot duration should be 30, got %', insurance_slot_duration;
  END IF;

  private_appointment := public.create_appointment_secure(
    clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
    '2099-01-05 12:00+00', 'consultation', NULL, NULL, NULL, NULL,
    'private', insurance_id
  );
  IF private_appointment.duration_minutes <> 60
     OR private_appointment.billing_type <> 'private'
     OR private_appointment.health_insurance_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: private creation did not use canonical modality';
  END IF;

  BEGIN
    PERFORM public.create_appointment_secure(
      clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
      '2099-01-05 10:00+00', 'consultation', NULL,
      30, NULL, NULL, 'private', NULL
    );
    RAISE EXCEPTION 'TEST_FAILED: explicit duration mismatch was accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  insurance_original := public.create_appointment_secure(
    clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
    '2099-01-05 13:30+00', 'consultation', 'insurance original',
    NULL, NULL, NULL, 'insurance', insurance_id
  );
  IF insurance_original.duration_minutes <> 30
     OR insurance_original.billing_type <> 'insurance'
     OR insurance_original.health_insurance_id <> insurance_id THEN
    RAISE EXCEPTION 'TEST_FAILED: insurance creation did not preserve modality';
  END IF;

  insurance_rescheduled := public.reschedule_appointment_secure(
    clinic_a, insurance_original.id, '2099-01-05 15:00+00',
    NULL, location_a, 'insurance rescheduled', NULL, 'test reschedule'
  );
  IF insurance_rescheduled.billing_type <> 'insurance'
     OR insurance_rescheduled.health_insurance_id <> insurance_id
     OR insurance_rescheduled.treatment_id <> treatment_id
     OR insurance_rescheduled.duration_minutes <> 30
     OR insurance_rescheduled.end_time <> '2099-01-05 15:30+00'::timestamptz THEN
    RAISE EXCEPTION 'TEST_FAILED: reschedule lost insurance metadata or duration';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE id = insurance_original.id
      AND clinic_id = clinic_a
      AND status = 'rescheduled'
      AND rescheduled_to = insurance_rescheduled.id
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: original appointment history was not preserved';
  END IF;

  insurance_reassigned := public.reassign_appointment_professional_secure(
    clinic_a, insurance_rescheduled.id, professional_b
  );
  IF insurance_reassigned.professional_id <> professional_b
     OR insurance_reassigned.start_time <> '2099-01-05 15:00+00'::timestamptz
     OR insurance_reassigned.end_time <> '2099-01-05 15:45+00'::timestamptz
     OR insurance_reassigned.duration_minutes <> 45
     OR insurance_reassigned.billing_type <> 'insurance'
     OR insurance_reassigned.health_insurance_id <> insurance_id THEN
    RAISE EXCEPTION 'TEST_FAILED: reassign did not preserve start and recalculate duration/end';
  END IF;

  conflict_source := public.create_appointment_secure(
    clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
    '2099-01-05 17:00+00', 'consultation', NULL,
    NULL, NULL, NULL, 'insurance', insurance_id
  );
  conflict_target := public.create_appointment_secure(
    clinic_a, location_a, professional_b, NULL, NULL, treatment_id,
    '2099-01-05 17:30+00', 'consultation', NULL,
    NULL, NULL, NULL, 'insurance', insurance_id
  );

  BEGIN
    PERFORM public.reassign_appointment_professional_secure(
      clinic_a, conflict_source.id, professional_b
    );
    RAISE EXCEPTION 'TEST_FAILED: reassignment accepted a duration overlap';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE id = conflict_source.id
      AND professional_id = professional_a
      AND duration_minutes = 30
      AND end_time = '2099-01-05 17:30+00'::timestamptz
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: failed reassignment mutated the original appointment';
  END IF;

  status_appointment := public.create_appointment_secure(
    clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
    '2099-01-05 19:30+00', 'consultation', NULL,
    NULL, NULL, NULL, 'private', NULL
  );
  status_appointment := public.confirm_appointment_secure(clinic_a, status_appointment.id);
  IF status_appointment.status <> 'confirmed' OR status_appointment.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: canonical confirmation failed';
  END IF;
  status_appointment := public.transition_appointment_status_secure(
    clinic_a, status_appointment.id, 'in_progress'
  );
  IF status_appointment.status <> 'in_progress' OR status_appointment.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: confirmed to in_progress transition failed';
  END IF;
  status_appointment := public.transition_appointment_status_secure(
    clinic_a, status_appointment.id, 'completed'
  );
  IF status_appointment.status <> 'completed' OR status_appointment.completed_at IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: in_progress to completed transition failed';
  END IF;

  BEGIN
    PERFORM public.transition_appointment_status_secure(
      clinic_a, conflict_source.id, 'completed'
    );
    RAISE EXCEPTION 'TEST_FAILED: invalid scheduled to completed transition accepted';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM public.cancel_appointment_secure(
      clinic_b, conflict_source.id, 'wrong tenant', 'cancelled'
    );
    RAISE EXCEPTION 'TEST_FAILED: clinic B manipulated clinic A appointment';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM public.create_appointment_secure(
      clinic_a, location_a, professional_a, NULL, NULL, treatment_id,
      '2099-01-05 17:15+00', 'consultation', NULL,
      NULL, NULL, NULL, 'insurance', insurance_id
    );
    RAISE EXCEPTION 'TEST_FAILED: double booking remained possible';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;

  IF conflict_target.id IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: conflict fixture was not created';
  END IF;
END
$$;

ROLLBACK;
