-- Run against disposable/local Supabase. Every fixture is synthetic and rolled back.
BEGIN;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO auth.users (id, email, role, aud, created_at, updated_at) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'phase56d-a@example.test', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.clinics (id, name, slug) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'Phase 5.6D Clinic A', 'phase5-6d-test-a'),
  ('d2000000-0000-0000-0000-000000000002', 'Phase 5.6D Clinic B', 'phase5-6d-test-b');
INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'admin');

SET LOCAL ROLE service_role;
INSERT INTO public.whatsapp_ai_settings (clinic_id) VALUES
  ('d2000000-0000-0000-0000-000000000001'), ('d2000000-0000-0000-0000-000000000002');
INSERT INTO public.whatsapp_ai_conversations (id, clinic_id, phone, contact_name) VALUES
  ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', '5511000056D1', 'Synthetic A');

DO $$
DECLARE location_a uuid; entry_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_ai_settings WHERE ai_knowledge_enabled) THEN
    RAISE EXCEPTION 'TEST_FAILED: knowledge gate was enabled by default';
  END IF;
  BEGIN
    UPDATE public.whatsapp_ai_settings SET ai_knowledge_enabled = true
    WHERE clinic_id = 'd2000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST_FAILED: knowledge enabled before validation';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT id INTO location_a FROM public.clinic_locations
  WHERE clinic_id = 'd2000000-0000-0000-0000-000000000001' AND is_primary;
  UPDATE public.clinic_locations SET
    opening_hours = '{"monday":["08:00–18:00"]}',
    parking_information = 'Estacionamento conveniado ao lado.',
    accessibility_information = 'Entrada acessível por rampa.'
  WHERE id = location_a;

  INSERT INTO public.clinic_administrative_policies (
    clinic_id, arrival_minutes, required_documents, allowed_payment_methods, cancellation_policy
  ) VALUES (
    'd2000000-0000-0000-0000-000000000001', 15,
    ARRAY['Documento com foto'], ARRAY['Pix', 'Cartão'], 'Cancele com 24 horas.'
  );

  BEGIN
    INSERT INTO public.administrative_knowledge_entries (
      clinic_id, topic, question, answer, status
    ) VALUES (
      'd2000000-0000-0000-0000-000000000001', 'faq', 'Tem estacionamento?', 'Sim.', 'published'
    );
    RAISE EXCEPTION 'TEST_FAILED: unverified entry was published';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.administrative_knowledge_entries (
    clinic_id, topic, question, answer, keywords, status, verified_at
  ) VALUES (
    'd2000000-0000-0000-0000-000000000001', 'faq', 'Tem estacionamento?',
    'Estacionamento conveniado ao lado.', ARRAY['vaga', 'estacionamento'], 'published', now()
  ) RETURNING id INTO entry_id;

  BEGIN
    UPDATE public.administrative_knowledge_entries SET answer = 'Resposta alterada.' WHERE id = entry_id;
    RAISE EXCEPTION 'TEST_FAILED: published content changed without returning to draft';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.administrative_knowledge_entries (
      clinic_id, topic, scope, location_id, question, answer
    ) VALUES (
      'd2000000-0000-0000-0000-000000000002', 'parking', 'location', location_a,
      'Tem estacionamento?', 'Resposta de outra clínica.'
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant source reference accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE public.whatsapp_ai_settings
  SET ai_engine_mode = 'active',
      ai_read_tools_enabled = true,
      ai_read_tools_validated_at = now(),
      ai_knowledge_validated_at = now(),
      ai_knowledge_enabled = true
  WHERE clinic_id = 'd2000000-0000-0000-0000-000000000001';

  INSERT INTO public.ai_tool_execution_events (
    clinic_id, conversation_id, correlation_id, tool_name, tool_kind, outcome, latency_ms
  ) VALUES (
    'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001', 'search_administrative_knowledge', 'read', 'success', 5
  );
  INSERT INTO public.ai_knowledge_answer_events (
    clinic_id, conversation_id, correlation_id, topic, outcome, source_refs, latency_ms
  ) VALUES (
    'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001', 'parking', 'answered',
    jsonb_build_array(jsonb_build_object('table', 'clinic_locations', 'recordId', location_a)), 5
  );
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.administrative_knowledge_entries) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: knowledge entries leaked or disappeared';
  END IF;
  IF (SELECT count(*) FROM public.ai_knowledge_answer_events) <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: knowledge audit leaked or disappeared';
  END IF;
  BEGIN
    INSERT INTO public.ai_knowledge_answer_events (
      clinic_id, conversation_id, correlation_id, topic, outcome, latency_ms
    ) VALUES (
      'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'faq', 'not_found', 1
    );
    RAISE EXCEPTION 'TEST_FAILED: authenticated role wrote technical audit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;
