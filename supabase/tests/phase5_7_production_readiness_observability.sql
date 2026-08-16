\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email) VALUES
  ('11000000-0000-4000-8000-000000000001','operator-a@example.invalid'),
  ('11000000-0000-4000-8000-000000000002','operator-b@example.invalid');
INSERT INTO public.clinics(id,name,slug) VALUES
  ('21000000-0000-4000-8000-000000000001','Clínica Sintética A 5.7','synthetic-57-a'),
  ('21000000-0000-4000-8000-000000000002','Clínica Sintética B 5.7','synthetic-57-b');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','admin',true),
  ('11000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','admin',true);
INSERT INTO public.whatsapp_ai_settings(clinic_id) VALUES
  ('21000000-0000-4000-8000-000000000001'),('21000000-0000-4000-8000-000000000002');
INSERT INTO public.whatsapp_ai_conversations(id,clinic_id,phone) VALUES
  ('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','5511999000001'),
  ('31000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','5511999000002');
INSERT INTO public.whatsapp_ai_messages(clinic_id,conversation_id,direction,role,body,provider_message_id,message_origin) VALUES
  ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','inbound','user','mensagem sintética A','wamid.synthetic.57.a','patient'),
  ('21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','inbound','user','mensagem sintética B','wamid.synthetic.57.b','patient');
INSERT INTO public.ai_operational_events(clinic_id,conversation_id,correlation_id,event_type,component,outcome) VALUES
  ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','whatsapp_inbound_received','whatsapp','success'),
  ('21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','whatsapp_inbound_received','whatsapp','success');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_ai_settings WHERE ai_engine_mode<>'legacy' OR ai_read_tools_enabled OR ai_mutation_tools_enabled OR ai_knowledge_enabled OR ai_handoff_enabled) THEN
    RAISE EXCEPTION 'migration auto-enabled an AI feature';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_admin_action_events WHERE action='settings_created') THEN
    RAISE EXCEPTION 'settings creation was not audited';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ai_operational_events','ai_admin_action_events')
      AND column_name IN ('message','body','prompt','response','transcript','phone','cpf','patient_name','token','stack')
  ) THEN RAISE EXCEPTION 'observability table contains content/secret columns'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

DO $$ BEGIN
  IF (SELECT count(*) FROM public.whatsapp_ai_conversations) <> 1 THEN RAISE EXCEPTION 'conversation RLS tenant leak'; END IF;
  IF (SELECT count(*) FROM public.whatsapp_ai_messages) <> 1 THEN RAISE EXCEPTION 'message RLS tenant leak'; END IF;
  IF (SELECT count(*) FROM public.ai_operational_events) <> 1 THEN RAISE EXCEPTION 'operational event RLS tenant leak'; END IF;
  IF (SELECT count(*) FROM public.ai_admin_action_events) <> 1 THEN RAISE EXCEPTION 'admin action RLS tenant leak'; END IF;
END $$;

DO $$ BEGIN
  PERFORM public.get_aura_pilot_snapshot('21000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'cross-tenant readiness succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  PERFORM public.get_aura_operational_metrics('21000000-0000-4000-8000-000000000002',now()-interval '1 day',now());
  RAISE EXCEPTION 'cross-tenant metrics succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  PERFORM public.record_ai_operational_event(
    '21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',gen_random_uuid(),
    'whatsapp','ai_processing_failed','conversation','failure','UNKNOWN','unknown',false,1);
  RAISE EXCEPTION 'authenticated user wrote backend event';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$ BEGIN
  UPDATE public.whatsapp_ai_settings SET ai_engine_mode='active',ai_knowledge_enabled=true,ai_knowledge_validated_at=now()
  WHERE clinic_id='21000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'unsafe knowledge combination accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;

RESET ROLE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('ai_usage_events','ai_tool_execution_events','ai_knowledge_answer_events','ai_safety_events','ai_conversation_handoffs','ai_handoff_events','ai_operational_events','ai_admin_action_events')
      AND (qual='true' OR with_check='true')
  ) THEN RAISE EXCEPTION 'dangerous USING(true) policy found in AI tables'; END IF;
END $$;

ROLLBACK;
