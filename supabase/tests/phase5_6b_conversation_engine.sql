-- Run against disposable/local Supabase. Every fixture is synthetic and rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'phase56b-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000002', 'phase56b-b@example.test', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.clinics (id, name, slug) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'Phase 5.6B Clinic A', 'phase5-6b-test-a'),
  ('a2000000-0000-0000-0000-000000000002', 'Phase 5.6B Clinic B', 'phase5-6b-test-b');

INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'admin'),
  ('a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'admin');

SET LOCAL ROLE service_role;

INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', '551100005601', 'Synthetic A'),
  ('a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', '551100005602', 'Synthetic B');

DO $$
DECLARE
  state_a jsonb;
  update_result jsonb;
BEGIN
  SELECT conversation_state INTO state_a
  FROM public.whatsapp_ai_conversations
  WHERE id = 'a4000000-0000-0000-0000-000000000001';

  IF state_a->>'schemaVersion' <> '1'
    OR state_a->>'activeIntent' <> 'unknown'
    OR jsonb_typeof(state_a->'entities') <> 'object'
  THEN RAISE EXCEPTION 'TEST_FAILED: invalid conversation state default'; END IF;

  update_result := public.update_whatsapp_ai_conversation_state(
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    0,
    jsonb_build_object(
      'schemaVersion', 1, 'activeIntent', 'scheduling_request', 'activeIntentStatus', 'collecting',
      'entities', jsonb_build_object('professional', jsonb_build_object(
        'value', 'Dra Sintética', 'source', 'user_text', 'confidence', 'high', 'requiresConfirmation', false
      )),
      'constraints', jsonb_build_object('excludedProfessionals', '[]'::jsonb, 'excludedInsurances', '[]'::jsonb, 'excludedTimePreferences', '[]'::jsonb),
      'lastPresentedOptions', '[]'::jsonb
    )
  );
  IF (update_result->>'revision')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: state revision did not increment atomically';
  END IF;

  BEGIN
    PERFORM public.update_whatsapp_ai_conversation_state(
      'a2000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001', 0, state_a
    );
    RAISE EXCEPTION 'TEST_FAILED: stale revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    PERFORM public.update_whatsapp_ai_conversation_state(
      'a2000000-0000-0000-0000-000000000002',
      'a4000000-0000-0000-0000-000000000001', 1, state_a
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant state update was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    UPDATE public.whatsapp_ai_conversations SET conversation_state = '{"schemaVersion":2}'::jsonb
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: invalid state shape was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.whatsapp_ai_conversations
    SET conversation_state = jsonb_build_object(
      'schemaVersion', 1, 'entities', '{}'::jsonb, 'constraints', '{}'::jsonb,
      'lastPresentedOptions', '[]'::jsonb, 'padding', repeat('x', 17000)
    ) WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: oversized state was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.ai_usage_events (
    clinic_id, conversation_id, correlation_id, channel, message_type,
    request_type, provider, total_latency_ms, outcome
  ) VALUES (
    'a2000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001', 'whatsapp', 'text',
    'conversation_interpretation', 'openai', 20, 'success'
  );
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.whatsapp_ai_conversations) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: conversation state leaked across clinics';
  END IF;

  -- Since 5.6G/5.7, lifecycle changes are RPC-only. A staff member may read
  -- the conversation but cannot bypass ownership/audit with a direct UPDATE.
  BEGIN
    UPDATE public.whatsapp_ai_conversations SET status = 'handoff'
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: direct administrative lifecycle update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.whatsapp_ai_conversations SET conversation_state = conversation_state
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: authenticated user changed technical conversation state';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF has_function_privilege('authenticated', 'public.update_whatsapp_ai_conversation_state(uuid,uuid,integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated role executed technical state RPC';
  END IF;
END
$$;

ROLLBACK;
