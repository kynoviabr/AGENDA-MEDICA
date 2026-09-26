-- Phase 5.6A: provider-neutral AI metering and safe rollout configuration.
-- No prompt, media bytes, raw provider payload, token, API key, appointment
-- mutation, scheduling tool, knowledge base, or long-term memory is persisted.

ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN ai_engine_mode text NOT NULL DEFAULT 'legacy',
  ADD COLUMN preferred_language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN response_style text NOT NULL DEFAULT 'curta, profissional e acolhedora',
  ADD CONSTRAINT whatsapp_ai_settings_engine_mode_valid
    CHECK (ai_engine_mode IN ('legacy', 'shadow', 'active')),
  ADD CONSTRAINT whatsapp_ai_settings_preferred_language_valid
    CHECK (preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  ADD CONSTRAINT whatsapp_ai_settings_response_style_length
    CHECK (char_length(btrim(response_style)) BETWEEN 1 AND 160);

ALTER TABLE public.whatsapp_ai_conversations
  ADD CONSTRAINT whatsapp_ai_conversations_id_clinic_unique UNIQUE (id, clinic_id);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  channel text NOT NULL,
  message_type text NOT NULL,
  request_type text NOT NULL,
  provider text NOT NULL,
  model text,
  input_units integer,
  output_units integer,
  total_units integer,
  preprocessing_latency_ms integer,
  provider_latency_ms integer,
  total_latency_ms integer NOT NULL,
  outcome text NOT NULL,
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_events_conversation_clinic_fkey
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_usage_events_channel_valid
    CHECK (channel IN ('whatsapp', 'web', 'internal')),
  CONSTRAINT ai_usage_events_message_type_valid
    CHECK (message_type IN ('text', 'audio', 'image', 'document')),
  CONSTRAINT ai_usage_events_request_type_valid
    CHECK (request_type IN ('llm_response', 'transcription', 'vision', 'document_preprocessing')),
  CONSTRAINT ai_usage_events_provider_valid
    CHECK (provider ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT ai_usage_events_model_not_blank
    CHECK (model IS NULL OR btrim(model) <> ''),
  CONSTRAINT ai_usage_events_units_valid
    CHECK (
      (input_units IS NULL OR input_units >= 0)
      AND (output_units IS NULL OR output_units >= 0)
      AND (total_units IS NULL OR total_units >= 0)
    ),
  CONSTRAINT ai_usage_events_latency_valid
    CHECK (
      (preprocessing_latency_ms IS NULL OR preprocessing_latency_ms >= 0)
      AND (provider_latency_ms IS NULL OR provider_latency_ms >= 0)
      AND total_latency_ms >= 0
    ),
  CONSTRAINT ai_usage_events_outcome_valid
    CHECK (outcome IN ('success', 'error')),
  CONSTRAINT ai_usage_events_error_valid
    CHECK (
      (outcome = 'success' AND error_code IS NULL)
      OR (outcome = 'error' AND error_code IS NOT NULL AND char_length(error_code) BETWEEN 1 AND 100)
    )
);

CREATE INDEX ai_usage_events_clinic_occurred
  ON public.ai_usage_events (clinic_id, occurred_at DESC);
CREATE INDEX ai_usage_events_conversation_occurred
  ON public.ai_usage_events (conversation_id, occurred_at DESC);
CREATE INDEX ai_usage_events_clinic_request_outcome
  ON public.ai_usage_events (clinic_id, request_type, outcome, occurred_at DESC);
CREATE UNIQUE INDEX ai_usage_events_correlation_request_unique
  ON public.ai_usage_events (clinic_id, correlation_id, request_type)
  WHERE request_type = 'llm_response';

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic staff reads AI usage events"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

REVOKE INSERT, UPDATE, DELETE ON public.ai_usage_events FROM anon, authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

COMMENT ON COLUMN public.whatsapp_ai_settings.ai_engine_mode IS
  'Safe rollout flag: legacy is default, shadow never sends Aura output, active sends only Aura output.';
COMMENT ON TABLE public.ai_usage_events IS
  'Clinic-scoped AI metering without prompts, responses, media, URLs, tokens, headers, PHI, or raw provider payloads.';
COMMENT ON COLUMN public.ai_usage_events.correlation_id IS
  'Technical UUID propagated across ingestion, processing, LLM, usage and outbound handling; never derived from PII.';
