-- Phase 5.6D: tenant-safe, source-backed administrative Knowledge Engine.
-- The LLM never queries these tables. Only the controlled application tool may read them.

ALTER TABLE public.clinic_locations
  ADD COLUMN opening_hours jsonb,
  ADD COLUMN parking_information text,
  ADD COLUMN accessibility_information text,
  ADD CONSTRAINT clinic_locations_opening_hours_object CHECK (
    opening_hours IS NULL OR (jsonb_typeof(opening_hours) = 'object' AND octet_length(opening_hours::text) <= 12000)
  ),
  ADD CONSTRAINT clinic_locations_parking_information_size CHECK (
    parking_information IS NULL OR char_length(parking_information) <= 2000
  ),
  ADD CONSTRAINT clinic_locations_accessibility_information_size CHECK (
    accessibility_information IS NULL OR char_length(accessibility_information) <= 2000
  );

ALTER TABLE public.treatments
  ADD COLUMN preparation_instructions text,
  ADD COLUMN administrative_instructions text,
  ADD CONSTRAINT treatments_preparation_instructions_size CHECK (
    preparation_instructions IS NULL OR char_length(preparation_instructions) <= 4000
  ),
  ADD CONSTRAINT treatments_administrative_instructions_size CHECK (
    administrative_instructions IS NULL OR char_length(administrative_instructions) <= 4000
  );

ALTER TABLE public.treatments
  ADD CONSTRAINT treatments_id_clinic_unique UNIQUE (id, clinic_id);

CREATE OR REPLACE FUNCTION public.administrative_text_array_is_valid(
  values_to_check text[], maximum_items integer, maximum_item_length integer
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT cardinality(values_to_check) <= maximum_items
    AND COALESCE(bool_and(char_length(btrim(item)) BETWEEN 1 AND maximum_item_length), true)
  FROM unnest(values_to_check) AS item;
$$;

CREATE TABLE public.clinic_administrative_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  arrival_minutes integer,
  arrival_instructions text,
  required_documents text[] NOT NULL DEFAULT '{}',
  companion_policy text,
  children_policy text,
  first_consultation_information text,
  allowed_payment_methods text[] NOT NULL DEFAULT '{}',
  late_policy text,
  cancellation_policy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_administrative_policies_arrival_minutes_valid CHECK (
    arrival_minutes IS NULL OR arrival_minutes BETWEEN 0 AND 180
  ),
  CONSTRAINT clinic_administrative_policies_documents_valid CHECK (
    public.administrative_text_array_is_valid(required_documents, 30, 200)
  ),
  CONSTRAINT clinic_administrative_policies_payment_methods_valid CHECK (
    public.administrative_text_array_is_valid(allowed_payment_methods, 20, 100)
  ),
  CONSTRAINT clinic_administrative_policies_text_size CHECK (
    COALESCE(char_length(arrival_instructions), 0) <= 3000
    AND COALESCE(char_length(companion_policy), 0) <= 3000
    AND COALESCE(char_length(children_policy), 0) <= 3000
    AND COALESCE(char_length(first_consultation_information), 0) <= 4000
    AND COALESCE(char_length(late_policy), 0) <= 3000
    AND COALESCE(char_length(cancellation_policy), 0) <= 3000
  )
);

CREATE TABLE public.administrative_knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  topic text NOT NULL,
  scope text NOT NULL DEFAULT 'clinic',
  location_id uuid,
  professional_id uuid,
  service_id uuid,
  insurance_id uuid,
  question text NOT NULL,
  answer text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT administrative_knowledge_entries_location_clinic_fkey
    FOREIGN KEY (location_id, clinic_id) REFERENCES public.clinic_locations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT administrative_knowledge_entries_professional_clinic_fkey
    FOREIGN KEY (professional_id, clinic_id) REFERENCES public.professionals(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT administrative_knowledge_entries_service_clinic_fkey
    FOREIGN KEY (service_id, clinic_id) REFERENCES public.treatments(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT administrative_knowledge_entries_insurance_clinic_fkey
    FOREIGN KEY (insurance_id, clinic_id) REFERENCES public.health_insurances(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT administrative_knowledge_entries_topic_valid CHECK (
    topic IN ('address', 'parking', 'accessibility', 'opening_hours', 'arrival',
      'required_documents', 'companion', 'children', 'first_consultation',
      'service_preparation', 'payment_methods', 'late_policy', 'cancellation_policy',
      'professional_information', 'insurance_information', 'contact', 'faq')
  ),
  CONSTRAINT administrative_knowledge_entries_scope_valid CHECK (
    scope IN ('clinic', 'location', 'professional', 'service', 'insurance')
  ),
  CONSTRAINT administrative_knowledge_entries_scope_reference_valid CHECK (
    (scope = 'clinic' AND location_id IS NULL AND professional_id IS NULL AND service_id IS NULL AND insurance_id IS NULL)
    OR (scope = 'location' AND location_id IS NOT NULL AND professional_id IS NULL AND service_id IS NULL AND insurance_id IS NULL)
    OR (scope = 'professional' AND location_id IS NULL AND professional_id IS NOT NULL AND service_id IS NULL AND insurance_id IS NULL)
    OR (scope = 'service' AND location_id IS NULL AND professional_id IS NULL AND service_id IS NOT NULL AND insurance_id IS NULL)
    OR (scope = 'insurance' AND location_id IS NULL AND professional_id IS NULL AND service_id IS NULL AND insurance_id IS NOT NULL)
  ),
  CONSTRAINT administrative_knowledge_entries_content_valid CHECK (
    char_length(btrim(question)) BETWEEN 3 AND 500
    AND char_length(btrim(answer)) BETWEEN 3 AND 5000
    AND public.administrative_text_array_is_valid(keywords, 30, 100)
  ),
  CONSTRAINT administrative_knowledge_entries_priority_valid CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT administrative_knowledge_entries_status_valid CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT administrative_knowledge_entries_revision_valid CHECK (revision >= 1),
  CONSTRAINT administrative_knowledge_entries_published_verified CHECK (status <> 'published' OR verified_at IS NOT NULL),
  CONSTRAINT administrative_knowledge_entries_validity_window CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX administrative_knowledge_entries_lookup
  ON public.administrative_knowledge_entries (clinic_id, status, topic, priority DESC);
CREATE INDEX administrative_knowledge_entries_scope
  ON public.administrative_knowledge_entries (clinic_id, scope, location_id, professional_id, service_id, insurance_id);

CREATE OR REPLACE FUNCTION public.bump_administrative_knowledge_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW.topic, NEW.scope, NEW.location_id, NEW.professional_id, NEW.service_id,
         NEW.insurance_id, NEW.question, NEW.answer, NEW.keywords, NEW.status,
         NEW.valid_from, NEW.valid_until)
     IS DISTINCT FROM
     ROW(OLD.topic, OLD.scope, OLD.location_id, OLD.professional_id, OLD.service_id,
         OLD.insurance_id, OLD.question, OLD.answer, OLD.keywords, OLD.status,
         OLD.valid_from, OLD.valid_until) THEN
    IF OLD.status = 'published' AND NEW.status = 'published' THEN
      RAISE EXCEPTION 'Published knowledge must return to draft before content changes' USING ERRCODE = '23514';
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.verified_at := CASE WHEN NEW.status = 'published' THEN NEW.verified_at ELSE NULL END;
    NEW.verified_by := CASE WHEN NEW.status = 'published' THEN NEW.verified_by ELSE NULL END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_administrative_knowledge_revision
  BEFORE UPDATE ON public.administrative_knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.bump_administrative_knowledge_revision();
CREATE TRIGGER update_clinic_administrative_policies_updated_at
  BEFORE UPDATE ON public.clinic_administrative_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_knowledge_answer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  topic text NOT NULL,
  outcome text NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_knowledge_answer_events_conversation_clinic_fkey
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_knowledge_answer_events_outcome_valid CHECK (outcome IN ('answered', 'not_found', 'ambiguous', 'restricted')),
  CONSTRAINT ai_knowledge_answer_events_sources_valid CHECK (
    jsonb_typeof(source_refs) = 'array' AND jsonb_array_length(source_refs) <= 8 AND octet_length(source_refs::text) <= 8000
  ),
  CONSTRAINT ai_knowledge_answer_events_latency_valid CHECK (latency_ms >= 0)
);

CREATE INDEX ai_knowledge_answer_events_clinic_occurred
  ON public.ai_knowledge_answer_events (clinic_id, occurred_at DESC);

ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN ai_knowledge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_knowledge_validated_at timestamptz,
  ADD CONSTRAINT whatsapp_ai_settings_knowledge_validation_required CHECK (
    NOT ai_knowledge_enabled OR ai_knowledge_validated_at IS NOT NULL
  );

ALTER TABLE public.ai_tool_execution_events
  DROP CONSTRAINT ai_tool_execution_events_name_valid,
  ADD CONSTRAINT ai_tool_execution_events_name_valid CHECK (
    tool_name IN ('list_locations', 'list_professionals', 'list_services', 'list_insurances',
      'get_available_slots', 'find_patient_appointments', 'create_appointment',
      'confirm_appointment', 'cancel_appointment', 'reschedule_appointment',
      'search_administrative_knowledge')
  );

ALTER TABLE public.clinic_administrative_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_answer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic staff reads administrative policies"
  ON public.clinic_administrative_policies FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Admin manages administrative policies"
  ON public.clinic_administrative_policies FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));
CREATE POLICY "Clinic staff reads administrative knowledge"
  ON public.administrative_knowledge_entries FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Admin manages administrative knowledge"
  ON public.administrative_knowledge_entries FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));
CREATE POLICY "Clinic staff reads knowledge audit"
  ON public.ai_knowledge_answer_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_administrative_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.administrative_knowledge_entries TO authenticated;
GRANT SELECT ON public.ai_knowledge_answer_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_knowledge_answer_events FROM anon, authenticated;
GRANT ALL ON public.clinic_administrative_policies, public.administrative_knowledge_entries,
  public.ai_knowledge_answer_events TO service_role;

COMMENT ON TABLE public.clinic_administrative_policies IS
  'Structured clinic-wide administrative policies consumed by the source-backed Knowledge Engine.';
COMMENT ON TABLE public.administrative_knowledge_entries IS
  'Curated and versioned administrative FAQs. Only published, verified and currently valid entries may answer patients.';
COMMENT ON TABLE public.ai_knowledge_answer_events IS
  'PHI-free audit of Knowledge Engine outcomes and source references. Stores no patient question or generated answer.';
COMMENT ON COLUMN public.whatsapp_ai_settings.ai_knowledge_enabled IS
  'Independent clinic gate for the administrative Knowledge Engine. Disabled by default.';
COMMENT ON COLUMN public.whatsapp_ai_settings.ai_knowledge_validated_at IS
  'Evidence gate set only after the tenant-safety and no-hallucination validation suite succeeds.';

REVOKE ALL ON FUNCTION public.administrative_text_array_is_valid(text[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.administrative_text_array_is_valid(text[], integer, integer) TO authenticated, service_role;
