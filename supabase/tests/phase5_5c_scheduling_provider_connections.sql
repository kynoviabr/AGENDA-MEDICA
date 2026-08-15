-- Run against disposable/local Supabase. Every fixture is rolled back.
BEGIN;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.scheduling_provider_connections', 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('authenticated', 'public.scheduling_location_mappings', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated scheduling connection grants are missing';
  END IF;
END
$$;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('71000000-0000-0000-0000-000000000001', 'phase5c-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'phase5c-b@example.test', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.clinics (id, name, slug) VALUES
  ('72000000-0000-0000-0000-000000000001', 'Phase 5.5C Clinic A', 'phase5-5c-test-a'),
  ('72000000-0000-0000-0000-000000000002', 'Phase 5.5C Clinic B', 'phase5-5c-test-b');

INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'admin'),
  ('71000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'admin');

INSERT INTO public.clinic_locations (id, clinic_id, name) VALUES
  ('76000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Mapping Location A'),
  ('76000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Mapping Location A2'),
  ('76000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'Mapping Location B');

INSERT INTO public.professionals (id, clinic_id, user_id, full_name, status) VALUES
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', NULL, 'Professional A', 'active'),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', NULL, 'Professional B', 'active');

INSERT INTO public.treatments (id, clinic_id, name) VALUES
  ('74000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Service A'),
  ('74000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'Service B');

INSERT INTO public.health_insurances (id, clinic_id, name) VALUES
  ('75000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'Insurance A'),
  ('75000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'Insurance B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  clinic_a constant uuid := '72000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '72000000-0000-0000-0000-000000000002';
  professional_a constant uuid := '73000000-0000-0000-0000-000000000001';
  professional_b constant uuid := '73000000-0000-0000-0000-000000000002';
  service_a constant uuid := '74000000-0000-0000-0000-000000000001';
  service_b constant uuid := '74000000-0000-0000-0000-000000000002';
  insurance_a constant uuid := '75000000-0000-0000-0000-000000000001';
  location_a constant uuid := '76000000-0000-0000-0000-000000000001';
  location_a2 constant uuid := '76000000-0000-0000-0000-000000000003';
  location_b constant uuid := '76000000-0000-0000-0000-000000000002';
  connection_a uuid;
  internal_a uuid;
BEGIN
  IF (SELECT count(*) FROM public.scheduling_provider_connections WHERE clinic_id = clinic_a) <> 1
     OR EXISTS (SELECT 1 FROM public.scheduling_provider_connections WHERE clinic_id = clinic_b) THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated RLS did not isolate connection reads';
  END IF;

  SELECT id INTO internal_a
  FROM public.scheduling_provider_connections
  WHERE clinic_id = clinic_a AND provider_type = 'internal';

  IF NOT EXISTS (
    SELECT 1 FROM public.scheduling_provider_connections
    WHERE id = internal_a AND status = 'active' AND is_default
      AND source_of_truth = 'aura' AND external_account_id IS NULL
      AND capabilities->>'createAppointment' = 'true'
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: internal connection bootstrap is invalid';
  END IF;

  BEGIN
    INSERT INTO public.scheduling_provider_connections (
      clinic_id, provider_type, status, display_name, source_of_truth, is_default
    ) VALUES (clinic_a, 'internal', 'active', 'Duplicate Aura', 'aura', false);
    RAISE EXCEPTION 'TEST_FAILED: duplicate internal connection was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.scheduling_provider_connections SET is_default = false WHERE id = internal_a;

  INSERT INTO public.scheduling_provider_connections (
    clinic_id, provider_type, status, display_name, external_account_id,
    source_of_truth, capabilities, is_default, connected_at
  ) VALUES (
    clinic_a, 'google_calendar', 'active', 'Google Test', 'account/string-123',
    'external_provider', '{"readAvailability":true,"createAppointment":false}', true, now()
  ) RETURNING id INTO connection_a;

  BEGIN
    INSERT INTO public.scheduling_provider_connections (
      clinic_id, provider_type, status, display_name, source_of_truth, is_default
    ) VALUES (clinic_a, 'doctoralia', 'active', 'Second Default', 'external_provider', true);
    RAISE EXCEPTION 'TEST_FAILED: two clinic defaults were accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_provider_connections (
      clinic_id, provider_type, status, display_name, source_of_truth
    ) VALUES (clinic_b, 'doctoralia', 'active', 'Cross Tenant', 'external_provider');
    RAISE EXCEPTION 'TEST_FAILED: clinic A admin created clinic B connection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.scheduling_connection_professionals (
    clinic_id, connection_id, professional_id
  ) VALUES (clinic_a, connection_a, professional_a);

  BEGIN
    INSERT INTO public.scheduling_connection_professionals (
      clinic_id, connection_id, professional_id
    ) VALUES (clinic_a, connection_a, professional_b);
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant professional assignment was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_connection_professionals (
      clinic_id, connection_id, professional_id
    ) VALUES (clinic_a, internal_a, professional_a);
    RAISE EXCEPTION 'TEST_FAILED: two active professional overrides were accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.scheduling_location_mappings (
    clinic_id, connection_id, location_id, external_id, external_name
  ) VALUES (clinic_a, connection_a, location_a, 'calendar/location-A', 'External Location A');
  INSERT INTO public.scheduling_professional_mappings (
    clinic_id, connection_id, professional_id, external_id
  ) VALUES (clinic_a, connection_a, professional_a, 'doctor:001');
  INSERT INTO public.scheduling_service_mappings (
    clinic_id, connection_id, treatment_id, external_id
  ) VALUES (clinic_a, connection_a, service_a, 'service-ABC');
  INSERT INTO public.scheduling_insurance_mappings (
    clinic_id, connection_id, health_insurance_id, external_id
  ) VALUES (clinic_a, connection_a, insurance_a, 'insurance/99');

  BEGIN
    INSERT INTO public.scheduling_location_mappings (
      clinic_id, connection_id, location_id, external_id
    ) VALUES (clinic_a, connection_a, location_a, 'another-location-id');
    RAISE EXCEPTION 'TEST_FAILED: duplicate Aura mapping was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_location_mappings (
      clinic_id, connection_id, location_id, external_id
    ) VALUES (clinic_a, connection_a, location_b, 'calendar/location-B');
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant location mapping was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE public.scheduling_location_mappings
  SET status = 'disabled'
  WHERE connection_id = connection_a AND location_id = location_a;
  INSERT INTO public.scheduling_location_mappings (
    clinic_id, connection_id, location_id, external_id
  ) VALUES (clinic_a, connection_a, location_a, 'calendar/location-A-v2');

  BEGIN
    INSERT INTO public.scheduling_location_mappings (
      clinic_id, connection_id, location_id, external_id
    ) VALUES (clinic_a, connection_a, location_a2, 'calendar/location-A-v2');
    RAISE EXCEPTION 'TEST_FAILED: duplicate external mapping was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_service_mappings (
      clinic_id, connection_id, treatment_id, external_id
    ) VALUES (clinic_a, connection_a, service_b, 'cross-tenant-service');
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant service mapping was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scheduling_provider_connections
    WHERE clinic_id = '72000000-0000-0000-0000-000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.scheduling_location_mappings
    WHERE clinic_id = '72000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: clinic B can read clinic A scheduling configuration';
  END IF;
END
$$;

ROLLBACK;
