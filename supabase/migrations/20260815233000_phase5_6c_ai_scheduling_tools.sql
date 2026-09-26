-- Phase 5.6C: controlled, typed and tenant-safe AI scheduling tools.
-- LLMs never receive database credentials and cannot call tables, RPCs or providers.

ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN ai_read_tools_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_read_tools_validated_at timestamptz,
  ADD COLUMN ai_mutation_tools_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT whatsapp_ai_settings_mutations_require_validated_reads CHECK (
    NOT ai_mutation_tools_enabled
    OR (ai_read_tools_enabled AND ai_read_tools_validated_at IS NOT NULL AND ai_engine_mode = 'active')
  );

ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT ai_usage_events_request_type_valid,
  ADD CONSTRAINT ai_usage_events_request_type_valid CHECK (
    request_type IN ('llm_response', 'conversation_interpretation', 'tool_response', 'transcription', 'vision', 'document_preprocessing')
  );

CREATE TABLE public.ai_tool_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  tool_name text NOT NULL,
  tool_kind text NOT NULL,
  outcome text NOT NULL,
  error_code text,
  latency_ms integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_tool_execution_events_conversation_clinic_fkey
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_tool_execution_events_name_valid CHECK (
    tool_name IN ('list_locations', 'list_professionals', 'list_services', 'list_insurances',
      'get_available_slots', 'find_patient_appointments', 'create_appointment',
      'confirm_appointment', 'cancel_appointment', 'reschedule_appointment')
  ),
  CONSTRAINT ai_tool_execution_events_kind_valid CHECK (tool_kind IN ('read', 'mutation')),
  CONSTRAINT ai_tool_execution_events_outcome_valid CHECK (outcome IN ('success', 'clarification_required', 'denied', 'error')),
  CONSTRAINT ai_tool_execution_events_error_valid CHECK (
    (outcome = 'success' AND error_code IS NULL)
    OR (outcome <> 'success' AND error_code IS NOT NULL AND char_length(error_code) BETWEEN 1 AND 100)
  ),
  CONSTRAINT ai_tool_execution_events_latency_valid CHECK (latency_ms >= 0)
);

CREATE INDEX ai_tool_execution_events_clinic_occurred
  ON public.ai_tool_execution_events (clinic_id, occurred_at DESC);
CREATE INDEX ai_tool_execution_events_conversation_occurred
  ON public.ai_tool_execution_events (conversation_id, occurred_at DESC);

CREATE TABLE public.ai_tool_mutation_claims (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  tool_name text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, correlation_id, tool_name),
  CONSTRAINT ai_tool_mutation_claims_conversation_clinic_fkey
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_tool_mutation_claims_name_valid CHECK (
    tool_name IN ('create_appointment', 'confirm_appointment', 'cancel_appointment', 'reschedule_appointment')
  )
);

ALTER TABLE public.ai_tool_execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_mutation_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic staff reads AI tool execution events"
  ON public.ai_tool_execution_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

REVOKE INSERT, UPDATE, DELETE ON public.ai_tool_execution_events FROM anon, authenticated;
REVOKE ALL ON public.ai_tool_mutation_claims FROM anon, authenticated;
GRANT SELECT ON public.ai_tool_execution_events TO authenticated;
GRANT ALL ON public.ai_tool_execution_events, public.ai_tool_mutation_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_tool_mutation(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_correlation_id uuid,
  p_tool_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_tool_name NOT IN ('create_appointment', 'confirm_appointment', 'cancel_appointment', 'reschedule_appointment') THEN
    RAISE EXCEPTION 'AI_TOOL_MUTATION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_ai_conversations
    WHERE id = p_conversation_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'AI_TOOL_CONVERSATION_TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ai_tool_mutation_claims (clinic_id, conversation_id, correlation_id, tool_name)
  VALUES (p_clinic_id, p_conversation_id, p_correlation_id, p_tool_name)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_tool_mutation(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_tool_mutation(uuid, uuid, uuid, text) TO service_role;

COMMENT ON COLUMN public.whatsapp_ai_settings.ai_read_tools_enabled IS
  'Clinic gate for read-only Aura tools. Disabled by default.';
COMMENT ON COLUMN public.whatsapp_ai_settings.ai_read_tools_validated_at IS
  'Evidence gate set only after the 5.6C.1 read-only validation suite succeeds.';
COMMENT ON COLUMN public.whatsapp_ai_settings.ai_mutation_tools_enabled IS
  'Clinic gate for scheduling mutations; requires active engine and validated read tools.';
COMMENT ON TABLE public.ai_tool_execution_events IS
  'PHI-free technical audit of typed Aura tool executions. Stores no arguments, result payloads, prompts or responses.';
COMMENT ON TABLE public.ai_tool_mutation_claims IS
  'Atomic idempotency claims for Aura scheduling mutations, keyed by tenant, correlation and tool.';
