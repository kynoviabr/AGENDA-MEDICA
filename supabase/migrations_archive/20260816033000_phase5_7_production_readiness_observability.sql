-- Phase 5.7: additive production-readiness, observability and pilot controls.
-- No feature is enabled and no patient/conversation content is persisted here.

-- Legacy onboarding allowed any authenticated user to insert an arbitrary clinic.
-- Clinic creation is already mediated by the authenticated create-clinic Edge Function.
DROP POLICY IF EXISTS "Authenticated users can create clinics" ON public.clinics;
REVOKE INSERT ON public.clinics FROM authenticated;

CREATE TABLE public.ai_operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid,
  correlation_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  event_type text NOT NULL,
  component text NOT NULL,
  outcome text NOT NULL,
  error_code text,
  error_category text,
  retryable boolean,
  latency_ms integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_operational_events_conversation_tenant_fk
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_operational_events_channel_valid CHECK (channel IN ('whatsapp','web','internal')),
  CONSTRAINT ai_operational_events_type_valid CHECK (event_type IN (
    'whatsapp_inbound_received','whatsapp_inbound_rejected',
    'ai_processing_started','ai_processing_completed','ai_processing_failed',
    'llm_request','llm_failure','tool_execution','tool_failure','knowledge_lookup',
    'safety_validation','handoff_requested','handoff_accepted',
    'outbound_attempt','outbound_success','outbound_failure'
  )),
  CONSTRAINT ai_operational_events_component_valid CHECK (component IN (
    'edge','database','openai','whatsapp','conversation','tool','knowledge','safety','handoff','outbound'
  )),
  CONSTRAINT ai_operational_events_outcome_valid CHECK (outcome IN ('success','failure','rejected')),
  CONSTRAINT ai_operational_events_error_shape CHECK (
    (outcome = 'success' AND error_code IS NULL AND error_category IS NULL AND retryable IS NULL)
    OR (outcome <> 'success' AND error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'
      AND error_category IN ('provider_timeout','provider_rate_limit','invalid_provider_response','database_error',
        'rpc_conflict','tool_denied','knowledge_unavailable','safety_fail_closed','whatsapp_send_failure','configuration_error','unknown')
      AND retryable IS NOT NULL)
  ),
  CONSTRAINT ai_operational_events_latency_valid CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

CREATE INDEX ai_operational_events_clinic_occurred
  ON public.ai_operational_events (clinic_id, occurred_at DESC);
CREATE INDEX ai_operational_events_clinic_type_outcome
  ON public.ai_operational_events (clinic_id, event_type, outcome, occurred_at DESC);

CREATE TABLE public.ai_admin_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('settings_created','feature_gates_changed')),
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_admin_action_events_state_objects CHECK (
    jsonb_typeof(previous_state) = 'object' AND jsonb_typeof(next_state) = 'object'
    AND pg_column_size(previous_state) <= 2048 AND pg_column_size(next_state) <= 2048
  )
);

CREATE INDEX ai_admin_action_events_clinic_occurred
  ON public.ai_admin_action_events (clinic_id, occurred_at DESC);

ALTER TABLE public.ai_operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_action_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic staff reads AI operational events"
  ON public.ai_operational_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Clinic admins read AI admin actions"
  ON public.ai_admin_action_events FOR SELECT TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.ai_operational_events, public.ai_admin_action_events FROM anon, authenticated;
GRANT SELECT ON public.ai_operational_events TO authenticated;
GRANT SELECT ON public.ai_admin_action_events TO authenticated;
GRANT ALL ON public.ai_operational_events, public.ai_admin_action_events TO service_role;
-- Existing inbox policies were present, but explicit table SELECT grants were missing
-- on fresh databases. RLS remains the tenant boundary.
GRANT SELECT ON public.whatsapp_ai_conversations, public.whatsapp_ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_ai_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_feature_gate_snapshot(p_row public.whatsapp_ai_settings)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'clinic_enabled', p_row.is_enabled,
    'engine_mode', p_row.ai_engine_mode,
    'read_enabled', p_row.ai_read_tools_enabled,
    'read_validated', p_row.ai_read_tools_validated_at IS NOT NULL,
    'mutation_enabled', p_row.ai_mutation_tools_enabled,
    'knowledge_enabled', p_row.ai_knowledge_enabled,
    'knowledge_validated', p_row.ai_knowledge_validated_at IS NOT NULL,
    'handoff_enabled', p_row.ai_handoff_enabled,
    'handoff_validated', p_row.ai_handoff_validated_at IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.audit_ai_feature_gate_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_previous jsonb := '{}'::jsonb; v_next jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_previous := public.ai_feature_gate_snapshot(OLD); END IF;
  v_next := public.ai_feature_gate_snapshot(NEW);
  IF TG_OP = 'INSERT' OR v_previous IS DISTINCT FROM v_next THEN
    INSERT INTO public.ai_admin_action_events(clinic_id, actor_user_id, action, previous_state, next_state)
    VALUES (NEW.clinic_id, (SELECT auth.uid()), CASE WHEN TG_OP='INSERT' THEN 'settings_created' ELSE 'feature_gates_changed' END, v_previous, v_next);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.ai_feature_gate_snapshot(public.whatsapp_ai_settings) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.audit_ai_feature_gate_change() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS audit_whatsapp_ai_feature_gates ON public.whatsapp_ai_settings;
CREATE TRIGGER audit_whatsapp_ai_feature_gates
  AFTER INSERT OR UPDATE OF is_enabled, ai_engine_mode, ai_read_tools_enabled, ai_read_tools_validated_at,
    ai_mutation_tools_enabled, ai_knowledge_enabled, ai_knowledge_validated_at,
    ai_handoff_enabled, ai_handoff_validated_at
  ON public.whatsapp_ai_settings FOR EACH ROW EXECUTE FUNCTION public.audit_ai_feature_gate_change();

ALTER TABLE public.whatsapp_ai_settings
  ADD CONSTRAINT whatsapp_ai_settings_production_gate_dependencies CHECK (
    (NOT ai_read_tools_enabled OR ai_engine_mode IN ('shadow','active'))
    AND (NOT ai_knowledge_enabled OR (ai_engine_mode='active' AND ai_read_tools_enabled
      AND ai_read_tools_validated_at IS NOT NULL AND ai_knowledge_validated_at IS NOT NULL))
    AND (NOT ai_handoff_enabled OR (ai_engine_mode='active' AND ai_handoff_validated_at IS NOT NULL))
    AND (NOT ai_mutation_tools_enabled OR (ai_engine_mode='active' AND ai_read_tools_enabled
      AND ai_read_tools_validated_at IS NOT NULL))
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.record_ai_operational_event(
  p_clinic_id uuid, p_conversation_id uuid, p_correlation_id uuid,
  p_channel text, p_event_type text, p_component text, p_outcome text,
  p_error_code text DEFAULT NULL, p_error_category text DEFAULT NULL,
  p_retryable boolean DEFAULT NULL, p_latency_ms integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN RAISE EXCEPTION 'OPERATIONAL_EVENT_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
  INSERT INTO public.ai_operational_events(clinic_id,conversation_id,correlation_id,channel,event_type,component,outcome,error_code,error_category,retryable,latency_ms)
  VALUES (p_clinic_id,p_conversation_id,p_correlation_id,p_channel,p_event_type,p_component,p_outcome,p_error_code,p_error_category,p_retryable,p_latency_ms);
END $$;

REVOKE ALL ON FUNCTION public.record_ai_operational_event(uuid,uuid,uuid,text,text,text,text,text,text,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_operational_event(uuid,uuid,uuid,text,text,text,text,text,text,boolean,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_aura_pilot_snapshot(p_clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_settings public.whatsapp_ai_settings; v_result jsonb;
BEGIN
  IF NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AURA_PILOT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_settings FROM public.whatsapp_ai_settings WHERE clinic_id=p_clinic_id;
  SELECT jsonb_build_object(
    'databaseAvailable',true,
    'whatsappConfigured',EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE clinic_id=p_clinic_id AND status='connected'),
    'hasLocation',EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=p_clinic_id AND active),
    'hasProfessional',EXISTS(SELECT 1 FROM public.professionals WHERE clinic_id=p_clinic_id AND status='active'),
    'hasService',EXISTS(SELECT 1 FROM public.treatments WHERE clinic_id=p_clinic_id AND is_active),
    'hasInsurance',EXISTS(SELECT 1 FROM public.health_insurances WHERE clinic_id=p_clinic_id AND status='active'),
    'hasSchedulingRules',EXISTS(SELECT 1 FROM public.professional_settings WHERE clinic_id=p_clinic_id),
    'authorizedStaffCount',(SELECT count(*) FROM public.user_roles WHERE clinic_id=p_clinic_id AND is_active),
    'publishedKnowledgeCount',(SELECT count(*) FROM public.administrative_knowledge_entries WHERE clinic_id=p_clinic_id AND status='published' AND verified_at IS NOT NULL),
    'gates',CASE WHEN v_settings.clinic_id IS NULL THEN jsonb_build_object(
      'clinicEnabled',false,'engineMode','legacy','readEnabled',false,'readValidated',false,
      'mutationEnabled',false,'knowledgeEnabled',false,'knowledgeValidated',false,
      'handoffEnabled',false,'handoffValidated',false
    ) ELSE jsonb_build_object(
      'clinicEnabled',v_settings.is_enabled,'engineMode',v_settings.ai_engine_mode,
      'readEnabled',v_settings.ai_read_tools_enabled,'readValidated',v_settings.ai_read_tools_validated_at IS NOT NULL,
      'mutationEnabled',v_settings.ai_mutation_tools_enabled,
      'knowledgeEnabled',v_settings.ai_knowledge_enabled,'knowledgeValidated',v_settings.ai_knowledge_validated_at IS NOT NULL,
      'handoffEnabled',v_settings.ai_handoff_enabled,'handoffValidated',v_settings.ai_handoff_validated_at IS NOT NULL)
    END
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_aura_pilot_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_aura_pilot_snapshot(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_aura_operational_metrics(p_clinic_id uuid,p_since timestamptz,p_until timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb; v_eligible bigint; v_handoff_conversations bigint;
BEGIN
  IF NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AURA_METRICS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_since IS NULL OR p_until IS NULL OR p_since>=p_until OR p_until-p_since>interval '31 days' THEN RAISE EXCEPTION 'AURA_METRICS_RANGE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT count(DISTINCT conversation_id) INTO v_eligible FROM public.ai_usage_events WHERE clinic_id=p_clinic_id AND occurred_at>=p_since AND occurred_at<p_until;
  SELECT count(DISTINCT conversation_id) INTO v_handoff_conversations FROM public.ai_conversation_handoffs WHERE clinic_id=p_clinic_id AND requested_at>=p_since AND requested_at<p_until;
  SELECT jsonb_build_object(
    'from',p_since,'to',p_until,
    'conversations',(SELECT count(DISTINCT conversation_id) FROM public.whatsapp_ai_messages WHERE clinic_id=p_clinic_id AND created_at>=p_since AND created_at<p_until),
    'inboundMessages',(SELECT count(*) FROM public.whatsapp_ai_messages WHERE clinic_id=p_clinic_id AND direction='inbound' AND created_at>=p_since AND created_at<p_until),
    'aiResponses',(SELECT count(*) FROM public.whatsapp_ai_messages WHERE clinic_id=p_clinic_id AND direction='outbound' AND message_origin='ai' AND created_at>=p_since AND created_at<p_until),
    'aiFailures',(SELECT count(*) FROM public.ai_usage_events WHERE clinic_id=p_clinic_id AND outcome='error' AND occurred_at>=p_since AND occurred_at<p_until),
    'toolCalls',(SELECT count(*) FROM public.ai_tool_execution_events WHERE clinic_id=p_clinic_id AND occurred_at>=p_since AND occurred_at<p_until),
    'toolFailures',(SELECT count(*) FROM public.ai_tool_execution_events WHERE clinic_id=p_clinic_id AND outcome IN ('denied','error') AND occurred_at>=p_since AND occurred_at<p_until),
    'mutationAttempts',(SELECT count(*) FROM public.ai_tool_execution_events WHERE clinic_id=p_clinic_id AND tool_kind='mutation' AND occurred_at>=p_since AND occurred_at<p_until),
    'mutationSuccesses',(SELECT count(*) FROM public.ai_tool_execution_events WHERE clinic_id=p_clinic_id AND tool_kind='mutation' AND outcome='success' AND occurred_at>=p_since AND occurred_at<p_until),
    'mutationFailures',(SELECT count(*) FROM public.ai_tool_execution_events WHERE clinic_id=p_clinic_id AND tool_kind='mutation' AND outcome IN ('denied','error') AND occurred_at>=p_since AND occurred_at<p_until),
    'knowledge',(SELECT COALESCE(jsonb_object_agg(outcome,total),'{}'::jsonb) FROM (SELECT outcome,count(*) total FROM public.ai_knowledge_answer_events WHERE clinic_id=p_clinic_id AND occurred_at>=p_since AND occurred_at<p_until GROUP BY outcome) q),
    'safety',(SELECT COALESCE(jsonb_object_agg(disposition,total),'{}'::jsonb) FROM (SELECT disposition,count(*) total FROM public.ai_safety_events WHERE clinic_id=p_clinic_id AND occurred_at>=p_since AND occurred_at<p_until GROUP BY disposition) q),
    'handoffs',(SELECT count(*) FROM public.ai_conversation_handoffs WHERE clinic_id=p_clinic_id AND requested_at>=p_since AND requested_at<p_until),
    'handoffsByReason',(SELECT COALESCE(jsonb_object_agg(reason,total),'{}'::jsonb) FROM (SELECT reason,count(*) total FROM public.ai_conversation_handoffs WHERE clinic_id=p_clinic_id AND requested_at>=p_since AND requested_at<p_until GROUP BY reason) q),
    'humanTakeovers',(SELECT count(*) FROM public.ai_handoff_events WHERE clinic_id=p_clinic_id AND action='accepted' AND occurred_at>=p_since AND occurred_at<p_until),
    'outboundFailures',(SELECT count(*) FROM public.ai_operational_events WHERE clinic_id=p_clinic_id AND event_type='outbound_failure' AND occurred_at>=p_since AND occurred_at<p_until),
    'eligibleAiConversations',v_eligible,
    'containmentRate',CASE WHEN v_eligible=0 THEN NULL ELSE round(GREATEST(v_eligible-v_handoff_conversations,0)::numeric/v_eligible,4) END,
    'handoffRate',CASE WHEN v_eligible=0 THEN NULL ELSE round(v_handoff_conversations::numeric/v_eligible,4) END,
    'latency',(SELECT jsonb_build_object('count',count(*),'averageMs',COALESCE(round(avg(total_latency_ms)),0),'p50Ms',COALESCE(percentile_cont(.5) WITHIN GROUP(ORDER BY total_latency_ms),0),'p95Ms',COALESCE(percentile_cont(.95) WITHIN GROUP(ORDER BY total_latency_ms),0)) FROM public.ai_usage_events WHERE clinic_id=p_clinic_id AND occurred_at>=p_since AND occurred_at<p_until)
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_aura_operational_metrics(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_aura_operational_metrics(uuid,timestamptz,timestamptz) TO authenticated,service_role;

COMMENT ON TABLE public.ai_operational_events IS 'PHI-free operational gap events for channel lifecycle and failures; no message, prompt, transcript, phone, patient name, token or raw provider payload.';
COMMENT ON TABLE public.ai_admin_action_events IS 'Audit of AI feature-gate changes containing only booleans/mode and technical actor IDs.';
COMMENT ON CONSTRAINT whatsapp_ai_settings_production_gate_dependencies ON public.whatsapp_ai_settings IS 'NOT VALID preserves legacy rows while enforcing safe gate combinations on new/updated settings.';
