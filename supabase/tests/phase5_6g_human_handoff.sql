\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF (SELECT ai_handoff_enabled FROM public.whatsapp_ai_settings LIMIT 1) IS NOT NULL THEN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_ai_settings'
      AND column_name='ai_handoff_enabled' AND column_default='false'
  ) THEN RAISE EXCEPTION 'handoff flag must default false'; END IF;
END $$;

INSERT INTO auth.users(id,email) VALUES
  ('10000000-0000-4000-8000-000000000001','staff-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002','staff-b@example.invalid'),
  ('10000000-0000-4000-8000-000000000003','outsider@example.invalid');
INSERT INTO public.clinics(id,name,slug) VALUES
  ('20000000-0000-4000-8000-000000000001','Clínica Sintética A','synthetic-a'),
  ('20000000-0000-4000-8000-000000000002','Clínica Sintética B','synthetic-b');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','receptionist',true),
  ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','receptionist',true),
  ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','receptionist',true);
INSERT INTO public.whatsapp_ai_settings(clinic_id,ai_engine_mode,ai_handoff_enabled,ai_handoff_validated_at)
VALUES
  ('20000000-0000-4000-8000-000000000001','active',true,now()),
  ('20000000-0000-4000-8000-000000000002','legacy',false,NULL);
INSERT INTO public.whatsapp_ai_conversations(id,clinic_id,phone,conversation_state)
VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5511999990001',
   '{"schemaVersion":1,"activeIntent":"scheduling_request","activeIntentStatus":"ready","entities":{"selectedOption":{"value":"2026-08-18T14:00:00-03:00","source":"user_text","confidence":"high","requiresConfirmation":false}},"constraints":{"excludedProfessionals":[],"excludedInsurances":[],"excludedTimePreferences":[]},"lastPresentedOptions":[{"id":"one","label":"14:00","value":"2026-08-18T14:00:00-03:00","kind":"time"}]}'::jsonb),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','5511999990002','{}'::jsonb);

SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.request_ai_conversation_handoff(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  'urgent_language','urgent','safety','40000000-0000-4000-8000-000000000001',
  '{"reason":"urgent_language","knownAdministrativeContext":[],"whatAuraAlreadyTried":[]}'::jsonb,NULL
);
SELECT public.request_ai_conversation_handoff(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  'safety_fail_closed','high','safety','40000000-0000-4000-8000-000000000002','{}'::jsonb,NULL
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_conversation_handoffs WHERE conversation_id='30000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'duplicate active handoff created';
  END IF;
  IF (SELECT control_mode FROM public.whatsapp_ai_conversations WHERE id='30000000-0000-4000-8000-000000000001') <> 'handoff_pending' THEN
    RAISE EXCEPTION 'AI was not suspended atomically';
  END IF;
  IF jsonb_array_length((SELECT conversation_state->'lastPresentedOptions' FROM public.whatsapp_ai_conversations WHERE id='30000000-0000-4000-8000-000000000001')) <> 0 THEN
    RAISE EXCEPTION 'pending options were not invalidated';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT public.take_over_ai_conversation('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF NOT public.authorize_human_conversation_outbound('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'owner could not send human outbound';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $$
BEGIN
  PERFORM public.take_over_ai_conversation('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'second staff unexpectedly won takeover race';
EXCEPTION WHEN serialization_failure THEN NULL;
END $$;
DO $$ BEGIN
  IF public.authorize_human_conversation_outbound('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'non-owner human outbound authorized';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT public.transfer_ai_conversation(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SELECT public.take_over_ai_conversation('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
SELECT public.resolve_ai_conversation_handoff(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','returned_to_ai'
);

DO $$
BEGIN
  IF (SELECT control_mode FROM public.whatsapp_ai_conversations WHERE id='30000000-0000-4000-8000-000000000001') <> 'ai_active' THEN
    RAISE EXCEPTION 'return to AI failed';
  END IF;
  IF (SELECT active_handoff_id FROM public.whatsapp_ai_conversations WHERE id='30000000-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'active handoff was not cleared';
  END IF;
  IF (SELECT conversation_state#>>'{entities,selectedOption}' FROM public.whatsapp_ai_conversations WHERE id='30000000-0000-4000-8000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'old pending mutation survived return to AI';
  END IF;
  IF (SELECT count(*) FROM public.ai_handoff_events WHERE conversation_id='30000000-0000-4000-8000-000000000001') < 5 THEN
    RAISE EXCEPTION 'handoff audit trail incomplete';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $$
BEGIN
  PERFORM public.take_over_ai_conversation('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'cross-tenant takeover succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_handoff_events'
      AND column_name IN ('message','body','prompt','response','phone','cpf')
  ) THEN RAISE EXCEPTION 'audit table contains conversation content columns'; END IF;
END $$;

ROLLBACK;
