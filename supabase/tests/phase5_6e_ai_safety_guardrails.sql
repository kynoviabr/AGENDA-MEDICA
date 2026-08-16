-- Run against disposable/local Supabase. Every fixture is synthetic and rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'phase56e-a@example.test', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.clinics (id, name, slug) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'Phase 5.6E Clinic A', 'phase5-6e-test-a'),
  ('e2000000-0000-0000-0000-000000000002', 'Phase 5.6E Clinic B', 'phase5-6e-test-b');
INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'admin');

SET LOCAL ROLE service_role;
INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name) VALUES
  ('e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', '5511000056E1', 'Synthetic A'),
  ('e4000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', '5511000056E2', 'Synthetic B');

INSERT INTO public.administrative_knowledge_entries (
  clinic_id, topic, question, answer, status, verified_at
) VALUES (
  'e2000000-0000-0000-0000-000000000001', 'faq', 'Pergunta segura?', 'Resposta segura.', 'published', now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.administrative_knowledge_entries
    WHERE clinic_id = 'e2000000-0000-0000-0000-000000000001' AND patient_visible
  ) THEN RAISE EXCEPTION 'TEST_FAILED: published knowledge became patient-visible by default'; END IF;

  INSERT INTO public.ai_safety_events (
    clinic_id, conversation_id, correlation_id, disposition, categories,
    validator, grounded, latency_ms
  ) VALUES (
    'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001', 'rewrite_safe',
    ARRAY['unsupported_numeric_fact'], 'deterministic_v1', false, 3
  );

  BEGIN
    INSERT INTO public.ai_safety_events (
      clinic_id, conversation_id, correlation_id, disposition, validator, grounded, latency_ms
    ) VALUES (
      'e2000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'allow', 'deterministic_v1', true, 1
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant conversation reference accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_safety_events (
      clinic_id, conversation_id, correlation_id, disposition, validator, grounded, latency_ms
    ) VALUES (
      'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'unsafe', 'deterministic_v1', true, 1
    );
    RAISE EXCEPTION 'TEST_FAILED: invalid disposition accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_safety_events) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: safety events leaked across clinics';
  END IF;
  BEGIN
    INSERT INTO public.ai_safety_events (
      clinic_id, conversation_id, correlation_id, disposition, validator, grounded, latency_ms
    ) VALUES (
      'e2000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'allow', 'deterministic_v1', true, 1
    );
    RAISE EXCEPTION 'TEST_FAILED: authenticated role wrote safety audit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;
