-- Run against disposable/local Supabase. Every fixture is rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('91000000-0000-0000-0000-000000000001', 'phase56a-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('91000000-0000-0000-0000-000000000002', 'phase56a-b@example.test', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.clinics (id, name, slug) VALUES
  ('92000000-0000-0000-0000-000000000001', 'Phase 5.6A Clinic A', 'phase5-6a-test-a'),
  ('92000000-0000-0000-0000-000000000002', 'Phase 5.6A Clinic B', 'phase5-6a-test-b');

INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'admin'),
  ('91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'admin');

SET LOCAL ROLE service_role;

DO $$
DECLARE
  clinic_a constant uuid := '92000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '92000000-0000-0000-0000-000000000002';
  conversation_a uuid;
  conversation_b uuid;
  usage_id uuid;
BEGIN
  INSERT INTO public.whatsapp_ai_settings (clinic_id)
  VALUES (clinic_a), (clinic_b);

  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_ai_settings
    WHERE clinic_id = clinic_a AND ai_engine_mode = 'legacy'
      AND preferred_language = 'pt-BR' AND response_style <> ''
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: safe AI settings defaults are missing';
  END IF;

  BEGIN
    UPDATE public.whatsapp_ai_settings SET ai_engine_mode = 'invalid' WHERE clinic_id = clinic_a;
    RAISE EXCEPTION 'TEST_FAILED: invalid engine mode was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name)
  VALUES ('94000000-0000-0000-0000-000000000001', clinic_a, '551100000001', 'Synthetic A') RETURNING id INTO conversation_a;
  INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name)
  VALUES ('94000000-0000-0000-0000-000000000002', clinic_b, '551100000002', 'Synthetic B') RETURNING id INTO conversation_b;

  INSERT INTO public.ai_usage_events (
    clinic_id, conversation_id, correlation_id, channel, message_type,
    request_type, provider, model, input_units, output_units, total_units,
    preprocessing_latency_ms, provider_latency_ms, total_latency_ms, outcome
  ) VALUES (
    clinic_a, conversation_a, '93000000-0000-0000-0000-000000000001', 'whatsapp', 'text',
    'llm_response', 'openai', 'synthetic-model', 10, 5, 15, 1, 20, 21, 'success'
  ) RETURNING id INTO usage_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_usage_events
    WHERE id = usage_id AND clinic_id = clinic_a AND total_units = 15
      AND total_latency_ms = 21 AND error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: usage event did not preserve technical metadata';
  END IF;

  BEGIN
    INSERT INTO public.ai_usage_events (
      clinic_id, conversation_id, correlation_id, channel, message_type,
      request_type, provider, total_latency_ms, outcome
    ) VALUES (
      clinic_b, conversation_a, '93000000-0000-0000-0000-000000000002',
      'whatsapp', 'audio', 'transcription', 'openai', 10, 'success'
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant conversation was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_usage_events (
      clinic_id, conversation_id, correlation_id, channel, message_type,
      request_type, provider, total_latency_ms, outcome
    ) VALUES (
      clinic_a, conversation_a, '93000000-0000-0000-0000-000000000003',
      'whatsapp', 'video', 'llm_response', 'openai', 10, 'success'
    );
    RAISE EXCEPTION 'TEST_FAILED: invalid message type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_usage_events (
      clinic_id, conversation_id, correlation_id, channel, message_type,
      request_type, provider, total_latency_ms, outcome
    ) VALUES (
      clinic_a, conversation_a, '93000000-0000-0000-0000-000000000004',
      'whatsapp', 'image', 'vision', 'openai', -1, 'success'
    );
    RAISE EXCEPTION 'TEST_FAILED: negative latency was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_usage_events (
      clinic_id, conversation_id, correlation_id, channel, message_type,
      request_type, provider, total_latency_ms, outcome
    ) VALUES (
      clinic_a, conversation_a, '93000000-0000-0000-0000-000000000005',
      'whatsapp', 'text', 'llm_response', 'openai', 1, 'error'
    );
    RAISE EXCEPTION 'TEST_FAILED: error outcome without sanitized code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.ai_usage_events (
    clinic_id, conversation_id, correlation_id, channel, message_type,
    request_type, provider, total_latency_ms, outcome, error_code
  ) VALUES (
    clinic_b, conversation_b, '93000000-0000-0000-0000-000000000006',
    'whatsapp', 'audio', 'transcription', 'openai', 100, 'error', 'AI_TIMEOUT'
  );
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  clinic_a constant uuid := '92000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '92000000-0000-0000-0000-000000000002';
  conversation_a constant uuid := '94000000-0000-0000-0000-000000000001';
BEGIN
  IF (SELECT count(*) FROM public.ai_usage_events) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: clinic A can see another tenant usage';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_usage_events WHERE clinic_id = clinic_b) THEN
    RAISE EXCEPTION 'TEST_FAILED: clinic B usage leaked through RLS';
  END IF;

  BEGIN
    INSERT INTO public.ai_usage_events (
      clinic_id, conversation_id, correlation_id, channel, message_type,
      request_type, provider, total_latency_ms, outcome
    ) VALUES (
      clinic_a, conversation_a, '93000000-0000-0000-0000-000000000007',
      'whatsapp', 'text', 'llm_response', 'openai', 1, 'success'
    );
    RAISE EXCEPTION 'TEST_FAILED: authenticated user inserted technical usage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;
