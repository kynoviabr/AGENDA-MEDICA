-- Run against disposable/local Supabase. Every fixture is synthetic and rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'phase56c-a@example.test', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.clinics (id, name, slug) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'Phase 5.6C Clinic A', 'phase5-6c-test-a'),
  ('c2000000-0000-0000-0000-000000000002', 'Phase 5.6C Clinic B', 'phase5-6c-test-b');
INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'admin');

SET LOCAL ROLE service_role;
INSERT INTO public.whatsapp_ai_settings (clinic_id, ai_engine_mode) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'legacy'),
  ('c2000000-0000-0000-0000-000000000002', 'legacy');
INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name) VALUES
  ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', '5511000056C1', 'Synthetic A'),
  ('c4000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', '5511000056C2', 'Synthetic B');

DO $$
DECLARE claimed boolean;
BEGIN
  BEGIN
    UPDATE public.whatsapp_ai_settings SET ai_mutation_tools_enabled = true
    WHERE clinic_id = 'c2000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: mutation enabled before read validation';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.whatsapp_ai_settings
  SET ai_engine_mode = 'active', ai_read_tools_enabled = true,
      ai_read_tools_validated_at = now(), ai_mutation_tools_enabled = true
  WHERE clinic_id = 'c2000000-0000-0000-0000-000000000001';

  claimed := public.claim_ai_tool_mutation(
    'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001', 'create_appointment');
  IF NOT claimed THEN RAISE EXCEPTION 'TEST_FAILED: first mutation claim rejected'; END IF;

  claimed := public.claim_ai_tool_mutation(
    'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000001', 'create_appointment');
  IF claimed THEN RAISE EXCEPTION 'TEST_FAILED: duplicate mutation claim accepted'; END IF;

  BEGIN
    PERFORM public.claim_ai_tool_mutation(
      'c2000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000002', 'cancel_appointment');
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant mutation claim accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.ai_tool_execution_events (
    clinic_id, conversation_id, correlation_id, tool_name, tool_kind, outcome, latency_ms
  ) VALUES (
    'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001',
    'c3000000-0000-0000-0000-000000000003', 'list_professionals', 'read', 'success', 10
  );
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_tool_execution_events) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: audit events leaked across clinics';
  END IF;
  BEGIN
    PERFORM public.claim_ai_tool_mutation(
      'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000004', 'confirm_appointment');
    RAISE EXCEPTION 'TEST_FAILED: authenticated role claimed a mutation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;
