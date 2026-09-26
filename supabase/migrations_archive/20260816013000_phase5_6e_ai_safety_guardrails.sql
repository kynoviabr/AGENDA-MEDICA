-- Phase 5.6E: mandatory final response safety barrier for the new Aura engine.
-- No prompt, message, draft, tool payload, PII or PHI is persisted here.

ALTER TABLE public.administrative_knowledge_entries
  ADD COLUMN patient_visible boolean NOT NULL DEFAULT false;

CREATE INDEX administrative_knowledge_entries_patient_lookup
  ON public.administrative_knowledge_entries (clinic_id, status, patient_visible, topic, priority DESC);

CREATE TABLE public.ai_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  disposition text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  validator text NOT NULL,
  grounded boolean NOT NULL,
  latency_ms integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_safety_events_conversation_clinic_fkey
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_safety_events_disposition_valid CHECK (
    disposition IN ('allow', 'rewrite_safe', 'block', 'require_clarification', 'require_handoff')
  ),
  CONSTRAINT ai_safety_events_categories_valid CHECK (
    public.administrative_text_array_is_valid(categories, 20, 80)
  ),
  CONSTRAINT ai_safety_events_validator_valid CHECK (char_length(validator) BETWEEN 1 AND 80),
  CONSTRAINT ai_safety_events_latency_valid CHECK (latency_ms >= 0)
);

CREATE INDEX ai_safety_events_clinic_occurred
  ON public.ai_safety_events (clinic_id, occurred_at DESC);
CREATE INDEX ai_safety_events_conversation_occurred
  ON public.ai_safety_events (conversation_id, occurred_at DESC);

ALTER TABLE public.ai_safety_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic staff reads AI safety events"
  ON public.ai_safety_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

REVOKE INSERT, UPDATE, DELETE ON public.ai_safety_events FROM anon, authenticated;
GRANT SELECT ON public.ai_safety_events TO authenticated;
GRANT ALL ON public.ai_safety_events TO service_role;

COMMENT ON COLUMN public.administrative_knowledge_entries.patient_visible IS
  'Explicit patient visibility gate. Published content remains unavailable to Aura until separately marked visible.';
COMMENT ON TABLE public.ai_safety_events IS
  'PHI-free technical audit of the mandatory deterministic response validator. Stores no input, draft or final text.';
