-- Phase 5.6B: small, versioned conversational state with optimistic concurrency.
-- State is operational context only: no history, prompt, media, tool result,
-- availability, appointment truth, price truth, or long-term patient memory.

ALTER TABLE public.whatsapp_ai_conversations
  ADD COLUMN conversation_state jsonb NOT NULL DEFAULT '{"schemaVersion":1,"activeIntent":"unknown","activeIntentStatus":"collecting","entities":{},"constraints":{"excludedProfessionals":[],"excludedInsurances":[],"excludedTimePreferences":[]},"lastPresentedOptions":[]}'::jsonb,
  ADD COLUMN state_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN state_updated_at timestamptz,
  ADD CONSTRAINT whatsapp_ai_conversations_state_shape_valid CHECK (
    jsonb_typeof(conversation_state) = 'object'
    AND conversation_state->>'schemaVersion' = '1'
    AND jsonb_typeof(conversation_state->'entities') = 'object'
    AND jsonb_typeof(conversation_state->'constraints') = 'object'
    AND jsonb_typeof(conversation_state->'lastPresentedOptions') = 'array'
    AND octet_length(conversation_state::text) <= 16384
  ),
  ADD CONSTRAINT whatsapp_ai_conversations_state_revision_valid CHECK (state_revision >= 0);

ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT ai_usage_events_request_type_valid,
  ADD CONSTRAINT ai_usage_events_request_type_valid CHECK (
    request_type IN ('llm_response', 'conversation_interpretation', 'transcription', 'vision', 'document_preprocessing')
  );

CREATE OR REPLACE FUNCTION public.update_whatsapp_ai_conversation_state(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_expected_revision integer,
  p_state jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision integer;
BEGIN
  IF jsonb_typeof(p_state) <> 'object'
    OR p_state->>'schemaVersion' <> '1'
    OR jsonb_typeof(p_state->'entities') <> 'object'
    OR jsonb_typeof(p_state->'constraints') <> 'object'
    OR jsonb_typeof(p_state->'lastPresentedOptions') <> 'array'
    OR octet_length(p_state::text) > 16384
  THEN
    RAISE EXCEPTION 'AI_CONVERSATION_STATE_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.whatsapp_ai_conversations
  SET conversation_state = p_state,
      state_revision = state_revision + 1,
      state_updated_at = now()
  WHERE id = p_conversation_id
    AND clinic_id = p_clinic_id
    AND state_revision = p_expected_revision
  RETURNING state_revision INTO v_revision;

  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'AI_CONVERSATION_STATE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('state', p_state, 'revision', v_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.update_whatsapp_ai_conversation_state(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_whatsapp_ai_conversation_state(uuid, uuid, integer, jsonb) TO service_role;

-- Staff keeps the existing conversation controls, but conversational state is a
-- technical backend write. Column grants prevent accidental UI mutation.
REVOKE UPDATE ON public.whatsapp_ai_conversations FROM authenticated;
GRANT SELECT ON public.whatsapp_ai_conversations TO authenticated;
GRANT UPDATE (
  lead_id, contact_name, status, ai_enabled, last_inbound_at, last_outbound_at,
  last_message_at, metadata, updated_at
) ON public.whatsapp_ai_conversations TO authenticated;

COMMENT ON COLUMN public.whatsapp_ai_conversations.conversation_state IS
  'Versioned, clinic-scoped operational conversation context. Never a source of scheduling truth or long-term memory.';
COMMENT ON COLUMN public.whatsapp_ai_conversations.state_revision IS
  'Optimistic concurrency counter incremented atomically by update_whatsapp_ai_conversation_state.';
COMMENT ON FUNCTION public.update_whatsapp_ai_conversation_state(uuid, uuid, integer, jsonb) IS
  'Service-role-only compare-and-swap for Aura conversation state; raises SQLSTATE 40001 on a stale revision.';
