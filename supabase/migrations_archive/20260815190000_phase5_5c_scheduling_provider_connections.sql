-- Phase 5.5C: provider-neutral scheduling connections and external entity mappings.
-- This migration deliberately contains no appointment mirror, sync cursor, webhook,
-- polling, OAuth token, or provider-specific credential storage.

CREATE TABLE public.scheduling_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  provider_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  display_name text NOT NULL,
  external_account_id text,
  external_account_name text,
  source_of_truth text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_provider_connections_id_clinic_unique UNIQUE (id, clinic_id),
  CONSTRAINT scheduling_provider_connections_provider_type_valid
    CHECK (provider_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT scheduling_provider_connections_status_valid
    CHECK (status IN ('pending', 'active', 'disconnected', 'error', 'reauthorization_required', 'disabled')),
  CONSTRAINT scheduling_provider_connections_display_name_not_blank
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT scheduling_provider_connections_external_account_not_blank
    CHECK (external_account_id IS NULL OR btrim(external_account_id) <> ''),
  CONSTRAINT scheduling_provider_connections_source_valid
    CHECK (source_of_truth IN ('aura', 'external_provider')),
  CONSTRAINT scheduling_provider_connections_capabilities_object
    CHECK (jsonb_typeof(capabilities) = 'object'),
  CONSTRAINT scheduling_provider_connections_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT scheduling_provider_connections_internal_valid
    CHECK (
      provider_type <> 'internal'
      OR (
        source_of_truth = 'aura'
        AND external_account_id IS NULL
        AND external_account_name IS NULL
      )
    ),
  CONSTRAINT scheduling_provider_connections_lifecycle_times_valid
    CHECK (disconnected_at IS NULL OR connected_at IS NULL OR disconnected_at >= connected_at)
);

CREATE UNIQUE INDEX scheduling_provider_connections_one_default_per_clinic
  ON public.scheduling_provider_connections (clinic_id)
  WHERE is_default;
CREATE UNIQUE INDEX scheduling_provider_connections_one_internal_per_clinic
  ON public.scheduling_provider_connections (clinic_id)
  WHERE provider_type = 'internal';
CREATE INDEX scheduling_provider_connections_clinic_provider
  ON public.scheduling_provider_connections (clinic_id, provider_type);
CREATE INDEX scheduling_provider_connections_clinic_status
  ON public.scheduling_provider_connections (clinic_id, status);

CREATE TABLE public.scheduling_connection_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_connection_professionals_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_connection_professionals_professional_clinic_fkey
    FOREIGN KEY (professional_id, clinic_id)
    REFERENCES public.professionals(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_connection_professionals_unique
    UNIQUE (connection_id, professional_id)
);

CREATE UNIQUE INDEX scheduling_connection_professionals_one_active_override
  ON public.scheduling_connection_professionals (clinic_id, professional_id)
  WHERE is_active;
CREATE INDEX scheduling_connection_professionals_connection
  ON public.scheduling_connection_professionals (connection_id, is_active);
CREATE INDEX scheduling_connection_professionals_clinic
  ON public.scheduling_connection_professionals (clinic_id, professional_id, is_active);

CREATE TABLE public.scheduling_location_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  location_id uuid NOT NULL,
  external_id text NOT NULL,
  external_parent_id text,
  external_name text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_location_mappings_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_location_mappings_location_clinic_fkey
    FOREIGN KEY (location_id, clinic_id)
    REFERENCES public.clinic_locations(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_location_mappings_external_id_not_blank CHECK (btrim(external_id) <> ''),
  CONSTRAINT scheduling_location_mappings_status_valid CHECK (status IN ('active', 'stale', 'invalid', 'disabled')),
  CONSTRAINT scheduling_location_mappings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.scheduling_professional_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  external_id text NOT NULL,
  external_parent_id text,
  external_name text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_professional_mappings_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_professional_mappings_professional_clinic_fkey
    FOREIGN KEY (professional_id, clinic_id)
    REFERENCES public.professionals(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_professional_mappings_external_id_not_blank CHECK (btrim(external_id) <> ''),
  CONSTRAINT scheduling_professional_mappings_status_valid CHECK (status IN ('active', 'stale', 'invalid', 'disabled')),
  CONSTRAINT scheduling_professional_mappings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.scheduling_service_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE RESTRICT,
  external_id text NOT NULL,
  external_parent_id text,
  external_name text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_service_mappings_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_service_mappings_external_id_not_blank CHECK (btrim(external_id) <> ''),
  CONSTRAINT scheduling_service_mappings_status_valid CHECK (status IN ('active', 'stale', 'invalid', 'disabled')),
  CONSTRAINT scheduling_service_mappings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.scheduling_insurance_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  health_insurance_id uuid NOT NULL,
  external_id text NOT NULL,
  external_parent_id text,
  external_name text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_insurance_mappings_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_insurance_mappings_insurance_clinic_fkey
    FOREIGN KEY (health_insurance_id, clinic_id)
    REFERENCES public.health_insurances(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_insurance_mappings_external_id_not_blank CHECK (btrim(external_id) <> ''),
  CONSTRAINT scheduling_insurance_mappings_status_valid CHECK (status IN ('active', 'stale', 'invalid', 'disabled')),
  CONSTRAINT scheduling_insurance_mappings_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE OR REPLACE FUNCTION public.enforce_scheduling_service_mapping_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.treatments t
    WHERE t.id = NEW.treatment_id AND t.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'Scheduling service mapping treatment belongs to another clinic'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.enforce_scheduling_service_mapping_tenant() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_scheduling_service_mapping_tenant
  BEFORE INSERT OR UPDATE OF clinic_id, treatment_id
  ON public.scheduling_service_mappings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scheduling_service_mapping_tenant();

DO $$
DECLARE
  mapping_table text;
  entity_column text;
BEGIN
  FOR mapping_table, entity_column IN VALUES
    ('scheduling_location_mappings', 'location_id'),
    ('scheduling_professional_mappings', 'professional_id'),
    ('scheduling_service_mappings', 'treatment_id'),
    ('scheduling_insurance_mappings', 'health_insurance_id')
  LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON public.%I (connection_id, %I) WHERE status <> ''disabled''',
      mapping_table || '_aura_active_unique', mapping_table, entity_column
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON public.%I (connection_id, external_id) WHERE status <> ''disabled''',
      mapping_table || '_external_active_unique', mapping_table
    );
    EXECUTE format(
      'CREATE INDEX %I ON public.%I (clinic_id, connection_id, status)',
      mapping_table || '_clinic_connection_status', mapping_table
    );
  END LOOP;
END
$$;

CREATE TRIGGER update_scheduling_provider_connections_updated_at
  BEFORE UPDATE ON public.scheduling_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduling_connection_professionals_updated_at
  BEFORE UPDATE ON public.scheduling_connection_professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduling_location_mappings_updated_at
  BEFORE UPDATE ON public.scheduling_location_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduling_professional_mappings_updated_at
  BEFORE UPDATE ON public.scheduling_professional_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduling_service_mappings_updated_at
  BEFORE UPDATE ON public.scheduling_service_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduling_insurance_mappings_updated_at
  BEFORE UPDATE ON public.scheduling_insurance_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scheduling_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_connection_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_location_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_professional_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_service_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_insurance_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads scheduling connections"
  ON public.scheduling_provider_connections FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Admin manages scheduling connections"
  ON public.scheduling_provider_connections FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));

CREATE POLICY "Staff reads scheduling professional assignments"
  ON public.scheduling_connection_professionals FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Admin manages scheduling professional assignments"
  ON public.scheduling_connection_professionals FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, 'admin'));

DO $$
DECLARE
  mapping_table text;
BEGIN
  FOREACH mapping_table IN ARRAY ARRAY[
    'scheduling_location_mappings',
    'scheduling_professional_mappings',
    'scheduling_service_mappings',
    'scheduling_insurance_mappings'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "Staff reads %s" ON public.%I FOR SELECT TO authenticated USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id))',
      mapping_table, mapping_table
    );
    EXECUTE format(
      'CREATE POLICY "Admin manages %s" ON public.%I FOR ALL TO authenticated USING (public.has_clinic_role((SELECT auth.uid()), clinic_id, ''admin'')) WITH CHECK (public.has_clinic_role((SELECT auth.uid()), clinic_id, ''admin''))',
      mapping_table, mapping_table
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_provider_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_connection_professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_location_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_professional_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_service_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_insurance_mappings TO authenticated;
GRANT ALL ON public.scheduling_provider_connections TO service_role;
GRANT ALL ON public.scheduling_connection_professionals TO service_role;
GRANT ALL ON public.scheduling_location_mappings TO service_role;
GRANT ALL ON public.scheduling_professional_mappings TO service_role;
GRANT ALL ON public.scheduling_service_mappings TO service_role;
GRANT ALL ON public.scheduling_insurance_mappings TO service_role;

CREATE TRIGGER audit_scheduling_provider_connections
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_scheduling_connection_professionals
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_connection_professionals
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_scheduling_location_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_location_mappings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_scheduling_professional_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_professional_mappings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_scheduling_service_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_service_mappings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_scheduling_insurance_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_insurance_mappings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE OR REPLACE FUNCTION public.create_internal_scheduling_connection_for_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.scheduling_provider_connections (
    clinic_id, provider_type, status, display_name, source_of_truth,
    capabilities, is_default, connected_at, last_verified_at
  ) VALUES (
    NEW.id, 'internal', 'active', 'Agenda Aura', 'aura',
    '{"locations":true,"professionals":true,"services":true,"insurances":true,"professionalRules":true,"readAvailability":true,"readAppointments":true,"createAppointment":true,"confirmAppointment":true,"cancelAppointment":true,"rescheduleAppointment":true,"updateAppointmentStatus":true,"markNoShow":true,"reassignProfessional":true,"readBlocks":true,"createBlock":true,"removeBlock":true,"webhooks":false,"reconciliation":false}'::jsonb,
    true, now(), now()
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.create_internal_scheduling_connection_for_clinic() FROM PUBLIC, anon, authenticated;

INSERT INTO public.scheduling_provider_connections (
  clinic_id, provider_type, status, display_name, source_of_truth,
  capabilities, is_default, connected_at, last_verified_at
)
SELECT
  c.id, 'internal', 'active', 'Agenda Aura', 'aura',
  '{"locations":true,"professionals":true,"services":true,"insurances":true,"professionalRules":true,"readAvailability":true,"readAppointments":true,"createAppointment":true,"confirmAppointment":true,"cancelAppointment":true,"rescheduleAppointment":true,"updateAppointmentStatus":true,"markNoShow":true,"reassignProfessional":true,"readBlocks":true,"createBlock":true,"removeBlock":true,"webhooks":false,"reconciliation":false}'::jsonb,
  true, now(), now()
FROM public.clinics c
ON CONFLICT DO NOTHING;

CREATE TRIGGER create_internal_scheduling_connection_after_clinic
  AFTER INSERT ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.create_internal_scheduling_connection_for_clinic();

COMMENT ON TABLE public.scheduling_provider_connections IS
  'Provider-neutral scheduling account/configuration. Contains no OAuth tokens or provider secrets.';
COMMENT ON TABLE public.scheduling_connection_professionals IS
  'Optional active provider override per professional. Clinic default remains on the connection.';
COMMENT ON TABLE public.scheduling_location_mappings IS
  'One-to-one active mapping between an Aura clinic location and a provider resource.';
COMMENT ON TABLE public.scheduling_professional_mappings IS
  'One-to-one active mapping between an Aura professional and a provider resource.';
COMMENT ON TABLE public.scheduling_service_mappings IS
  'One-to-one active mapping between an Aura treatment/service and a provider resource.';
COMMENT ON TABLE public.scheduling_insurance_mappings IS
  'One-to-one active mapping between an Aura health insurance and a provider resource.';
COMMENT ON COLUMN public.scheduling_provider_connections.provider_type IS
  'Extensible lowercase provider key; validated by format instead of a PostgreSQL enum.';
COMMENT ON COLUMN public.scheduling_provider_connections.capabilities IS
  'Effective connection capabilities normalized by the application; boolean JSON object.';
COMMENT ON COLUMN public.scheduling_provider_connections.metadata IS
  'Limited non-secret provider metadata. Credential storage is deferred to provider implementation.';
