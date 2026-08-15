-- Run against disposable/local Supabase. Every fixture is rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('81000000-0000-0000-0000-000000000001', 'phase5d-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('81000000-0000-0000-0000-000000000002', 'phase5d-b@example.test', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.clinics (id, name, slug) VALUES
  ('82000000-0000-0000-0000-000000000001', 'Phase 5.5D Clinic A', 'phase5-5d-test-a'),
  ('82000000-0000-0000-0000-000000000002', 'Phase 5.5D Clinic B', 'phase5-5d-test-b');

INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'admin'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'admin');

SET LOCAL ROLE service_role;

DO $$
DECLARE
  clinic_a constant uuid := '82000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '82000000-0000-0000-0000-000000000002';
  connection_a1 uuid;
  connection_a2 uuid;
  connection_b uuid;
  internal_appointment public.appointments;
  external_appointment public.appointments;
  unmapped_appointment public.appointments;
  professional_count integer;
BEGIN
  INSERT INTO public.scheduling_provider_connections (
    clinic_id, provider_type, status, display_name, source_of_truth
  ) VALUES
    (clinic_a, 'google_calendar', 'active', 'Google A1', 'external_provider'),
    (clinic_a, 'google_calendar', 'active', 'Google A2', 'external_provider'),
    (clinic_b, 'google_calendar', 'active', 'Google B', 'external_provider');

  SELECT id INTO connection_a1 FROM public.scheduling_provider_connections
  WHERE clinic_id = clinic_a AND display_name = 'Google A1';
  SELECT id INTO connection_a2 FROM public.scheduling_provider_connections
  WHERE clinic_id = clinic_a AND display_name = 'Google A2';
  SELECT id INTO connection_b FROM public.scheduling_provider_connections
  WHERE clinic_id = clinic_b AND display_name = 'Google B';

  INSERT INTO public.appointments (
    clinic_id, start_time, end_time, duration_minutes, appointment_type
  ) VALUES (
    clinic_a, '2099-02-02 09:00+00', '2099-02-02 10:00+00', 60, 'consultation'
  ) RETURNING * INTO internal_appointment;

  IF internal_appointment.provider_type <> 'internal'
     OR internal_appointment.source_of_truth <> 'aura'
     OR internal_appointment.sync_state <> 'not_applicable'
     OR internal_appointment.external_appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: internal appointment defaults changed';
  END IF;

  INSERT INTO public.appointments (
    clinic_id, start_time, end_time, duration_minutes, appointment_type,
    provider_type, connection_id, external_appointment_id, source_of_truth,
    sync_state, event_origin, raw_provider_status, external_version,
    external_etag, last_synced_at, last_provider_seen_at
  ) VALUES (
    clinic_a, '2099-02-02 10:00+00', '2099-02-02 10:30+00', 30, 'consultation',
    'google_calendar', connection_a1, 'external/string-100', 'external_provider',
    'synced', 'provider_import', 'accepted', 'version-7', 'etag/value', now(), now()
  ) RETURNING * INTO external_appointment;

  IF external_appointment.external_appointment_id <> 'external/string-100'
     OR external_appointment.raw_provider_status <> 'accepted'
     OR external_appointment.last_synced_at IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: external identity metadata was not persisted';
  END IF;

  BEGIN
    INSERT INTO public.appointments (
      clinic_id, start_time, end_time, duration_minutes, appointment_type,
      provider_type, connection_id, external_appointment_id, source_of_truth, sync_state
    ) VALUES (
      clinic_a, '2099-02-02 11:00+00', '2099-02-02 11:30+00', 30, 'consultation',
      'google_calendar', connection_a1, 'external/string-100', 'external_provider', 'synced'
    );
    RAISE EXCEPTION 'TEST_FAILED: duplicate external appointment identity was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.appointments (
    clinic_id, start_time, end_time, duration_minutes, appointment_type,
    provider_type, connection_id, external_appointment_id, source_of_truth, sync_state
  ) VALUES (
    clinic_a, '2099-02-02 11:00+00', '2099-02-02 11:30+00', 30, 'consultation',
    'google_calendar', connection_a2, 'external/string-100', 'external_provider', 'synced'
  );

  BEGIN
    INSERT INTO public.appointments (
      clinic_id, start_time, end_time, duration_minutes, appointment_type,
      provider_type, connection_id, external_appointment_id, source_of_truth, sync_state
    ) VALUES (
      clinic_a, '2099-02-02 12:00+00', '2099-02-02 12:30+00', 30, 'consultation',
      'google_calendar', connection_b, 'cross-tenant', 'external_provider', 'synced'
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant appointment connection was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.appointments (
      clinic_id, start_time, end_time, duration_minutes, appointment_type,
      provider_type, connection_id, external_appointment_id, source_of_truth, sync_state
    ) VALUES (
      clinic_a, '2099-02-02 12:00+00', '2099-02-02 12:30+00', 30, 'consultation',
      'internal', connection_a1, 'invalid-internal', 'external_provider', 'synced'
    );
    RAISE EXCEPTION 'TEST_FAILED: internal provider accepted external source identity';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.appointments (
      clinic_id, start_time, end_time, duration_minutes, appointment_type,
      provider_type, connection_id, external_appointment_id, source_of_truth, sync_state
    ) VALUES (
      clinic_a, '2099-02-02 12:00+00', '2099-02-02 12:30+00', 30, 'consultation',
      'google_calendar', connection_a1, 'invalid-sync', 'external_provider', 'unknown_state'
    );
    RAISE EXCEPTION 'TEST_FAILED: invalid sync state was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.appointments
  SET is_tombstone = true, tombstoned_at = now(), sync_state = 'tombstoned'
  WHERE id = external_appointment.id
  RETURNING * INTO external_appointment;

  IF external_appointment.status = 'cancelled'
     OR NOT external_appointment.is_tombstone
     OR external_appointment.tombstoned_at IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: tombstone was confused with cancellation';
  END IF;

  SELECT count(*) INTO professional_count FROM public.professionals WHERE clinic_id = clinic_a;
  INSERT INTO public.appointments (
    clinic_id, start_time, end_time, duration_minutes, appointment_type,
    provider_type, connection_id, external_appointment_id, source_of_truth,
    sync_state, event_origin, unmapped_entity_types,
    sync_conflict_code, sync_conflict_at
  ) VALUES (
    clinic_a, '2099-02-02 13:00+00', '2099-02-02 13:30+00', 30, 'consultation',
    'google_calendar', connection_a1, 'external/unmapped-1', 'external_provider',
    'conflict', 'provider_import', ARRAY['professional', 'location'],
    'UNMAPPED_PROVIDER_RESOURCES', now()
  ) RETURNING * INTO unmapped_appointment;

  IF unmapped_appointment.professional_id IS NOT NULL
     OR unmapped_appointment.location_id IS NOT NULL
     OR cardinality(unmapped_appointment.unmapped_entity_types) <> 2
     OR (SELECT count(*) FROM public.professionals WHERE clinic_id = clinic_a) <> professional_count THEN
    RAISE EXCEPTION 'TEST_FAILED: partial mirror mapping behavior is invalid';
  END IF;

  INSERT INTO public.scheduling_reconciliation_states (
    connection_id, clinic_id, status, checkpoint, sync_token,
    checkpoint_metadata, last_started_at
  ) VALUES (
    connection_a1, clinic_a, 'running', 'page:10', 'opaque-sync-token',
    '{"scope":"appointments"}', now()
  );
  UPDATE public.scheduling_reconciliation_states
  SET status = 'error', last_completed_at = now(), last_error_code = 'PROVIDER_TIMEOUT',
      last_error_message = 'Provider did not respond within the configured limit.',
      last_error_at = now(), consecutive_failures = 1
  WHERE connection_id = connection_a1;
  UPDATE public.scheduling_reconciliation_states
  SET status = 'idle', checkpoint = 'page:11', sync_token = 'opaque-sync-token-2',
      last_success_at = now(), last_error_code = NULL, last_error_message = NULL,
      consecutive_failures = 0
  WHERE connection_id = connection_a1;

  IF NOT EXISTS (
    SELECT 1 FROM public.scheduling_reconciliation_states
    WHERE connection_id = connection_a1 AND clinic_id = clinic_a
      AND status = 'idle' AND checkpoint = 'page:11'
      AND sync_token = 'opaque-sync-token-2' AND consecutive_failures = 0
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: reconciliation checkpoint lifecycle failed';
  END IF;

  INSERT INTO public.scheduling_reconciliation_states (connection_id, clinic_id)
  VALUES (connection_b, clinic_b);

  INSERT INTO public.scheduling_provider_events (
    clinic_id, connection_id, provider_type, external_event_id,
    event_type, external_appointment_id
  ) VALUES (
    clinic_a, connection_a1, 'google_calendar', 'event-100',
    'appointment.updated', 'external/string-100'
  );
  BEGIN
    INSERT INTO public.scheduling_provider_events (
      clinic_id, connection_id, provider_type, external_event_id, event_type
    ) VALUES (clinic_a, connection_a1, 'google_calendar', 'event-100', 'appointment.updated');
    RAISE EXCEPTION 'TEST_FAILED: duplicate external event id was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.scheduling_provider_events (
    clinic_id, connection_id, provider_type, payload_hash, event_type
  ) VALUES (clinic_a, connection_a1, 'google_calendar', 'sha256:technical-hash-1', 'poll.snapshot');
  BEGIN
    INSERT INTO public.scheduling_provider_events (
      clinic_id, connection_id, provider_type, payload_hash, event_type
    ) VALUES (clinic_a, connection_a1, 'google_calendar', 'sha256:technical-hash-1', 'poll.snapshot');
    RAISE EXCEPTION 'TEST_FAILED: duplicate fallback payload hash was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.scheduling_provider_events (
    clinic_id, connection_id, provider_type, external_event_id, event_type
  ) VALUES (clinic_b, connection_b, 'google_calendar', 'event-b', 'appointment.created');
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  external_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE clinic_id = '82000000-0000-0000-0000-000000000002'
  ) OR EXISTS (
    SELECT 1 FROM public.scheduling_reconciliation_states
    WHERE clinic_id = '82000000-0000-0000-0000-000000000002'
  ) OR EXISTS (
    SELECT 1 FROM public.scheduling_provider_events
    WHERE clinic_id = '82000000-0000-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: clinic A can read clinic B technical scheduling records';
  END IF;

  SELECT id INTO external_id FROM public.appointments
  WHERE clinic_id = '82000000-0000-0000-0000-000000000001'
    AND external_appointment_id = 'external/unmapped-1';

  BEGIN
    UPDATE public.appointments SET notes = 'Direct local edit' WHERE id = external_id;
    RAISE EXCEPTION 'TEST_FAILED: authenticated user edited external-authoritative mirror';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.scheduling_reconciliation_states (
      connection_id, clinic_id
    ) SELECT id, clinic_id FROM public.scheduling_provider_connections
      WHERE clinic_id = '82000000-0000-0000-0000-000000000001'
        AND provider_type = 'internal';
    RAISE EXCEPTION 'TEST_FAILED: authenticated user wrote technical reconciliation state';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;
