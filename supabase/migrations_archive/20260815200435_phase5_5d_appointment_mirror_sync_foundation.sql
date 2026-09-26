-- Phase 5.5D: normalized appointment mirror and reconciliation foundation.
-- No provider API, OAuth credential, raw payload, webhook, polling, worker,
-- outbox dispatch, or reconciliation job is implemented by this migration.

ALTER TABLE public.appointments
  ADD COLUMN provider_type text NOT NULL DEFAULT 'internal',
  ADD COLUMN connection_id uuid,
  ADD COLUMN external_appointment_id text,
  ADD COLUMN source_of_truth text NOT NULL DEFAULT 'aura',
  ADD COLUMN sync_state text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN event_origin text NOT NULL DEFAULT 'system',
  ADD COLUMN raw_provider_status text,
  ADD COLUMN external_version text,
  ADD COLUMN external_etag text,
  ADD COLUMN last_synced_at timestamptz,
  ADD COLUMN last_provider_seen_at timestamptz,
  ADD COLUMN is_tombstone boolean NOT NULL DEFAULT false,
  ADD COLUMN tombstoned_at timestamptz,
  ADD COLUMN unmapped_entity_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN last_sync_error_code text,
  ADD COLUMN last_sync_error_message text,
  ADD COLUMN last_sync_error_at timestamptz,
  ADD COLUMN sync_conflict_code text,
  ADD COLUMN sync_conflict_at timestamptz;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_provider_type_valid
    CHECK (provider_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  ADD CONSTRAINT appointments_external_id_not_blank
    CHECK (external_appointment_id IS NULL OR btrim(external_appointment_id) <> ''),
  ADD CONSTRAINT appointments_source_of_truth_valid
    CHECK (source_of_truth IN ('aura', 'external_provider')),
  ADD CONSTRAINT appointments_sync_state_valid
    CHECK (sync_state IN (
      'not_applicable', 'synced', 'pending_create', 'pending_update',
      'pending_cancel', 'conflict', 'error', 'stale', 'tombstoned'
    )),
  ADD CONSTRAINT appointments_event_origin_valid
    CHECK (event_origin IN (
      'agenda_ui', 'aura_ai', 'micro_crm', 'waitlist', 'system',
      'external_provider', 'provider_import', 'reconciliation'
    )),
  ADD CONSTRAINT appointments_provider_identity_valid
    CHECK (
      (
        provider_type = 'internal'
        AND source_of_truth = 'aura'
        AND external_appointment_id IS NULL
        AND sync_state = 'not_applicable'
      )
      OR
      (
        provider_type <> 'internal'
        AND connection_id IS NOT NULL
        AND sync_state <> 'not_applicable'
        AND (external_appointment_id IS NOT NULL OR sync_state = 'pending_create')
      )
    ),
  ADD CONSTRAINT appointments_external_source_valid
    CHECK (source_of_truth <> 'external_provider' OR provider_type <> 'internal'),
  ADD CONSTRAINT appointments_tombstone_valid
    CHECK (
      (
        NOT is_tombstone
        AND tombstoned_at IS NULL
        AND sync_state <> 'tombstoned'
      )
      OR
      (
        is_tombstone
        AND tombstoned_at IS NOT NULL
        AND sync_state = 'tombstoned'
        AND provider_type <> 'internal'
      )
    ),
  ADD CONSTRAINT appointments_unmapped_entities_valid
    CHECK (
      unmapped_entity_types <@ ARRAY['location', 'professional', 'service', 'insurance']::text[]
      AND (
        cardinality(unmapped_entity_types) = 0
        OR (source_of_truth = 'external_provider' AND sync_state = 'conflict')
      )
    ),
  ADD CONSTRAINT appointments_sync_error_code_length
    CHECK (last_sync_error_code IS NULL OR char_length(last_sync_error_code) <= 100),
  ADD CONSTRAINT appointments_sync_error_message_length
    CHECK (last_sync_error_message IS NULL OR char_length(last_sync_error_message) <= 1000),
  ADD CONSTRAINT appointments_sync_conflict_code_length
    CHECK (sync_conflict_code IS NULL OR char_length(sync_conflict_code) <= 100);

CREATE UNIQUE INDEX appointments_connection_external_identity_unique
  ON public.appointments (connection_id, external_appointment_id)
  WHERE external_appointment_id IS NOT NULL;
CREATE INDEX appointments_connection_sync_state
  ON public.appointments (connection_id, sync_state)
  WHERE connection_id IS NOT NULL;
CREATE INDEX appointments_clinic_provider_start
  ON public.appointments (clinic_id, provider_type, start_time);
CREATE INDEX appointments_external_stale_scan
  ON public.appointments (connection_id, last_synced_at, last_provider_seen_at)
  WHERE source_of_truth = 'external_provider' AND NOT is_tombstone;

-- Internal/Aura rows retain the exact Phase 5 overlap protection. External
-- authoritative mirrors may preserve provider state even when it conflicts.
ALTER TABLE public.appointments
  DROP CONSTRAINT appointments_no_professional_overlap;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_professional_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (
    professional_id IS NOT NULL
    AND source_of_truth = 'aura'
    AND status IN ('scheduled', 'confirmed', 'in_progress')
  );

CREATE OR REPLACE FUNCTION public.validate_appointment_provider_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  connection_provider text;
  connection_status text;
BEGIN
  IF current_user = 'authenticated'
     AND (
       NEW.source_of_truth = 'external_provider'
       OR NEW.provider_type <> 'internal'
       OR (TG_OP = 'UPDATE' AND OLD.source_of_truth = 'external_provider')
       OR (TG_OP = 'UPDATE' AND OLD.provider_type <> 'internal')
     ) THEN
    RAISE EXCEPTION 'AGENDA_PROVIDER_WRITE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NEW.connection_id IS NOT NULL THEN
    SELECT c.provider_type, c.status
      INTO connection_provider, connection_status
    FROM public.scheduling_provider_connections c
    WHERE c.id = NEW.connection_id AND c.clinic_id = NEW.clinic_id;

    IF connection_provider IS NULL THEN
      RAISE EXCEPTION 'AGENDA_CONNECTION_TENANT_MISMATCH' USING ERRCODE = '23503';
    END IF;
    IF connection_provider <> NEW.provider_type THEN
      RAISE EXCEPTION 'AGENDA_CONNECTION_PROVIDER_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.provider_type <> 'internal' AND connection_status <> 'active' THEN
      RAISE EXCEPTION 'AGENDA_CONNECTION_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.validate_appointment_provider_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_appointment_provider_identity
  BEFORE INSERT OR UPDATE
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_provider_identity();

CREATE TABLE public.scheduling_reconciliation_states (
  connection_id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'idle',
  checkpoint text,
  sync_token text,
  checkpoint_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_reconciliation_states_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_reconciliation_states_status_valid
    CHECK (status IN ('idle', 'running', 'error')),
  CONSTRAINT scheduling_reconciliation_states_checkpoint_metadata_object
    CHECK (jsonb_typeof(checkpoint_metadata) = 'object'),
  CONSTRAINT scheduling_reconciliation_states_failures_valid
    CHECK (consecutive_failures >= 0),
  CONSTRAINT scheduling_reconciliation_states_error_code_length
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 100),
  CONSTRAINT scheduling_reconciliation_states_error_message_length
    CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 1000),
  CONSTRAINT scheduling_reconciliation_states_times_valid
    CHECK (last_completed_at IS NULL OR last_started_at IS NULL OR last_completed_at >= last_started_at)
);

CREATE INDEX scheduling_reconciliation_states_clinic_status
  ON public.scheduling_reconciliation_states (clinic_id, status);
CREATE INDEX scheduling_reconciliation_states_error_scan
  ON public.scheduling_reconciliation_states (status, last_error_at)
  WHERE status = 'error';

CREATE TRIGGER update_scheduling_reconciliation_states_updated_at
  BEFORE UPDATE ON public.scheduling_reconciliation_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.scheduling_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  provider_type text NOT NULL,
  external_event_id text,
  payload_hash text,
  event_type text NOT NULL,
  external_appointment_id text,
  processing_status text NOT NULL DEFAULT 'pending',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_provider_events_connection_clinic_fkey
    FOREIGN KEY (connection_id, clinic_id)
    REFERENCES public.scheduling_provider_connections(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_provider_events_provider_type_valid
    CHECK (provider_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT scheduling_provider_events_identity_valid
    CHECK (
      (external_event_id IS NOT NULL AND btrim(external_event_id) <> '')
      OR (payload_hash IS NOT NULL AND btrim(payload_hash) <> '')
    ),
  CONSTRAINT scheduling_provider_events_event_type_not_blank
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT scheduling_provider_events_external_appointment_not_blank
    CHECK (external_appointment_id IS NULL OR btrim(external_appointment_id) <> ''),
  CONSTRAINT scheduling_provider_events_status_valid
    CHECK (processing_status IN ('pending', 'processed', 'ignored', 'error')),
  CONSTRAINT scheduling_provider_events_error_code_length
    CHECK (error_code IS NULL OR char_length(error_code) <= 100),
  CONSTRAINT scheduling_provider_events_error_message_length
    CHECK (error_message IS NULL OR char_length(error_message) <= 1000)
);

CREATE UNIQUE INDEX scheduling_provider_events_external_id_unique
  ON public.scheduling_provider_events (connection_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE UNIQUE INDEX scheduling_provider_events_payload_hash_unique
  ON public.scheduling_provider_events (connection_id, payload_hash)
  WHERE external_event_id IS NULL AND payload_hash IS NOT NULL;
CREATE INDEX scheduling_provider_events_pending
  ON public.scheduling_provider_events (connection_id, processing_status, received_at);
CREATE INDEX scheduling_provider_events_external_appointment
  ON public.scheduling_provider_events (connection_id, external_appointment_id)
  WHERE external_appointment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_scheduling_provider_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  connection_provider text;
BEGIN
  SELECT c.provider_type INTO connection_provider
  FROM public.scheduling_provider_connections c
  WHERE c.id = NEW.connection_id AND c.clinic_id = NEW.clinic_id;

  IF connection_provider IS NULL THEN
    RAISE EXCEPTION 'SCHEDULING_EVENT_CONNECTION_TENANT_MISMATCH' USING ERRCODE = '23503';
  END IF;
  IF connection_provider <> NEW.provider_type THEN
    RAISE EXCEPTION 'SCHEDULING_EVENT_PROVIDER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.validate_scheduling_provider_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_scheduling_provider_event
  BEFORE INSERT OR UPDATE OF clinic_id, connection_id, provider_type
  ON public.scheduling_provider_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_scheduling_provider_event();
CREATE TRIGGER update_scheduling_provider_events_updated_at
  BEFORE UPDATE ON public.scheduling_provider_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scheduling_reconciliation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads scheduling reconciliation state"
  ON public.scheduling_reconciliation_states FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Staff reads scheduling provider events"
  ON public.scheduling_provider_events FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

REVOKE INSERT, UPDATE, DELETE ON public.scheduling_reconciliation_states FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scheduling_provider_events FROM anon, authenticated;
GRANT SELECT ON public.scheduling_reconciliation_states TO authenticated;
GRANT SELECT ON public.scheduling_provider_events TO authenticated;
GRANT ALL ON public.scheduling_reconciliation_states TO service_role;
GRANT ALL ON public.scheduling_provider_events TO service_role;

COMMENT ON COLUMN public.appointments.provider_type IS
  'Provider-neutral adapter key. Existing/internal appointments default to internal.';
COMMENT ON COLUMN public.appointments.connection_id IS
  'Scheduling connection owning an external or provider-backed normalized appointment.';
COMMENT ON COLUMN public.appointments.external_appointment_id IS
  'Provider appointment identifier stored as text and unique within a connection.';
COMMENT ON COLUMN public.appointments.source_of_truth IS
  'Write authority: aura allows local authority; external_provider requires provider write.';
COMMENT ON COLUMN public.appointments.sync_state IS
  'Appointment mirror synchronization state, separate from connection and reconciliation lifecycle.';
COMMENT ON COLUMN public.appointments.unmapped_entity_types IS
  'Technical entity categories unresolved during external import. No Aura entity is auto-created.';
COMMENT ON COLUMN public.appointments.last_sync_error_message IS
  'Sanitized technical message only; never store headers, tokens, raw payloads, PHI, or stack traces.';
COMMENT ON TABLE public.scheduling_reconciliation_states IS
  'One provider-neutral reconciliation checkpoint per scheduling connection. No job is implemented.';
COMMENT ON TABLE public.scheduling_provider_events IS
  'Idempotency inbox metadata without raw provider payloads. No webhook or polling is implemented.';
