-- AURA CLEAN BASELINE
-- Canonical local schema generated from the finalized cleanup state on 2026-08-20.
--
-- Layout follows dependency order: extensions, enums, dependency-first tables,
-- functions/RPCs, remaining tables, constraints, indexes, triggers, RLS,
-- policies, explicit grants, and storage configuration.
-- Historical evolution lives exclusively in supabase/migrations_archive/.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET check_function_bodies = false;
SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Public schema: enums, relations, routines, integrity, RLS and explicit ACLs
-- ---------------------------------------------------------------------------

-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'receptionist',
    'professional'
);


--
-- Name: appointment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."appointment_status" AS ENUM (
    'scheduled',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
    'rescheduled'
);


--
-- Name: patient_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."patient_status" AS ENUM (
    'active',
    'inactive',
    'pending'
);


--
-- Name: reminder_channel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."reminder_channel" AS ENUM (
    'whatsapp',
    'email',
    'sms'
);


--
-- Name: reminder_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."reminder_status" AS ENUM (
    'pending',
    'sent',
    'failed',
    'cancelled'
);


--
-- Name: waitlist_contact_preference; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."waitlist_contact_preference" AS ENUM (
    'whatsapp',
    'phone',
    'email'
);


--
-- Name: waitlist_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."waitlist_priority" AS ENUM (
    'normal',
    'high',
    'urgent'
);


--
-- Name: waitlist_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."waitlist_status" AS ENUM (
    'waiting',
    'match_found',
    'contact_attempted',
    'scheduled',
    'expired',
    'cancelled_by_patient',
    'cancelled_by_clinic'
);


--
-- Name: waitlist_window_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."waitlist_window_type" AS ENUM (
    'this_week',
    'next_week',
    'this_month',
    'custom'
);


--
-- Name: administrative_text_array_is_valid("text"[], integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."administrative_text_array_is_valid"("values_to_check" "text"[], "maximum_items" integer, "maximum_item_length" integer) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT cardinality(values_to_check) <= maximum_items
    AND COALESCE(bool_and(char_length(btrim(item)) BETWEEN 1 AND maximum_item_length), true)
  FROM unnest(values_to_check) AS item;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: whatsapp_ai_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whatsapp_ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "display_phone_number" "text",
    "phone_number_id_last4" "text",
    "openai_model" "text" DEFAULT 'gpt-5.6-luna'::"text" NOT NULL,
    "welcome_message" "text",
    "handoff_message" "text" DEFAULT 'Vou chamar uma pessoa da equipe para te ajudar melhor.'::"text" NOT NULL,
    "default_goal" "text" DEFAULT 'Conduzir leads para uma avaliacao humana.'::"text" NOT NULL,
    "webhook_verify_token_configured" boolean DEFAULT false NOT NULL,
    "meta_app_secret_configured" boolean DEFAULT false NOT NULL,
    "openai_key_configured" boolean DEFAULT false NOT NULL,
    "meta_token_configured" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_engine_mode" "text" DEFAULT 'legacy'::"text" NOT NULL,
    "preferred_language" "text" DEFAULT 'pt-BR'::"text" NOT NULL,
    "response_style" "text" DEFAULT 'curta, profissional e acolhedora'::"text" NOT NULL,
    "ai_read_tools_enabled" boolean DEFAULT false NOT NULL,
    "ai_read_tools_validated_at" timestamp with time zone,
    "ai_mutation_tools_enabled" boolean DEFAULT false NOT NULL,
    "ai_knowledge_enabled" boolean DEFAULT false NOT NULL,
    "ai_knowledge_validated_at" timestamp with time zone,
    "ai_handoff_enabled" boolean DEFAULT false NOT NULL,
    "ai_handoff_validated_at" timestamp with time zone,
    CONSTRAINT "whatsapp_ai_settings_engine_mode_valid" CHECK (("ai_engine_mode" = ANY (ARRAY['legacy'::"text", 'shadow'::"text", 'active'::"text"]))),
    CONSTRAINT "whatsapp_ai_settings_handoff_gate_valid" CHECK (((NOT "ai_handoff_enabled") OR (("ai_handoff_validated_at" IS NOT NULL) AND ("ai_engine_mode" = 'active'::"text")))),
    CONSTRAINT "whatsapp_ai_settings_knowledge_validation_required" CHECK (((NOT "ai_knowledge_enabled") OR ("ai_knowledge_validated_at" IS NOT NULL))),
    CONSTRAINT "whatsapp_ai_settings_mutations_require_validated_reads" CHECK (((NOT "ai_mutation_tools_enabled") OR ("ai_read_tools_enabled" AND ("ai_read_tools_validated_at" IS NOT NULL) AND ("ai_engine_mode" = 'active'::"text")))),
    CONSTRAINT "whatsapp_ai_settings_preferred_language_valid" CHECK (("preferred_language" ~ '^[a-z]{2}(-[A-Z]{2})?$'::"text")),
    CONSTRAINT "whatsapp_ai_settings_response_style_length" CHECK ((("char_length"("btrim"("response_style")) >= 1) AND ("char_length"("btrim"("response_style")) <= 160)))
);


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_engine_mode"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_engine_mode" IS 'Safe rollout flag: legacy is default, shadow never sends Aura output, active sends only Aura output.';


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_read_tools_enabled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_read_tools_enabled" IS 'Clinic gate for read-only Aura tools. Disabled by default.';


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_read_tools_validated_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_read_tools_validated_at" IS 'Evidence gate set only after the 5.6C.1 read-only validation suite succeeds.';


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_mutation_tools_enabled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_mutation_tools_enabled" IS 'Clinic gate for scheduling mutations; requires active engine and validated read tools.';


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_knowledge_enabled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_knowledge_enabled" IS 'Independent clinic gate for the administrative Knowledge Engine. Disabled by default.';


--
-- Name: COLUMN "whatsapp_ai_settings"."ai_knowledge_validated_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_settings"."ai_knowledge_validated_at" IS 'Evidence gate set only after the tenant-safety and no-hallucination validation suite succeeds.';


--
-- Name: ai_feature_gate_snapshot("public"."whatsapp_ai_settings"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."ai_feature_gate_snapshot"("p_row" "public"."whatsapp_ai_settings") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: assert_appointment_slot("uuid", "uuid", "uuid", "uuid", timestamp with time zone, timestamp with time zone, "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assert_appointment_slot"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_ignore_appointment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
BEGIN
  IF current_user <> 'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_professional_id IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'AGENDA_INVALID_PERIOD' USING ERRCODE = '22023';
  END IF;

  SELECT l.timezone INTO v_timezone FROM public.clinic_locations l
  WHERE l.id = p_location_id AND l.clinic_id = p_clinic_id AND l.active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations pl WHERE pl.clinic_id = p_clinic_id
    AND pl.location_id = p_location_id AND pl.professional_id = p_professional_id AND pl.active) THEN
    RAISE EXCEPTION 'AGENDA_PROFESSIONAL_NOT_AT_LOCATION' USING ERRCODE = '23503';
  END IF;
  IF p_treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_treatments pt
    WHERE pt.clinic_id = p_clinic_id AND pt.professional_id = p_professional_id
      AND pt.treatment_id = p_treatment_id AND pt.status = 'active') THEN
    RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE = '23503';
  END IF;

  v_local_start := p_start_time AT TIME ZONE v_timezone;
  v_local_end := p_end_time AT TIME ZONE v_timezone;
  IF v_local_start::date <> (v_local_end - interval '1 microsecond')::date OR NOT EXISTS (
    SELECT 1 FROM public.get_effective_working_periods(
      p_clinic_id, p_location_id, p_professional_id, v_local_start::date
    ) period
    WHERE period.start_time <= v_local_start::time AND period.end_time >= v_local_end::time
  ) THEN
    RAISE EXCEPTION 'AGENDA_OUTSIDE_OPERATING_HOURS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.appointment_blocks b WHERE b.clinic_id = p_clinic_id
    AND b.location_id = p_location_id AND (b.professional_id IS NULL OR b.professional_id = p_professional_id)
    AND tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')) THEN
    RAISE EXCEPTION 'AGENDA_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointments a WHERE a.professional_id = p_professional_id
    AND a.status IN ('scheduled', 'confirmed', 'in_progress')
    AND (p_ignore_appointment_id IS NULL OR a.id <> p_ignore_appointment_id)
    AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')) THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
  END IF;
END
$$;


--
-- Name: audit_ai_feature_gate_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."audit_ai_feature_gate_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: audit_trigger_func(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."audit_trigger_func"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _clinic_id UUID;
  _action TEXT;
BEGIN
  _action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    _clinic_id := OLD.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data)
    VALUES (_clinic_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (_clinic_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, new_data)
    VALUES (_clinic_id, auth.uid(), 'insert', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: auth_clinic_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auth_clinic_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT clinic_id FROM public.user_roles
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY (role::text = 'admin') DESC, created_at ASC, clinic_id ASC
  LIMIT 1
$$;


--
-- Name: auth_user_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auth_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY (role::text = 'admin') DESC, created_at ASC, clinic_id ASC
  LIMIT 1
$$;


--
-- Name: authorize_human_conversation_outbound("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."authorize_human_conversation_outbound"("p_clinic_id" "uuid", "p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.whatsapp_ai_conversations c
    WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id AND c.control_mode='human_active'
      AND c.assigned_user_id=(SELECT auth.uid())
      AND public.is_clinic_staff((SELECT auth.uid()),p_clinic_id)
  )
$$;


--
-- Name: bump_administrative_knowledge_revision(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."bump_administrative_knowledge_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "professional_id" "uuid",
    "treatment_id" "uuid",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'scheduled'::"public"."appointment_status" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "appointment_type" "text" DEFAULT 'consultation'::"text" NOT NULL,
    "lead_id" "uuid",
    "scheduled_at" timestamp with time zone,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "cancelled_reason" "text",
    "no_show_reason" "text",
    "rescheduled_from" "uuid",
    "rescheduled_to" "uuid",
    "confirmed_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "is_batch" boolean DEFAULT false NOT NULL,
    "batch_id" "uuid",
    "location_id" "uuid",
    "billing_type" "text" DEFAULT 'private'::"text" NOT NULL,
    "health_insurance_id" "uuid",
    "provider_type" "text" DEFAULT 'internal'::"text" NOT NULL,
    "connection_id" "uuid",
    "external_appointment_id" "text",
    "source_of_truth" "text" DEFAULT 'aura'::"text" NOT NULL,
    "sync_state" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "event_origin" "text" DEFAULT 'system'::"text" NOT NULL,
    "raw_provider_status" "text",
    "external_version" "text",
    "external_etag" "text",
    "last_synced_at" timestamp with time zone,
    "last_provider_seen_at" timestamp with time zone,
    "is_tombstone" boolean DEFAULT false NOT NULL,
    "tombstoned_at" timestamp with time zone,
    "unmapped_entity_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_sync_error_code" "text",
    "last_sync_error_message" "text",
    "last_sync_error_at" timestamp with time zone,
    "sync_conflict_code" "text",
    "sync_conflict_at" timestamp with time zone,
    CONSTRAINT "appointments_appointment_type_check" CHECK (("appointment_type" = ANY (ARRAY['first_visit'::"text", 'consultation'::"text", 'return_or_post_op'::"text", 'maintenance'::"text", 'procedure'::"text"]))),
    CONSTRAINT "appointments_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['private'::"text", 'insurance'::"text"]))),
    CONSTRAINT "appointments_event_origin_valid" CHECK (("event_origin" = ANY (ARRAY['agenda_ui'::"text", 'aura_ai'::"text", 'micro_crm'::"text", 'waitlist'::"text", 'system'::"text", 'external_provider'::"text", 'provider_import'::"text", 'reconciliation'::"text"]))),
    CONSTRAINT "appointments_external_id_not_blank" CHECK ((("external_appointment_id" IS NULL) OR ("btrim"("external_appointment_id") <> ''::"text"))),
    CONSTRAINT "appointments_external_source_valid" CHECK ((("source_of_truth" <> 'external_provider'::"text") OR ("provider_type" <> 'internal'::"text"))),
    CONSTRAINT "appointments_provider_identity_valid" CHECK (((("provider_type" = 'internal'::"text") AND ("source_of_truth" = 'aura'::"text") AND ("external_appointment_id" IS NULL) AND ("sync_state" = 'not_applicable'::"text")) OR (("provider_type" <> 'internal'::"text") AND ("connection_id" IS NOT NULL) AND ("sync_state" <> 'not_applicable'::"text") AND (("external_appointment_id" IS NOT NULL) OR ("sync_state" = 'pending_create'::"text"))))),
    CONSTRAINT "appointments_provider_type_valid" CHECK (("provider_type" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "appointments_source_of_truth_valid" CHECK (("source_of_truth" = ANY (ARRAY['aura'::"text", 'external_provider'::"text"]))),
    CONSTRAINT "appointments_sync_conflict_code_length" CHECK ((("sync_conflict_code" IS NULL) OR ("char_length"("sync_conflict_code") <= 100))),
    CONSTRAINT "appointments_sync_error_code_length" CHECK ((("last_sync_error_code" IS NULL) OR ("char_length"("last_sync_error_code") <= 100))),
    CONSTRAINT "appointments_sync_error_message_length" CHECK ((("last_sync_error_message" IS NULL) OR ("char_length"("last_sync_error_message") <= 1000))),
    CONSTRAINT "appointments_sync_state_valid" CHECK (("sync_state" = ANY (ARRAY['not_applicable'::"text", 'synced'::"text", 'pending_create'::"text", 'pending_update'::"text", 'pending_cancel'::"text", 'conflict'::"text", 'error'::"text", 'stale'::"text", 'tombstoned'::"text"]))),
    CONSTRAINT "appointments_tombstone_valid" CHECK ((((NOT "is_tombstone") AND ("tombstoned_at" IS NULL) AND ("sync_state" <> 'tombstoned'::"text")) OR ("is_tombstone" AND ("tombstoned_at" IS NOT NULL) AND ("sync_state" = 'tombstoned'::"text") AND ("provider_type" <> 'internal'::"text")))),
    CONSTRAINT "appointments_unmapped_entities_valid" CHECK ((("unmapped_entity_types" <@ ARRAY['location'::"text", 'professional'::"text", 'service'::"text", 'insurance'::"text"]) AND (("cardinality"("unmapped_entity_types") = 0) OR (("source_of_truth" = 'external_provider'::"text") AND ("sync_state" = 'conflict'::"text"))))),
    CONSTRAINT "appointments_valid_period" CHECK (("end_time" > "start_time"))
);


--
-- Name: COLUMN "appointments"."professional_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."professional_id" IS 'Canonical professional identity; references public.professionals.id.';


--
-- Name: COLUMN "appointments"."appointment_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."appointment_type" IS 'Canonical Aura appointment classification.';


--
-- Name: COLUMN "appointments"."provider_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."provider_type" IS 'Provider-neutral adapter key. Existing/internal appointments default to internal.';


--
-- Name: COLUMN "appointments"."connection_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."connection_id" IS 'Scheduling connection owning an external or provider-backed normalized appointment.';


--
-- Name: COLUMN "appointments"."external_appointment_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."external_appointment_id" IS 'Provider appointment identifier stored as text and unique within a connection.';


--
-- Name: COLUMN "appointments"."source_of_truth"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."source_of_truth" IS 'Write authority: aura allows local authority; external_provider requires provider write.';


--
-- Name: COLUMN "appointments"."sync_state"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."sync_state" IS 'Appointment mirror synchronization state, separate from connection and reconciliation lifecycle.';


--
-- Name: COLUMN "appointments"."unmapped_entity_types"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."unmapped_entity_types" IS 'Technical entity categories unresolved during external import. No Aura entity is auto-created.';


--
-- Name: COLUMN "appointments"."last_sync_error_message"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."appointments"."last_sync_error_message" IS 'Sanitized technical message only; never store headers, tokens, raw payloads, PHI, or stack traces.';


--
-- Name: cancel_appointment_secure("uuid", "uuid", "text", "public"."appointment_status"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cancel_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_reason" "text", "p_status" "public"."appointment_status" DEFAULT 'cancelled'::"public"."appointment_status") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  IF p_status NOT IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_CANCELLATION_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = p_status,
      cancelled_reason = CASE
        WHEN p_status = 'cancelled' THEN p_reason
        ELSE cancelled_reason
      END,
      no_show_reason = CASE
        WHEN p_status = 'no_show' THEN p_reason
        ELSE no_show_reason
      END
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;


--
-- Name: cancel_stale_appointment_reminders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cancel_stale_appointment_reminders"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status IN ('cancelled','no_show') OR NEW.is_tombstone THEN
    UPDATE public.appointment_reminders SET status='cancelled',executed_at=now(),
      skip_reason='appointment_cancelled',processing_started_at=NULL
    WHERE appointment_id=NEW.id AND clinic_id=NEW.clinic_id
      AND automation_key IN ('appointment_reminder_7d','appointment_reminder_24h')
      AND status IN ('pending','failed') AND sent_at IS NULL;
  ELSIF NEW.status='rescheduled' OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    UPDATE public.appointment_reminders SET status='cancelled',executed_at=now(),
      skip_reason='appointment_rescheduled',processing_started_at=NULL
    WHERE appointment_id=NEW.id AND clinic_id=NEW.clinic_id
      AND automation_key IN ('appointment_reminder_7d','appointment_reminder_24h')
      AND status IN ('pending','failed') AND sent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: claim_ai_tool_mutation("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."claim_ai_tool_mutation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_tool_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


--
-- Name: appointment_reminders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."appointment_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "channel" "public"."reminder_channel" DEFAULT 'whatsapp'::"public"."reminder_channel" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "public"."reminder_status" DEFAULT 'pending'::"public"."reminder_status" NOT NULL,
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "automation_key" "text",
    "appointment_start_time" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "skip_reason" "text",
    "error_category" "text",
    "processing_started_at" timestamp with time zone,
    "delivery_attempted_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "provider_message_id" "text",
    "template_name" "text",
    CONSTRAINT "appointment_reminders_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "appointment_reminders_automation_key_check" CHECK ((("automation_key" IS NULL) OR ("automation_key" = ANY (ARRAY['appointment_reminder_7d'::"text", 'appointment_reminder_24h'::"text"])))),
    CONSTRAINT "appointment_reminders_skip_reason_check" CHECK ((("skip_reason" IS NULL) OR ("skip_reason" = ANY (ARRAY['appointment_cancelled'::"text", 'appointment_rescheduled'::"text", 'automation_disabled'::"text", 'already_sent'::"text", 'patient_without_whatsapp'::"text", 'template_unavailable'::"text", 'outside_scope'::"text", 'appointment_ineligible'::"text"]))))
);


--
-- Name: claim_appointment_reminders("text", "uuid", timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."claim_appointment_reminders"("p_automation_key" "text" DEFAULT NULL::"text", "p_clinic_id" "uuid" DEFAULT NULL::"uuid", "p_now" timestamp with time zone DEFAULT "now"(), "p_limit" integer DEFAULT 50) RETURNS SETOF "public"."appointment_reminders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY WITH claimable AS (
    SELECT r.id FROM public.appointment_reminders r
    WHERE r.automation_key IN ('appointment_reminder_7d','appointment_reminder_24h')
      AND (p_automation_key IS NULL OR r.automation_key=p_automation_key)
      AND r.status='pending' AND r.scheduled_for<=p_now AND r.sent_at IS NULL AND r.delivery_attempted_at IS NULL
      AND (r.processing_started_at IS NULL OR r.processing_started_at<p_now-interval '15 minutes')
      AND (p_clinic_id IS NULL OR r.clinic_id=p_clinic_id)
    ORDER BY r.scheduled_for,r.created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,200))
  ) UPDATE public.appointment_reminders r SET processing_started_at=p_now,
      attempt_count=r.attempt_count+1
    FROM claimable c WHERE r.id=c.id RETURNING r.*;
END $$;


--
-- Name: FUNCTION "claim_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."claim_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) IS 'Atomic at-most-once claim shared by canonical appointment reminder keys.';


--
-- Name: daily_agenda_summary_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."daily_agenda_summary_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "automation_key" "text" DEFAULT 'daily_agenda_summary'::"text" NOT NULL,
    "local_date" "date" NOT NULL,
    "timezone" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "skip_reason" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "processing_started_at" timestamp with time zone,
    "delivery_attempted_at" timestamp with time zone,
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "error_category" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_agenda_summary_executions_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "daily_agenda_summary_executions_automation_key_check" CHECK (("automation_key" = 'daily_agenda_summary'::"text")),
    CONSTRAINT "daily_agenda_summary_executions_skip_reason_check" CHECK ((("skip_reason" IS NULL) OR ("skip_reason" = ANY (ARRAY['automation_disabled'::"text", 'professional_inactive'::"text", 'professional_without_whatsapp'::"text", 'no_appointments_today'::"text", 'template_unavailable'::"text", 'already_sent'::"text"])))),
    CONSTRAINT "daily_agenda_summary_executions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);


--
-- Name: TABLE "daily_agenda_summary_executions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."daily_agenda_summary_executions" IS 'Technical audit only; message body and recipient PII are intentionally not stored.';


--
-- Name: claim_daily_agenda_summaries("uuid", timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."claim_daily_agenda_summaries"("p_clinic_id" "uuid" DEFAULT NULL::"uuid", "p_now" timestamp with time zone DEFAULT "now"(), "p_limit" integer DEFAULT 100) RETURNS SETOF "public"."daily_agenda_summary_executions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'AUTOMATION_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  UPDATE public.daily_agenda_summary_executions SET status='pending',processing_started_at=NULL
  WHERE status='processing' AND delivery_attempted_at IS NULL AND processing_started_at<p_now-interval '15 minutes'
    AND (p_clinic_id IS NULL OR clinic_id=p_clinic_id);
  RETURN QUERY WITH claimable AS (
    SELECT e.id FROM public.daily_agenda_summary_executions e
    WHERE e.status='pending' AND e.scheduled_for<=p_now AND e.sent_at IS NULL AND e.delivery_attempted_at IS NULL
      AND (p_clinic_id IS NULL OR e.clinic_id=p_clinic_id)
    ORDER BY e.scheduled_for,e.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE public.daily_agenda_summary_executions e SET status='processing',processing_started_at=p_now,attempt_count=e.attempt_count+1
    FROM claimable c WHERE e.id=c.id RETURNING e.*;
END $$;


--
-- Name: FUNCTION "claim_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."claim_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) IS 'Atomic SKIP LOCKED claim with stale recovery only before an external delivery attempt.';


--
-- Name: waitlist_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."waitlist_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "waitlist_id" "uuid" NOT NULL,
    "matched_slot_start" timestamp with time zone NOT NULL,
    "matched_slot_end" timestamp with time zone NOT NULL,
    "matched_professional_id" "uuid",
    "notification_sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action_taken" "text" DEFAULT 'none'::"text" NOT NULL,
    "action_taken_by" "uuid",
    "action_taken_at" timestamp with time zone,
    "resulting_appointment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_id" "uuid",
    "treatment_id" "uuid",
    "health_insurance_id" "uuid",
    "billing_type" "text",
    "appointment_type" "text",
    "duration_minutes" integer,
    "offer_status" "text" DEFAULT 'offered'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "invalidated_at" timestamp with time zone,
    "delivery_attempted_at" timestamp with time zone,
    "provider_message_id" "text",
    "result_code" "text",
    "error_category" "text",
    CONSTRAINT "waitlist_notification_slot_valid" CHECK (("matched_slot_end" > "matched_slot_start")),
    CONSTRAINT "waitlist_notifications_duration_check" CHECK ((("duration_minutes" IS NULL) OR (("duration_minutes" >= 5) AND ("duration_minutes" <= 480)))),
    CONSTRAINT "waitlist_notifications_offer_status_check" CHECK (("offer_status" = ANY (ARRAY['offered'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'invalidated'::"text", 'completed'::"text"])))
);


--
-- Name: TABLE "waitlist_notifications"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."waitlist_notifications" IS 'Canonical waitlist offer ledger. A match never creates an appointment; completed requires explicit acceptance and authoritative revalidation.';


--
-- Name: claim_waitlist_offer("uuid", "uuid", "uuid", "uuid", timestamp with time zone, timestamp with time zone, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."claim_waitlist_offer"("p_clinic_id" "uuid", "p_waitlist_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_slot_start" timestamp with time zone, "p_slot_end" timestamp with time zone, "p_duration_minutes" integer, "p_now" timestamp with time zone DEFAULT "now"()) RETURNS SETOF "public"."waitlist_notifications"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_entry public.appointment_waitlist; v_settings public.waitlist_matching_settings; v_offer public.waitlist_notifications;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'WAITLIST_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_settings FROM public.waitlist_matching_settings WHERE clinic_id=p_clinic_id AND is_enabled;
  IF NOT FOUND OR v_settings.template_status<>'approved' THEN RETURN; END IF;
  SELECT * INTO v_entry FROM public.appointment_waitlist WHERE id=p_waitlist_id AND clinic_id=p_clinic_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR v_entry.status<>'waiting' OR v_entry.window_start>p_slot_start::date OR v_entry.window_end<p_slot_start::date THEN RETURN; END IF;
  IF v_entry.location_id IS NOT NULL AND v_entry.location_id<>p_location_id THEN RETURN; END IF;
  IF v_entry.preferred_professional_id IS NOT NULL AND v_entry.preferred_professional_id<>p_professional_id THEN RETURN; END IF;
  IF p_slot_end<=p_slot_start OR p_duration_minutes<v_entry.min_duration_minutes THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.waitlist_notifications(
      clinic_id,waitlist_id,location_id,matched_professional_id,matched_slot_start,matched_slot_end,
      treatment_id,health_insurance_id,billing_type,appointment_type,duration_minutes,offer_status,expires_at,
      action_taken,notification_sent_at
    ) VALUES(
      p_clinic_id,v_entry.id,p_location_id,p_professional_id,p_slot_start,p_slot_end,
      v_entry.treatment_id,v_entry.health_insurance_id,v_entry.billing_type,v_entry.appointment_type,p_duration_minutes,'offered',
      p_now+make_interval(mins=>v_settings.offer_ttl_minutes),'none',p_now
    ) RETURNING * INTO v_offer;
  EXCEPTION WHEN unique_violation THEN RETURN;
  END;
  UPDATE public.appointment_waitlist SET status='match_found',match_found_at=p_now,last_checked_at=p_now WHERE id=v_entry.id AND clinic_id=p_clinic_id;
  RETURN NEXT v_offer;
END $$;


--
-- Name: confirm_appointment_secure("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed',
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;


--
-- Name: FUNCTION "confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid") IS 'Tenant-explicit canonical appointment confirmation.';


--
-- Name: create_appointment_with_type_secure("uuid", "uuid", "uuid", "uuid", "uuid", "uuid", timestamp with time zone, "text", "text", integer, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_appointment_with_type_secure"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_patient_id" "uuid", "p_lead_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_appointment_type" "text", "p_notes" "text" DEFAULT NULL::"text", "p_duration_minutes" integer DEFAULT NULL::integer, "p_billing_type" "text" DEFAULT 'private'::"text", "p_health_insurance_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_duration integer; v_end timestamptz; v_result public.appointments;
BEGIN
  IF p_appointment_type NOT IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN RAISE EXCEPTION 'AGENDA_INVALID_APPOINTMENT_TYPE' USING ERRCODE='22023'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_patient_id IS NULL AND p_lead_id IS NULL THEN RAISE EXCEPTION 'AGENDA_PATIENT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id=p_patient_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_PATIENT_INVALID' USING ERRCODE='23503'; END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id=p_lead_id AND clinic_id=p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_LEAD_INVALID' USING ERRCODE='23503'; END IF;
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id,p_appointment_type
  ) terms;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,p_location_id,p_professional_id,p_treatment_id,p_start_time,v_end,NULL);
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,start_time,end_time,
    scheduled_at,duration_minutes,appointment_type,notes,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,p_location_id,p_professional_id,p_patient_id,p_lead_id,p_treatment_id,p_start_time,v_end,
    p_start_time,v_duration,p_appointment_type,p_notes,(SELECT auth.uid()),p_billing_type,
    CASE WHEN p_billing_type='insurance' THEN p_health_insurance_id ELSE NULL END
  ) RETURNING * INTO v_result;
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END
$$;


--
-- Name: create_internal_scheduling_connection_for_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_internal_scheduling_connection_for_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: create_primary_location_for_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_primary_location_for_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
 INSERT INTO public.clinic_locations(clinic_id,name,address_line,city,state,zip_code,phone,is_primary)
 VALUES(NEW.id,'Unidade Principal',NEW.address,NEW.city,NEW.state,NEW.zip_code,NEW.phone,true) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;


--
-- Name: create_settings_for_professional(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_settings_for_professional"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN INSERT INTO public.professional_settings(clinic_id,professional_id) VALUES(NEW.clinic_id,NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;


--
-- Name: determine_patient_appointment_type("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."determine_patient_appointment_type"("p_clinic_id" "uuid", "p_patient_id" "uuid", "p_professional_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_patient_id IS NULL OR p_professional_id IS NULL THEN RETURN 'unknown'; END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.patients
       WHERE id = p_patient_id AND clinic_id = p_clinic_id
     ) OR NOT EXISTS (
       SELECT 1 FROM public.professionals
       WHERE id = p_professional_id AND clinic_id = p_clinic_id
     ) THEN
    RETURN 'unknown';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.clinic_id = p_clinic_id
      AND appointment.patient_id = p_patient_id
      AND appointment.professional_id = p_professional_id
      AND appointment.status = 'completed'
      AND NOT appointment.is_tombstone
      AND appointment.completed_at IS NOT NULL
  ) THEN
    RETURN 'consultation';
  END IF;
  RETURN 'first_visit';
END
$$;


--
-- Name: enforce_agenda_professional_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_agenda_professional_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  professional_column text := TG_ARGV[0];
  professional_value uuid;
BEGIN
  professional_value := NULLIF(to_jsonb(NEW) ->> professional_column, '')::uuid;
  IF professional_value IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.professionals AS professional
    WHERE professional.id = professional_value
      AND professional.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'Professional % does not belong to clinic %', professional_value, NEW.clinic_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: enforce_location_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_location_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE loc uuid := NULLIF(to_jsonb(NEW)->>TG_ARGV[0],'')::uuid;
BEGIN
 IF loc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clinic_locations l WHERE l.id=loc AND l.clinic_id=NEW.clinic_id) THEN RAISE EXCEPTION 'Location % does not belong to clinic %',loc,NEW.clinic_id USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;


--
-- Name: enforce_professional_rule_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_professional_rule_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'professional_treatments' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.treatments t
      WHERE t.id = NEW.treatment_id
        AND t.clinic_id = NEW.clinic_id
    ) THEN
      RAISE EXCEPTION 'Treatment belongs to another clinic' USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'professional_health_insurances' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.health_insurances h
      WHERE h.id = NEW.health_insurance_id
        AND h.clinic_id = NEW.clinic_id
    ) THEN
      RAISE EXCEPTION 'Insurance belongs to another clinic' USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported table for professional tenant enforcement: %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: enforce_professional_serves_location(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_professional_serves_location"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
 IF NEW.professional_id IS NOT NULL AND NEW.location_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.professional_locations pl WHERE pl.clinic_id=NEW.clinic_id AND pl.professional_id=NEW.professional_id AND pl.location_id=NEW.location_id AND pl.active
 ) THEN RAISE EXCEPTION 'Professional % is not active at location %',NEW.professional_id,NEW.location_id USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


--
-- Name: enforce_scheduling_service_mapping_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_scheduling_service_mapping_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


--
-- Name: enqueue_appointment_reminders("text", "uuid", timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enqueue_appointment_reminders"("p_automation_key" "text" DEFAULT NULL::"text", "p_clinic_id" "uuid" DEFAULT NULL::"uuid", "p_now" timestamp with time zone DEFAULT "now"(), "p_limit" integer DEFAULT 500) RETURNS TABLE("queued" integer, "cancelled" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_queued integer:=0; v_cancelled integer:=0;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_automation_key IS NOT NULL AND p_automation_key NOT IN ('appointment_reminder_7d','appointment_reminder_24h')
    THEN RAISE EXCEPTION 'AUTOMATION_KEY_INVALID' USING ERRCODE='22023'; END IF;
  IF p_limit<1 OR p_limit>2000 THEN RAISE EXCEPTION 'AUTOMATION_LIMIT_INVALID' USING ERRCODE='22023'; END IF;

  UPDATE public.appointment_reminders r SET status='cancelled',executed_at=p_now,
    skip_reason=CASE WHEN a.status='rescheduled' OR a.start_time IS DISTINCT FROM r.appointment_start_time
      THEN 'appointment_rescheduled' ELSE 'appointment_cancelled' END,processing_started_at=NULL
  FROM public.appointments a
  WHERE r.appointment_id=a.id AND r.clinic_id=a.clinic_id
    AND r.automation_key IN ('appointment_reminder_7d','appointment_reminder_24h')
    AND (p_automation_key IS NULL OR r.automation_key=p_automation_key)
    AND r.status IN ('pending','failed') AND r.sent_at IS NULL
    AND (p_clinic_id IS NULL OR r.clinic_id=p_clinic_id)
    AND (a.status NOT IN ('scheduled','confirmed') OR a.is_tombstone OR a.start_time IS DISTINCT FROM r.appointment_start_time);
  GET DIAGNOSTICS v_cancelled=ROW_COUNT;

  WITH candidates AS (
    SELECT a.*,s.automation_key,s.template_name,
      CASE WHEN s.automation_key='appointment_reminder_24h' THEN a.start_time-interval '24 hours'
        ELSE (((a.start_time AT TIME ZONE l.timezone)::date-7+s.preferred_send_time) AT TIME ZONE l.timezone) END due_at,
      CASE
        WHEN s.location_id IS NOT NULL AND s.location_id<>a.location_id THEN 'outside_scope'
        WHEN s.professional_id IS NOT NULL AND s.professional_id<>a.professional_id THEN 'outside_scope'
        WHEN COALESCE(p.phone,lead.phone,'')='' THEN 'patient_without_whatsapp'
        WHEN wc.id IS NULL OR s.template_status<>'approved' THEN 'template_unavailable'
        ELSE NULL END initial_skip_reason
    FROM public.appointments a
    JOIN public.appointment_reminder_settings s ON s.clinic_id=a.clinic_id AND s.is_enabled
      AND (p_automation_key IS NULL OR s.automation_key=p_automation_key)
    JOIN public.clinic_locations l ON l.id=a.location_id AND l.clinic_id=a.clinic_id
    LEFT JOIN public.patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id
    LEFT JOIN public.leads lead ON lead.id=a.lead_id AND lead.clinic_id=a.clinic_id
    LEFT JOIN public.whatsapp_connections wc ON wc.clinic_id=a.clinic_id AND wc.status='connected'
    WHERE a.status IN ('scheduled','confirmed') AND NOT a.is_tombstone AND a.start_time>p_now
      AND (p_clinic_id IS NULL OR a.clinic_id=p_clinic_id)
    ORDER BY a.start_time LIMIT p_limit
  ), due AS (
    SELECT * FROM candidates WHERE due_at>p_now-interval '24 hours' AND due_at<=p_now+interval '1 hour'
  ), inserted AS (
    INSERT INTO public.appointment_reminders(
      clinic_id,appointment_id,channel,scheduled_for,status,automation_key,appointment_start_time,
      skip_reason,executed_at,template_name,payload
    ) SELECT clinic_id,id,'whatsapp',due_at,
      CASE WHEN initial_skip_reason IS NULL THEN 'pending'::public.reminder_status ELSE 'cancelled'::public.reminder_status END,
      automation_key,start_time,initial_skip_reason,
      CASE WHEN initial_skip_reason IS NULL THEN NULL ELSE p_now END,template_name,
      jsonb_build_object('automation_key',automation_key)
    FROM due ON CONFLICT DO NOTHING RETURNING 1
  ) SELECT count(*)::integer INTO v_queued FROM inserted;
  RETURN QUERY SELECT v_queued,v_cancelled;
END $$;


--
-- Name: FUNCTION "enqueue_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."enqueue_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) IS 'Queues canonical 7d calendar-time and exact 24h appointment reminders.';


--
-- Name: enqueue_daily_agenda_summaries("uuid", timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enqueue_daily_agenda_summaries"("p_clinic_id" "uuid" DEFAULT NULL::"uuid", "p_now" timestamp with time zone DEFAULT "now"(), "p_limit" integer DEFAULT 2000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_count integer:=0;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_limit<1 OR p_limit>5000 THEN RAISE EXCEPTION 'AUTOMATION_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  WITH eligible AS (
    SELECT p.clinic_id,p.id professional_id,s.send_time,
      COALESCE(primary_location.timezone,MIN(l.timezone),'America/Sao_Paulo') timezone
    FROM public.professionals p
    JOIN public.daily_agenda_summary_settings s ON s.clinic_id=p.clinic_id AND s.is_enabled
    JOIN public.professional_locations pl ON pl.clinic_id=p.clinic_id AND pl.professional_id=p.id AND pl.active
    JOIN public.clinic_locations l ON l.id=pl.location_id AND l.clinic_id=pl.clinic_id AND l.active
    LEFT JOIN public.clinic_locations primary_location ON primary_location.clinic_id=p.clinic_id AND primary_location.is_primary AND primary_location.active
    WHERE p.status='active' AND (p_clinic_id IS NULL OR p.clinic_id=p_clinic_id)
    GROUP BY p.clinic_id,p.id,s.send_time,primary_location.timezone
  ), due AS (
    SELECT *, (p_now AT TIME ZONE timezone)::date local_date,
      (((p_now AT TIME ZONE timezone)::date+send_time) AT TIME ZONE timezone) scheduled_for
    FROM eligible
  ), inserted AS (
    INSERT INTO public.daily_agenda_summary_executions(clinic_id,professional_id,local_date,timezone,scheduled_for)
    SELECT clinic_id,professional_id,local_date,timezone,scheduled_for FROM due
    WHERE scheduled_for<=p_now ORDER BY scheduled_for,professional_id LIMIT p_limit
    ON CONFLICT (clinic_id,professional_id,automation_key,local_date) DO NOTHING RETURNING 1
  ) SELECT count(*)::integer INTO v_count FROM inserted;
  RETURN v_count;
END $$;


--
-- Name: expire_waitlist_offers("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."expire_waitlist_offers"("p_clinic_id" "uuid" DEFAULT NULL::"uuid", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'WAITLIST_FORBIDDEN' USING ERRCODE='42501'; END IF;
  WITH expired AS (
    UPDATE public.waitlist_notifications o SET offer_status='expired',responded_at=p_now,result_code='offer_ttl_elapsed'
    WHERE o.offer_status='offered' AND o.expires_at<=p_now AND (p_clinic_id IS NULL OR o.clinic_id=p_clinic_id)
    RETURNING o.waitlist_id,o.clinic_id
  )
  UPDATE public.appointment_waitlist w SET status='waiting',updated_at=p_now
  WHERE EXISTS(SELECT 1 FROM expired e WHERE e.waitlist_id=w.id AND e.clinic_id=w.clinic_id)
    AND w.status IN ('match_found','contact_attempted');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;


--
-- Name: get_aura_operational_metrics("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_aura_operational_metrics"("p_clinic_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: get_aura_pilot_snapshot("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_aura_pilot_snapshot"("p_clinic_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_settings public.whatsapp_ai_settings; v_result jsonb;
BEGIN
  IF NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN RAISE EXCEPTION 'AURA_PILOT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_settings FROM public.whatsapp_ai_settings WHERE clinic_id=p_clinic_id;
  SELECT jsonb_build_object(
    'databaseAvailable',true,
    'whatsappConfigured',EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE clinic_id=p_clinic_id AND status='connected'),
    'hasLocation',EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=p_clinic_id AND active),
    'hasProfessional',EXISTS(SELECT 1 FROM public.professionals WHERE clinic_id=p_clinic_id AND status='active'),
    'hasService',EXISTS(SELECT 1 FROM public.treatments WHERE clinic_id=p_clinic_id AND is_active),
    'hasInsurance',EXISTS(SELECT 1 FROM public.health_insurances WHERE clinic_id=p_clinic_id AND status='active'),
    'hasOperatingHours',EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=p_clinic_id AND active AND opening_hours IS NOT NULL AND public.location_opening_hours_are_valid(opening_hours)),
    'hasSchedulingRules',EXISTS(SELECT 1 FROM public.professional_availability WHERE clinic_id=p_clinic_id AND is_active),
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


--
-- Name: get_available_slots_for_appointment_type("uuid", "uuid", "uuid", "uuid", "date", "date", integer, "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_available_slots_for_appointment_type"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_date_from" "date", "p_date_to" "date", "p_step_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") RETURNS TABLE("start_time" timestamp with time zone, "end_time" timestamp with time zone, "duration_minutes" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_timezone text; v_duration integer;
BEGIN
  IF p_date_to<p_date_from OR p_date_to>p_date_from+120 THEN RAISE EXCEPTION 'AGENDA_INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
  IF p_step_minutes<5 OR p_step_minutes>60 THEN RAISE EXCEPTION 'AGENDA_INVALID_STEP' USING ERRCODE='22023'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT timezone INTO v_timezone FROM public.clinic_locations
   WHERE id=p_location_id AND clinic_id=p_clinic_id AND active;
  IF v_timezone IS NULL THEN RAISE EXCEPTION 'AGENDA_LOCATION_INVALID' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professional_locations WHERE clinic_id=p_clinic_id AND location_id=p_location_id AND professional_id=p_professional_id AND active) THEN RETURN; END IF;
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id,p_appointment_type
  ) terms;
  IF v_duration IS NULL OR v_duration<5 OR v_duration>480 THEN RAISE EXCEPTION 'AGENDA_INVALID_DURATION' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  WITH dates AS (
    SELECT day::date local_date FROM generate_series(p_date_from::timestamp,p_date_to::timestamp,interval '1 day') day
  ), windows AS (
    SELECT dates.local_date,
      ((dates.local_date+period.start_time) AT TIME ZONE v_timezone) window_start,
      ((dates.local_date+period.end_time) AT TIME ZONE v_timezone) window_end
    FROM dates CROSS JOIN LATERAL public.get_effective_working_periods(
      p_clinic_id,p_location_id,p_professional_id,dates.local_date
    ) period
  ), candidates AS (
    SELECT slot_start candidate_start,slot_start+make_interval(mins=>v_duration) candidate_end
    FROM windows CROSS JOIN LATERAL generate_series(
      window_start,window_end-make_interval(mins=>v_duration),make_interval(mins=>p_step_minutes)
    ) slot_start
  )
  SELECT candidate_start,candidate_end,v_duration FROM candidates candidate
  WHERE NOT EXISTS (SELECT 1 FROM public.appointments appointment
    WHERE appointment.clinic_id=p_clinic_id AND appointment.professional_id=p_professional_id
      AND appointment.status IN ('scheduled','confirmed','in_progress')
      AND tstzrange(appointment.start_time,appointment.end_time,'[)') && tstzrange(candidate.candidate_start,candidate.candidate_end,'[)'))
    AND NOT EXISTS (SELECT 1 FROM public.appointment_blocks block
      WHERE block.clinic_id=p_clinic_id AND block.location_id=p_location_id
        AND (block.professional_id IS NULL OR block.professional_id=p_professional_id)
        AND tstzrange(block.start_at,block.end_at,'[)') && tstzrange(candidate.candidate_start,candidate.candidate_end,'[)'))
  ORDER BY candidate_start;
END
$$;


--
-- Name: get_effective_working_periods("uuid", "uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") RETURNS TABLE("start_time" time without time zone, "end_time" time without time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT GREATEST(location_period.start_time, professional_period.start_time),
         LEAST(location_period.end_time, professional_period.end_time)
  FROM public.get_location_operating_periods(p_clinic_id, p_location_id, p_date) location_period
  CROSS JOIN public.get_professional_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date) professional_period
  WHERE GREATEST(location_period.start_time, professional_period.start_time)
        < LEAST(location_period.end_time, professional_period.end_time)
  ORDER BY 1;
$$;


--
-- Name: FUNCTION "get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") IS 'Intersection of location hours and professional hours after date-specific exceptions.';


--
-- Name: get_location_operating_periods("uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_location_operating_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_date" "date") RETURNS TABLE("start_time" time without time zone, "end_time" time without time zone, "source" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_exception public.scheduling_exceptions;
  v_periods jsonb;
BEGIN
  SELECT * INTO v_exception
  FROM public.scheduling_exceptions e
  WHERE e.clinic_id = p_clinic_id AND e.location_id = p_location_id
    AND e.professional_id IS NULL AND e.exception_date = p_date;

  IF FOUND THEN
    IF v_exception.is_closed THEN RETURN; END IF;
    v_periods := v_exception.periods;
    RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'location_exception'::text
      FROM jsonb_array_elements(v_periods) ORDER BY (value->>'start')::time;
    RETURN;
  END IF;

  SELECT l.opening_hours->'weekdays'->(EXTRACT(DOW FROM p_date)::integer)::text
    INTO v_periods
  FROM public.clinic_locations l
  WHERE l.clinic_id = p_clinic_id AND l.id = p_location_id AND l.active
    AND public.location_opening_hours_are_valid(l.opening_hours);

  IF v_periods IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'location_recurring'::text
    FROM jsonb_array_elements(v_periods) ORDER BY (value->>'start')::time;
END
$$;


--
-- Name: get_professional_working_periods("uuid", "uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_professional_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") RETURNS TABLE("start_time" time without time zone, "end_time" time without time zone, "source" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_exception public.scheduling_exceptions;
BEGIN
  SELECT * INTO v_exception
  FROM public.scheduling_exceptions e
  WHERE e.clinic_id = p_clinic_id AND e.location_id = p_location_id
    AND e.professional_id = p_professional_id AND e.exception_date = p_date;

  IF FOUND THEN
    IF v_exception.is_closed THEN RETURN; END IF;
    RETURN QUERY SELECT (value->>'start')::time, (value->>'end')::time, 'professional_exception'::text
      FROM jsonb_array_elements(v_exception.periods) ORDER BY (value->>'start')::time;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.start_time, a.end_time, 'professional_recurring'::text
  FROM public.professional_availability a
  WHERE a.clinic_id = p_clinic_id AND a.location_id = p_location_id
    AND a.professional_id = p_professional_id AND a.is_active
    AND a.day_of_week = EXTRACT(DOW FROM p_date)::integer
    AND (a.valid_from IS NULL OR a.valid_from <= p_date)
    AND (a.valid_until IS NULL OR a.valid_until >= p_date)
  ORDER BY a.start_time;
END
$$;


--
-- Name: get_schedule_restriction_reason("uuid", "uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_schedule_restriction_reason"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.get_location_operating_periods(p_clinic_id, p_location_id, p_date))
      THEN 'location_closed'
    WHEN NOT EXISTS (SELECT 1 FROM public.get_professional_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date))
      THEN 'professional_not_working'
    WHEN NOT EXISTS (SELECT 1 FROM public.get_effective_working_periods(p_clinic_id, p_location_id, p_professional_id, p_date))
      THEN 'operating_hours_restriction'
    ELSE NULL
  END;
$$;


--
-- Name: get_user_clinic_ids("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_user_clinic_ids"("_user_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT clinic_id FROM public.user_roles WHERE user_id = _user_id $$;


--
-- Name: has_clinic_role("uuid", "uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_clinic_role"("_user_id" "uuid", "_clinic_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND clinic_id = _clinic_id
      AND role = _role AND is_active
  )
$$;


--
-- Name: has_menu_access("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_menu_access"("_user_id" "uuid", "_clinic_id" "uuid", "_permission_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _is_admin boolean;
BEGIN
  SELECT public.has_clinic_role(_user_id, _clinic_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_access_groups uag
    JOIN public.access_group_permissions agp ON agp.group_id = uag.group_id
    WHERE uag.clinic_id = _clinic_id
      AND uag.user_id = _user_id
      AND uag.is_active = true
      AND agp.clinic_id = _clinic_id
      AND agp.permission_key = _permission_key
      AND agp.can_view = true
  );
END;
$$;


--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND is_active
  )
$$;


--
-- Name: invalidate_waitlist_active_offer(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invalidate_waitlist_active_offer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('expired','cancelled_by_patient','cancelled_by_clinic','scheduled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.waitlist_notifications SET offer_status='invalidated',invalidated_at=now(),result_code='waitlist_inactive'
    WHERE waitlist_id=NEW.id AND clinic_id=NEW.clinic_id AND offer_status IN ('offered','accepted');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: is_clinic_staff("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_clinic_staff"("_user_id" "uuid", "_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND clinic_id = _clinic_id 
    AND role::text IN ('admin', 'receptionist', 'professional', 'sales')
  ) 
$$;


--
-- Name: location_opening_hours_are_valid("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."location_opening_hours_are_valid"("p_hours" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" STABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_entry record;
BEGIN
  IF p_hours IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p_hours) <> 'object'
     OR p_hours->>'schemaVersion' <> '1'
     OR jsonb_typeof(p_hours->'weekdays') <> 'object' THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT key, value FROM jsonb_each(p_hours->'weekdays')
  LOOP
    IF v_entry.key !~ '^[0-6]$' OR NOT public.schedule_periods_are_valid(v_entry.value) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$_$;


--
-- Name: mark_appointment_reminder_delivery_attempt("uuid", "uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_marked boolean:=false;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE public.appointment_reminders SET delivery_attempted_at=p_now
  WHERE id=p_reminder_id AND clinic_id=p_clinic_id
    AND automation_key IN ('appointment_reminder_7d','appointment_reminder_24h')
    AND status='pending' AND sent_at IS NULL AND delivery_attempted_at IS NULL
    AND processing_started_at IS NOT NULL;
  v_marked := FOUND;
  RETURN v_marked;
END $$;


--
-- Name: FUNCTION "mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone) IS 'Atomic boundary immediately before provider I/O; prevents blind retry after an uncertain external outcome.';


--
-- Name: mark_daily_agenda_summary_delivery_attempt("uuid", "uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_daily_agenda_summary_delivery_attempt"("p_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_updated integer;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE public.daily_agenda_summary_executions SET delivery_attempted_at=p_now
  WHERE id=p_id AND clinic_id=p_clinic_id AND status='processing' AND sent_at IS NULL AND delivery_attempted_at IS NULL;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated=1;
END $$;


--
-- Name: prevent_professional_availability_overlap(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."prevent_professional_availability_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM public.professional_availability existing
    WHERE existing.id <> NEW.id
      AND existing.clinic_id = NEW.clinic_id
      AND existing.location_id = NEW.location_id
      AND existing.professional_id = NEW.professional_id
      AND existing.day_of_week = NEW.day_of_week
      AND existing.is_active
      AND existing.start_time < NEW.end_time
      AND NEW.start_time < existing.end_time
      AND (existing.valid_until IS NULL OR NEW.valid_from IS NULL OR existing.valid_until >= NEW.valid_from)
      AND (NEW.valid_until IS NULL OR existing.valid_from IS NULL OR NEW.valid_until >= existing.valid_from)
  ) THEN
    RAISE EXCEPTION 'AGENDA_AVAILABILITY_OVERLAP' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: process_team_invitation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."process_team_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Check for pending invitations matching the new user's email
  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE email = NEW.email
      AND status = 'pending'
  LOOP
    -- Create the user role
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT DO NOTHING;

    -- Mark invitation as accepted
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: reassign_appointment_professional_secure("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_old public.appointments;
  v_duration integer;
  v_end timestamptz;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_old.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;

  v_duration := public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    v_old.treatment_id,
    v_old.billing_type,
    v_old.health_insurance_id
  );
  v_end := v_old.start_time + make_interval(mins => v_duration);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text, 0));
  PERFORM public.assert_appointment_slot(
    p_clinic_id,
    v_old.location_id,
    p_professional_id,
    v_old.treatment_id,
    v_old.start_time,
    v_end,
    v_old.id
  );

  UPDATE public.appointments
  SET professional_id = p_professional_id,
      end_time = v_end,
      duration_minutes = v_duration
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE = '23P01';
END
$$;


--
-- Name: FUNCTION "reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid") IS 'Tenant-explicit professional reassignment; start is preserved and end/duration are recalculated.';


--
-- Name: ai_conversation_handoffs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_conversation_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "correlation_id" "uuid",
    "sanitized_description" "text",
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "requested_by" "uuid",
    "assigned_user_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_conversation_handoffs_priority_check" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "ai_conversation_handoffs_reason_check" CHECK (("reason" = ANY (ARRAY['user_requested_human'::"text", 'medical_out_of_scope'::"text", 'urgent_language'::"text", 'repeated_failure'::"text", 'repeated_ambiguity'::"text", 'knowledge_conflict'::"text", 'knowledge_not_found'::"text", 'provider_unavailable'::"text", 'external_provider_write_unavailable'::"text", 'mutation_failure'::"text", 'identity_unresolved'::"text", 'policy_required'::"text", 'safety_fail_closed'::"text", 'staff_manual_takeover'::"text", 'other'::"text"]))),
    CONSTRAINT "ai_conversation_handoffs_resolution_check" CHECK ((("resolution" IS NULL) OR ("resolution" = ANY (ARRAY['resolved_by_human'::"text", 'returned_to_ai'::"text", 'patient_ended'::"text", 'duplicate'::"text", 'other'::"text"])))),
    CONSTRAINT "ai_conversation_handoffs_sanitized_description_check" CHECK ((("sanitized_description" IS NULL) OR ("length"("sanitized_description") <= 240))),
    CONSTRAINT "ai_conversation_handoffs_source_check" CHECK (("source" = ANY (ARRAY['conversation_engine'::"text", 'safety'::"text", 'tool'::"text", 'knowledge'::"text", 'user_request'::"text", 'staff'::"text", 'system'::"text"]))),
    CONSTRAINT "ai_conversation_handoffs_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'queued'::"text", 'assigned'::"text", 'accepted'::"text", 'resolved'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "ai_conversation_handoffs_summary_check" CHECK ((("jsonb_typeof"("summary") = 'object'::"text") AND ("pg_column_size"("summary") <= 16384)))
);


--
-- Name: TABLE "ai_conversation_handoffs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_conversation_handoffs" IS 'Operational, tenant-scoped human queue; summary contains administrative context only.';


--
-- Name: record_ai_conversation_failure("uuid", "uuid", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_ai_conversation_failure"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_reason" "text", "p_threshold" integer DEFAULT 3) RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count integer;
BEGIN
  IF NOT COALESCE((SELECT auth.role()) = 'service_role', false) THEN
    RAISE EXCEPTION 'HANDOFF_BACKEND_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_threshold < 1 OR p_threshold > 10 THEN RAISE EXCEPTION 'HANDOFF_INVALID_THRESHOLD' USING ERRCODE = '22023'; END IF;
  UPDATE public.whatsapp_ai_conversations SET ai_failure_count = LEAST(ai_failure_count + 1, 100)
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id AND control_mode = 'ai_active'
  RETURNING ai_failure_count INTO v_count;
  IF v_count IS NULL OR v_count < p_threshold THEN RETURN NULL; END IF;
  RETURN public.request_ai_conversation_handoff(
    p_clinic_id, p_conversation_id,
    CASE WHEN p_reason = 'repeated_ambiguity' THEN 'repeated_ambiguity' ELSE 'repeated_failure' END,
    'normal', 'system', p_correlation_id,
    jsonb_build_object('reason', p_reason, 'knownAdministrativeContext', '[]'::jsonb, 'whatAuraAlreadyTried', jsonb_build_array('Limite de falhas operacionais consecutivas atingido.')),
    NULL
  );
END;
$$;


--
-- Name: record_ai_operational_event("uuid", "uuid", "uuid", "text", "text", "text", "text", "text", "text", boolean, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_ai_operational_event"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_channel" "text", "p_event_type" "text", "p_component" "text", "p_outcome" "text", "p_error_code" "text" DEFAULT NULL::"text", "p_error_category" "text" DEFAULT NULL::"text", "p_retryable" boolean DEFAULT NULL::boolean, "p_latency_ms" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN RAISE EXCEPTION 'OPERATIONAL_EVENT_BACKEND_ONLY' USING ERRCODE='42501'; END IF;
  INSERT INTO public.ai_operational_events(clinic_id,conversation_id,correlation_id,channel,event_type,component,outcome,error_code,error_category,retryable,latency_ms)
  VALUES (p_clinic_id,p_conversation_id,p_correlation_id,p_channel,p_event_type,p_component,p_outcome,p_error_code,p_error_category,p_retryable,p_latency_ms);
END $$;


--
-- Name: record_waitlist_appointment_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_waitlist_appointment_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.status IN ('scheduled','confirmed','in_progress') AND
     (NEW.status NOT IN ('scheduled','confirmed','in_progress') OR NEW.start_time IS DISTINCT FROM OLD.start_time) THEN
    INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id,slot_start,slot_end)
    VALUES(OLD.clinic_id,CASE WHEN NEW.status='rescheduled' OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN 'appointment_rescheduled' ELSE 'appointment_cancelled' END,
      OLD.location_id,OLD.professional_id,OLD.start_time,OLD.end_time);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: record_waitlist_block_removed_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_waitlist_block_removed_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id,slot_start,slot_end)
  VALUES(OLD.clinic_id,'block_removed',OLD.location_id,OLD.professional_id,OLD.start_at,OLD.end_at);
  RETURN OLD;
END $$;


--
-- Name: record_waitlist_exception_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_waitlist_exception_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id)
    VALUES(OLD.clinic_id,'schedule_changed',OLD.location_id,OLD.professional_id);
    RETURN OLD;
  END IF;
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id)
  VALUES(NEW.clinic_id,'schedule_changed',NEW.location_id,NEW.professional_id);
  RETURN NEW;
END $$;


--
-- Name: record_waitlist_location_schedule_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_waitlist_location_schedule_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id)
  VALUES(NEW.clinic_id,'schedule_changed',NEW.id);
  RETURN NEW;
END $$;


--
-- Name: record_waitlist_schedule_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_waitlist_schedule_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id)
    VALUES(OLD.clinic_id,'schedule_changed',OLD.location_id,OLD.professional_id);
    RETURN OLD;
  END IF;
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id)
  VALUES(NEW.clinic_id,'schedule_changed',NEW.location_id,NEW.professional_id);
  RETURN NEW;
END $$;


--
-- Name: request_ai_conversation_handoff("uuid", "uuid", "text", "text", "text", "uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."request_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_reason" "text", "p_priority" "text", "p_source" "text", "p_correlation_id" "uuid", "p_summary" "jsonb" DEFAULT '{}'::"jsonb", "p_description" "text" DEFAULT NULL::"text") RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
  v_service boolean := COALESCE((SELECT auth.role()) = 'service_role', false);
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT v_service AND NOT public.is_clinic_staff(v_actor, p_clinic_id) THEN
    RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_service AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_ai_settings
    WHERE clinic_id = p_clinic_id AND ai_engine_mode = 'active'
      AND ai_handoff_enabled = true AND ai_handoff_validated_at IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public.whatsapp_ai_conversations
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id = p_conversation_id
    AND status IN ('requested', 'queued', 'assigned', 'accepted')
  ORDER BY requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_handoff; END IF;
  INSERT INTO public.ai_conversation_handoffs (
    clinic_id, conversation_id, reason, priority, status, source, correlation_id,
    sanitized_description, summary, requested_by
  ) VALUES (
    p_clinic_id, p_conversation_id, p_reason, p_priority, 'queued', p_source,
    p_correlation_id, left(p_description, 240), COALESCE(p_summary, '{}'::jsonb),
    CASE WHEN v_service THEN NULL ELSE v_actor END
  ) RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET
    control_mode = 'handoff_pending', active_handoff_id = v_handoff.id,
    ai_enabled = false, status = 'handoff', assigned_user_id = NULL,
    control_revision = control_revision + 1,
    conversation_state = jsonb_set(
      jsonb_set(conversation_state, '{lastPresentedOptions}', '[]'::jsonb, true),
      '{activeIntentStatus}', '"collecting"'::jsonb, true
    )
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id;
  INSERT INTO public.ai_handoff_events(
    clinic_id, conversation_id, handoff_id, action, actor_user_id, reason
  ) VALUES (
    p_clinic_id, p_conversation_id, v_handoff.id, 'requested',
    CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason
  );
  INSERT INTO public.ai_handoff_events(
    clinic_id, conversation_id, handoff_id, action, actor_user_id, reason
  ) VALUES (
    p_clinic_id, p_conversation_id, v_handoff.id, 'queued',
    CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason
  );
  RETURN v_handoff;
END
$$;


--
-- Name: reschedule_appointment_secure("uuid", "uuid", timestamp with time zone, "uuid", "uuid", "text", integer, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reschedule_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_start_time" timestamp with time zone, "p_professional_id" "uuid" DEFAULT NULL::"uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_duration_minutes" integer DEFAULT NULL::integer, "p_reason" "text" DEFAULT 'Remarcado'::"text") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_old public.appointments; v_new public.appointments; v_professional_id uuid; v_location_id uuid; v_duration integer; v_end timestamptz;
BEGIN
  SELECT * INTO v_old FROM public.appointments WHERE id=p_appointment_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF current_user<>'service_role' AND NOT public.is_clinic_staff((SELECT auth.uid()),p_clinic_id) THEN RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_old.status NOT IN ('scheduled','confirmed','in_progress') THEN RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_ACTIVE' USING ERRCODE='22023'; END IF;
  v_professional_id:=COALESCE(p_professional_id,v_old.professional_id);
  v_location_id:=COALESCE(p_location_id,v_old.location_id);
  SELECT terms.duration_minutes INTO v_duration FROM public.resolve_appointment_type_terms(
    p_clinic_id,v_professional_id,v_old.treatment_id,v_old.billing_type,v_old.health_insurance_id,v_old.appointment_type
  ) terms;
  IF p_duration_minutes IS NOT NULL AND p_duration_minutes<>v_duration THEN RAISE EXCEPTION 'AGENDA_DURATION_MISMATCH' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,v_location_id,v_professional_id,v_old.treatment_id,p_start_time,v_end,v_old.id);
  UPDATE public.appointments SET status='rescheduled',cancelled_reason=p_reason
  WHERE id=v_old.id AND clinic_id=p_clinic_id;
  INSERT INTO public.appointments(
    clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,
    start_time,end_time,scheduled_at,duration_minutes,appointment_type,notes,status,
    rescheduled_from,created_by,billing_type,health_insurance_id
  ) VALUES (
    p_clinic_id,v_location_id,v_professional_id,v_old.patient_id,v_old.lead_id,v_old.treatment_id,
    p_start_time,v_end,p_start_time,v_duration,v_old.appointment_type,COALESCE(p_notes,v_old.notes),'scheduled',
    v_old.id,(SELECT auth.uid()),v_old.billing_type,v_old.health_insurance_id
  ) RETURNING * INTO v_new;
  UPDATE public.appointments SET rescheduled_to=v_new.id
  WHERE id=v_old.id AND clinic_id=p_clinic_id;
  RETURN v_new;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END
$$;


--
-- Name: reset_ai_conversation_failures("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reset_ai_conversation_failures"("p_clinic_id" "uuid", "p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE((SELECT auth.role()) = 'service_role', false) THEN
    RAISE EXCEPTION 'HANDOFF_BACKEND_ONLY' USING ERRCODE = '42501';
  END IF;
  UPDATE public.whatsapp_ai_conversations SET ai_failure_count = 0
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id AND ai_failure_count <> 0;
END;
$$;


--
-- Name: resolve_ai_conversation_handoff("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_resolution" "text") RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE; v_return boolean:=p_resolution='returned_to_ai';
BEGIN
  IF NOT public.is_clinic_staff(v_actor,p_clinic_id) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_resolution NOT IN ('resolved_by_human','returned_to_ai','patient_ended','duplicate','other') THEN RAISE EXCEPTION 'HANDOFF_INVALID_RESOLUTION' USING ERRCODE='22023'; END IF;
  SELECT h.* INTO v_handoff FROM public.ai_conversation_handoffs h JOIN public.whatsapp_ai_conversations c ON c.active_handoff_id=h.id
  WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_ACTIVE' USING ERRCODE='P0002'; END IF;
  IF v_handoff.assigned_user_id IS NOT NULL AND v_handoff.assigned_user_id<>v_actor AND NOT public.has_clinic_role(v_actor,p_clinic_id,'admin') THEN RAISE EXCEPTION 'HANDOFF_NOT_OWNER' USING ERRCODE='42501'; END IF;
  UPDATE public.ai_conversation_handoffs SET status='resolved',resolution=p_resolution,resolved_at=now() WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET
    control_mode=CASE WHEN v_return THEN 'ai_active' ELSE 'closed' END,
    status=CASE WHEN v_return THEN 'open' ELSE 'closed' END,
    ai_enabled=v_return, active_handoff_id=NULL, assigned_user_id=NULL, ai_failure_count=0,
    control_revision=control_revision+1,
    conversation_state=jsonb_set(jsonb_set(conversation_state #- '{entities,selectedOption}','{lastPresentedOptions}','[]'::jsonb,true),'{activeIntentStatus}','"collecting"'::jsonb,true)
  WHERE id=p_conversation_id AND clinic_id=p_clinic_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason)
  VALUES(p_clinic_id,p_conversation_id,v_handoff.id,CASE WHEN v_return THEN 'returned_to_ai' ELSE 'closed' END,v_actor,p_resolution);
  RETURN v_handoff;
END; $$;


--
-- Name: resolve_appointment_duration("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT public.resolve_appointment_duration(
    p_clinic_id,
    p_professional_id,
    p_treatment_id,
    'private',
    NULL
  )
$$;


--
-- Name: resolve_appointment_duration("uuid", "uuid", "uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_duration integer;
BEGIN
  IF p_billing_type NOT IN ('private', 'insurance') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_BILLING_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_billing_type = 'insurance' THEN
    IF p_health_insurance_id IS NULL THEN
      RAISE EXCEPTION 'AGENDA_INSURANCE_REQUIRED' USING ERRCODE = '22023';
    END IF;

    SELECT phi.appointment_duration_minutes
      INTO v_duration
    FROM public.professional_health_insurances phi
    JOIN public.health_insurances hi
      ON hi.id = phi.health_insurance_id
     AND hi.clinic_id = phi.clinic_id
    WHERE phi.clinic_id = p_clinic_id
      AND phi.professional_id = p_professional_id
      AND phi.health_insurance_id = p_health_insurance_id
      AND phi.status = 'active'
      AND hi.status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'AGENDA_INVALID_PROFESSIONAL_INSURANCE' USING ERRCODE = '22023';
    END IF;

    RETURN COALESCE(
      v_duration,
      (SELECT pt.duration_minutes
       FROM public.professional_treatments pt
       WHERE pt.clinic_id = p_clinic_id
         AND pt.professional_id = p_professional_id
         AND pt.treatment_id = p_treatment_id
         AND pt.status = 'active'
       LIMIT 1),
      (SELECT t.duration_minutes
       FROM public.treatments t
       WHERE t.clinic_id = p_clinic_id
         AND t.id = p_treatment_id
         AND t.is_active
       LIMIT 1),
      (SELECT ps.default_appointment_duration_minutes
       FROM public.professional_settings ps
       WHERE ps.clinic_id = p_clinic_id
         AND ps.professional_id = p_professional_id
       LIMIT 1),
      30
    )::integer;
  END IF;

  RETURN COALESCE(
    (SELECT ps.private_appointment_duration_minutes
     FROM public.professional_settings ps
     WHERE ps.clinic_id = p_clinic_id
       AND ps.professional_id = p_professional_id
     LIMIT 1),
    (SELECT pt.duration_minutes
     FROM public.professional_treatments pt
     WHERE pt.clinic_id = p_clinic_id
       AND pt.professional_id = p_professional_id
       AND pt.treatment_id = p_treatment_id
       AND pt.status = 'active'
     LIMIT 1),
    (SELECT t.duration_minutes
     FROM public.treatments t
     WHERE t.clinic_id = p_clinic_id
       AND t.id = p_treatment_id
       AND t.is_active
     LIMIT 1),
    (SELECT ps.default_appointment_duration_minutes
     FROM public.professional_settings ps
     WHERE ps.clinic_id = p_clinic_id
       AND ps.professional_id = p_professional_id
     LIMIT 1),
    30
  )::integer;
END
$$;


--
-- Name: FUNCTION "resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid") IS 'Canonical duration authority for private and insurance appointments.';


--
-- Name: resolve_appointment_type_terms("uuid", "uuid", "uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_appointment_type_terms"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") RETURNS TABLE("price" numeric, "duration_minutes" integer, "terms_source" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_duration integer; v_price numeric;
BEGIN
  IF p_appointment_type NOT IN ('first_visit','consultation','return_or_post_op','maintenance','procedure') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_APPOINTMENT_TYPE' USING ERRCODE='22023';
  END IF;
  IF p_billing_type NOT IN ('private','insurance') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_BILLING_TYPE' USING ERRCODE='22023';
  END IF;
  IF p_appointment_type = 'procedure' AND p_treatment_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_SERVICE_REQUIRED_FOR_PROCEDURE' USING ERRCODE='22023';
  END IF;

  IF p_appointment_type IN ('first_visit','consultation') AND p_billing_type = 'private' THEN
    RETURN QUERY
    SELECT
      CASE WHEN p_appointment_type = 'first_visit'
        THEN COALESCE(settings.first_visit_price, professional.private_consultation_price)
        ELSE professional.private_consultation_price END,
      CASE WHEN p_appointment_type = 'first_visit'
        THEN COALESCE(settings.first_visit_duration_minutes, settings.private_appointment_duration_minutes, 30)
        ELSE COALESCE(settings.private_appointment_duration_minutes, 30) END,
      CASE WHEN p_appointment_type = 'first_visit' AND settings.first_visit_duration_minutes IS NOT NULL
        THEN 'first_visit_override'
        WHEN p_appointment_type = 'first_visit' THEN 'standard_fallback'
        ELSE 'standard' END
    FROM public.professionals professional
    LEFT JOIN public.professional_settings settings
      ON settings.professional_id = professional.id
     AND settings.clinic_id = professional.clinic_id
    WHERE professional.id = p_professional_id
      AND professional.clinic_id = p_clinic_id;
    RETURN;
  END IF;

  IF p_appointment_type = 'procedure' THEN
    SELECT COALESCE(link.duration_minutes,treatment.duration_minutes,settings.default_appointment_duration_minutes,30),
           CASE WHEN p_billing_type='private' THEN COALESCE(link.private_price,treatment.price) ELSE NULL END
      INTO v_duration,v_price
    FROM public.professionals professional
    LEFT JOIN public.professional_settings settings
      ON settings.clinic_id=professional.clinic_id AND settings.professional_id=professional.id
    JOIN public.treatments treatment
      ON treatment.clinic_id=professional.clinic_id AND treatment.id=p_treatment_id AND treatment.is_active
    JOIN public.professional_treatments link
      ON link.clinic_id=professional.clinic_id AND link.professional_id=professional.id
     AND link.treatment_id=treatment.id AND link.status='active'
    WHERE professional.clinic_id=p_clinic_id AND professional.id=p_professional_id;
    IF v_duration IS NULL THEN
      RAISE EXCEPTION 'AGENDA_TREATMENT_NOT_OFFERED' USING ERRCODE='23503';
    END IF;
    RETURN QUERY SELECT v_price,v_duration,'service'::text;
    RETURN;
  END IF;

  v_duration:=public.resolve_appointment_duration(
    p_clinic_id,p_professional_id,p_treatment_id,p_billing_type,p_health_insurance_id
  );
  SELECT professional.private_consultation_price INTO v_price
  FROM public.professionals professional
  WHERE professional.clinic_id=p_clinic_id AND professional.id=p_professional_id;
  RETURN QUERY SELECT CASE WHEN p_billing_type='private' THEN v_price ELSE NULL END,
    v_duration,CASE WHEN p_billing_type='insurance' THEN 'insurance' ELSE 'standard' END::text;
END
$$;


--
-- Name: respond_waitlist_offer("uuid", "text", "text", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."respond_waitlist_offer"("p_clinic_id" "uuid", "p_phone" "text", "p_response" "text", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_offer public.waitlist_notifications; v_entry public.appointment_waitlist; v_appointment public.appointments;
  v_digits text:=regexp_replace(COALESCE(p_phone,''),'\D','','g'); v_response text:=lower(trim(COALESCE(p_response,'')));
  v_accept boolean; v_available boolean:=false;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'WAITLIST_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_accept:=v_response IN ('sim','s','quero','pode ser','confirmo','aceito','sim quero','sim, quero','ok');
  IF NOT v_accept AND v_response NOT IN ('não','nao','n','não consigo','nao consigo','prefiro outro dia','recuso') THEN
    RETURN jsonb_build_object('outcome','unrecognized');
  END IF;
  SELECT o.* INTO v_offer FROM public.waitlist_notifications o
  JOIN public.appointment_waitlist w ON w.id=o.waitlist_id AND w.clinic_id=o.clinic_id
  LEFT JOIN public.patients p ON p.id=w.patient_id AND p.clinic_id=w.clinic_id
  LEFT JOIN public.leads l ON l.id=w.lead_id AND l.clinic_id=w.clinic_id
  WHERE o.clinic_id=p_clinic_id AND o.offer_status='offered'
    AND right(regexp_replace(COALESCE(w.contact_phone,p.phone,l.phone,''),'\D','','g'),11)=right(v_digits,11)
  ORDER BY o.sent_at DESC NULLS LAST,o.created_at DESC LIMIT 1 FOR UPDATE OF o;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','none'); END IF;
  SELECT * INTO v_entry FROM public.appointment_waitlist WHERE id=v_offer.waitlist_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF v_offer.expires_at<=p_now THEN
    UPDATE public.waitlist_notifications SET offer_status='expired',responded_at=p_now,result_code='offer_ttl_elapsed' WHERE id=v_offer.id;
    UPDATE public.appointment_waitlist SET status='waiting' WHERE id=v_entry.id AND status IN ('match_found','contact_attempted');
    RETURN jsonb_build_object('outcome','expired');
  END IF;
  IF NOT v_accept THEN
    UPDATE public.waitlist_notifications SET offer_status='declined',responded_at=p_now,action_taken='declined',action_taken_at=p_now,result_code='patient_declined' WHERE id=v_offer.id;
    UPDATE public.appointment_waitlist SET status='waiting' WHERE id=v_entry.id AND status IN ('match_found','contact_attempted');
    RETURN jsonb_build_object('outcome','declined');
  END IF;
  IF v_offer.appointment_type IS NULL OR v_offer.billing_type IS NULL THEN
    UPDATE public.waitlist_notifications SET offer_status='invalidated',responded_at=p_now,invalidated_at=p_now,result_code='missing_booking_context' WHERE id=v_offer.id;
    UPDATE public.appointment_waitlist SET status='waiting' WHERE id=v_entry.id AND status IN ('match_found','contact_attempted');
    RETURN jsonb_build_object('outcome','invalidated','reason','missing_booking_context');
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.get_available_slots_for_appointment_type(
      p_clinic_id,v_offer.location_id,v_offer.matched_professional_id,v_offer.treatment_id,
      (v_offer.matched_slot_start AT TIME ZONE COALESCE((SELECT timezone FROM public.clinic_locations WHERE id=v_offer.location_id),'America/Sao_Paulo'))::date,
      (v_offer.matched_slot_start AT TIME ZONE COALESCE((SELECT timezone FROM public.clinic_locations WHERE id=v_offer.location_id),'America/Sao_Paulo'))::date,
      15,v_offer.billing_type,v_offer.health_insurance_id,v_offer.appointment_type
    ) slot WHERE slot.start_time=v_offer.matched_slot_start AND slot.end_time=v_offer.matched_slot_end
  ) INTO v_available;
  IF v_offer.matched_slot_start<=p_now+make_interval(hours=>COALESCE((SELECT minimum_booking_notice_hours FROM public.professional_settings
      WHERE clinic_id=p_clinic_id AND professional_id=v_offer.matched_professional_id),0)) OR NOT v_available OR EXISTS(
    SELECT 1 FROM public.appointments a WHERE a.clinic_id=p_clinic_id AND a.status IN ('scheduled','confirmed','in_progress')
      AND ((v_entry.patient_id IS NOT NULL AND a.patient_id=v_entry.patient_id) OR (v_entry.lead_id IS NOT NULL AND a.lead_id=v_entry.lead_id))
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(v_offer.matched_slot_start,v_offer.matched_slot_end,'[)')
  ) THEN
    UPDATE public.waitlist_notifications SET offer_status='invalidated',responded_at=p_now,invalidated_at=p_now,result_code='slot_no_longer_available' WHERE id=v_offer.id;
    UPDATE public.appointment_waitlist SET status='waiting' WHERE id=v_entry.id AND status IN ('match_found','contact_attempted');
    RETURN jsonb_build_object('outcome','invalidated','reason','slot_no_longer_available');
  END IF;
  UPDATE public.waitlist_notifications SET offer_status='accepted',responded_at=p_now,action_taken='accepted',action_taken_at=p_now WHERE id=v_offer.id;
  BEGIN
    SELECT * INTO v_appointment FROM public.create_appointment_with_type_secure(
      p_clinic_id,v_offer.location_id,v_offer.matched_professional_id,v_entry.patient_id,v_entry.lead_id,v_offer.treatment_id,
      v_offer.matched_slot_start,v_offer.appointment_type,'Agendado após aceite explícito de oferta da lista de espera',v_offer.duration_minutes,
      v_offer.billing_type,v_offer.health_insurance_id
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.waitlist_notifications SET offer_status='invalidated',invalidated_at=p_now,result_code='authoritative_booking_rejected' WHERE id=v_offer.id;
    UPDATE public.appointment_waitlist SET status='waiting' WHERE id=v_entry.id AND status IN ('match_found','contact_attempted');
    RETURN jsonb_build_object('outcome','invalidated','reason','authoritative_booking_rejected');
  END;
  UPDATE public.waitlist_notifications SET offer_status='completed',resulting_appointment_id=v_appointment.id,result_code='appointment_created' WHERE id=v_offer.id;
  UPDATE public.appointment_waitlist SET status='scheduled',resulting_appointment_id=v_appointment.id WHERE id=v_entry.id AND clinic_id=p_clinic_id;
  RETURN jsonb_build_object('outcome','completed','startAt',v_appointment.start_time,'endAt',v_appointment.end_time);
END $$;


--
-- Name: save_crm_stage_settings("uuid", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_allowed_keys constant text[] := ARRAY[
    'new_lead',
    'contacted',
    'proposal_sent',
    'scheduled',
    'closed_won',
    'closed_lost'
  ];
  v_entry jsonb;
  v_key text;
  v_target text;
  v_active_count integer;
  v_source_count integer;
  v_moved_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_clinic_role(v_actor, p_clinic_id, 'admin') THEN
    RAISE EXCEPTION 'CRM_STAGE_SETTINGS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_settings) <> 'array' OR jsonb_array_length(p_settings) <> cardinality(v_allowed_keys) THEN
    RAISE EXCEPTION 'CRM_STAGE_SETTINGS_INVALID';
  END IF;

  IF p_relocations IS NULL OR jsonb_typeof(p_relocations) <> 'object' THEN
    RAISE EXCEPTION 'CRM_STAGE_RELOCATIONS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings) AS item
    WHERE jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
       OR NOT (item->>'code' = ANY(v_allowed_keys))
       OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'is_active') IS DISTINCT FROM 'boolean'
  ) OR (
    SELECT count(DISTINCT item->>'code')
    FROM jsonb_array_elements(p_settings) AS item
  ) <> cardinality(v_allowed_keys) THEN
    RAISE EXCEPTION 'CRM_STAGE_KEYS_INVALID';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM jsonb_array_elements(p_settings) AS item
  WHERE (item->>'is_active')::boolean;

  IF v_active_count < 1 THEN
    RAISE EXCEPTION 'CRM_STAGE_AT_LEAST_ONE_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings) AS item
    WHERE (item->>'is_active')::boolean
      AND (length(btrim(item->>'label')) = 0 OR length(btrim(item->>'label')) > 60)
  ) THEN
    RAISE EXCEPTION 'CRM_STAGE_LABEL_INVALID';
  END IF;

  IF EXISTS (
    SELECT lower(btrim(item->>'label'))
    FROM jsonb_array_elements(p_settings) AS item
    WHERE (item->>'is_active')::boolean
    GROUP BY lower(btrim(item->>'label'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CRM_STAGE_LABEL_DUPLICATED';
  END IF;

  -- Serialize concurrent administrative saves for the same clinic.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic_id::text, 0));

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_settings)
  LOOP
    v_key := v_entry->>'code';

    IF NOT (v_entry->>'is_active')::boolean THEN
      SELECT count(*) INTO v_source_count
      FROM public.leads
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND CASE kanban_stage
          WHEN 'attended' THEN 'proposal_sent'
          WHEN 'negotiating' THEN 'proposal_sent'
          WHEN 'follow_up' THEN 'closed_won'
          WHEN 'lost' THEN 'closed_lost'
          ELSE kanban_stage
        END = v_key;

      IF v_source_count > 0 THEN
        v_target := p_relocations->>v_key;

        IF v_target IS NULL OR v_target = v_key OR NOT (v_target = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'CRM_STAGE_RELOCATION_REQUIRED:%', v_key;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_settings) AS destination
          WHERE destination->>'code' = v_target
            AND (destination->>'is_active')::boolean
        ) THEN
          RAISE EXCEPTION 'CRM_STAGE_RELOCATION_TARGET_INACTIVE:%', v_key;
        END IF;

        UPDATE public.leads
        SET kanban_stage = v_target
        WHERE clinic_id = p_clinic_id
          AND deleted_at IS NULL
          AND CASE kanban_stage
            WHEN 'attended' THEN 'proposal_sent'
            WHEN 'negotiating' THEN 'proposal_sent'
            WHEN 'follow_up' THEN 'closed_won'
            WHEN 'lost' THEN 'closed_lost'
            ELSE kanban_stage
          END = v_key;

        GET DIAGNOSTICS v_source_count = ROW_COUNT;
        v_moved_count := v_moved_count + v_source_count;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.clinic_settings (clinic_id, key, value)
  VALUES (p_clinic_id, 'crm_kanban_stages', p_settings::text)
  ON CONFLICT (clinic_id, key)
  DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object(
    'clinic_id', p_clinic_id,
    'active_stage_count', v_active_count,
    'moved_lead_count', v_moved_count
  );
END;
$$;


--
-- Name: FUNCTION "save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb") IS 'Validates and saves canonical CRM stage presentation per clinic, atomically relocating current leads before stage deactivation.';


--
-- Name: schedule_periods_are_valid("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."schedule_periods_are_valid"("p_periods" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" STABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_period jsonb;
BEGIN
  IF jsonb_typeof(p_periods) <> 'array' OR jsonb_array_length(p_periods) > 6 THEN
    RETURN false;
  END IF;

  FOR v_period IN SELECT value FROM jsonb_array_elements(p_periods)
  LOOP
    IF jsonb_typeof(v_period) <> 'object'
       OR COALESCE(v_period->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR COALESCE(v_period->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_period->>'end')::time <= (v_period->>'start')::time THEN
      RETURN false;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_periods) WITH ORDINALITY first_period(value, position)
    JOIN jsonb_array_elements(p_periods) WITH ORDINALITY second_period(value, position)
      ON first_period.position < second_period.position
    WHERE (first_period.value->>'start')::time < (second_period.value->>'end')::time
      AND (second_period.value->>'start')::time < (first_period.value->>'end')::time
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END
$_$;


--
-- Name: seed_default_class_entities_for_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."seed_default_class_entities_for_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.class_entities (
    clinic_id,
    name,
    abbreviation,
    description,
    linked_professionals,
    status
  )
  VALUES
    (NEW.id, 'Conselho Regional de Medicina', 'CRM', 'Registro regional para médicos.', 'Médicos', 'active'),
    (NEW.id, 'Conselho Federal de Medicina', 'CFM', 'Entidade federal de fiscalização da medicina.', 'Médicos', 'active'),
    (NEW.id, 'Conselho Regional de Odontologia', 'CRO', 'Registro profissional para cirurgiões-dentistas.', 'Dentistas', 'active'),
    (NEW.id, 'Conselho Regional de Biomedicina', 'CRBM', 'Registro profissional para biomédicos.', 'Biomédicos', 'active'),
    (NEW.id, 'Conselho Regional de Enfermagem', 'COREN', 'Registro profissional para enfermeiros e técnicos de enfermagem.', 'Enfermeiros; Técnicos de enfermagem', 'active')
  ON CONFLICT (clinic_id, abbreviation) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "seed_default_class_entities_for_clinic"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."seed_default_class_entities_for_clinic"() IS 'Cria as entidades profissionais padrão após o cadastro de uma clínica.';


--
-- Name: seed_default_health_insurances_for_clinic(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."seed_default_health_insurances_for_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.health_insurances (clinic_id, name, status)
  VALUES
    (NEW.id, 'Unimed', 'active'),
    (NEW.id, 'Bradesco Saúde', 'active'),
    (NEW.id, 'SulAmérica Saúde', 'active'),
    (NEW.id, 'Amil', 'active'),
    (NEW.id, 'Hapvida', 'active'),
    (NEW.id, 'NotreDame Intermédica', 'active'),
    (NEW.id, 'Porto Saúde', 'active'),
    (NEW.id, 'Prevent Senior', 'active'),
    (NEW.id, 'Care Plus', 'active'),
    (NEW.id, 'CASSI', 'active')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "seed_default_health_insurances_for_clinic"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."seed_default_health_insurances_for_clinic"() IS 'Cria uma base editável de convênios após o cadastro de uma clínica.';


--
-- Name: sync_lead_interaction_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_lead_interaction_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.leads
  SET last_interaction_at = NEW.performed_at,
      updated_at = now()
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;


--
-- Name: take_over_ai_conversation("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."take_over_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_staff(v_actor, p_clinic_id) THEN
    RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.whatsapp_ai_conversations
  WHERE id=p_conversation_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id=p_conversation_id
    AND status IN ('requested','queued','assigned','accepted')
  ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ai_conversation_handoffs(
      clinic_id,conversation_id,reason,priority,status,source,summary,requested_by
    ) VALUES (
      p_clinic_id,p_conversation_id,'staff_manual_takeover','normal','queued','staff',
      jsonb_build_object('reason','staff_manual_takeover','knownAdministrativeContext','[]'::jsonb,'whatAuraAlreadyTried','[]'::jsonb),v_actor
    ) RETURNING * INTO v_handoff;
    UPDATE public.whatsapp_ai_conversations SET active_handoff_id=v_handoff.id
    WHERE id=p_conversation_id;
    INSERT INTO public.ai_handoff_events(
      clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
    ) VALUES (
      p_clinic_id,p_conversation_id,v_handoff.id,'requested',v_actor,'staff_manual_takeover'
    );
  END IF;
  IF v_handoff.status='accepted' AND v_handoff.assigned_user_id=v_actor THEN
    RETURN v_handoff;
  END IF;
  IF v_handoff.assigned_user_id IS NOT NULL
     AND v_handoff.assigned_user_id <> v_actor
     AND v_handoff.status IN ('assigned','accepted') THEN
    RAISE EXCEPTION 'HANDOFF_ALREADY_ASSIGNED' USING ERRCODE='40001';
  END IF;
  UPDATE public.ai_conversation_handoffs SET
    status='accepted', assigned_user_id=v_actor,
    assigned_at=COALESCE(assigned_at,now()), accepted_at=COALESCE(accepted_at,now())
  WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET
    control_mode='human_active', active_handoff_id=v_handoff.id,
    assigned_user_id=v_actor, ai_enabled=false, status='handoff',
    control_revision=control_revision+1
  WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(
    clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
  ) VALUES (p_clinic_id,p_conversation_id,v_handoff.id,'assigned',v_actor,v_handoff.reason);
  INSERT INTO public.ai_handoff_events(
    clinic_id,conversation_id,handoff_id,action,actor_user_id,reason
  ) VALUES (p_clinic_id,p_conversation_id,v_handoff.id,'accepted',v_actor,v_handoff.reason);
  RETURN v_handoff;
END
$$;


--
-- Name: touch_lead_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_lead_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: track_lead_stage_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."track_lead_stage_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.kanban_stage IS DISTINCT FROM OLD.kanban_stage THEN
    NEW.stage_changed_at := now();

    INSERT INTO public.lead_stage_history (
      clinic_id,
      lead_id,
      from_stage,
      to_stage,
      changed_by
    ) VALUES (
      NEW.clinic_id,
      NEW.id,
      OLD.kanban_stage,
      NEW.kanban_stage,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: transfer_ai_conversation("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."transfer_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_target_user_id" "uuid") RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_staff(v_actor,p_clinic_id) OR NOT public.is_clinic_staff(p_target_user_id,p_clinic_id) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT h.* INTO v_handoff FROM public.ai_conversation_handoffs h JOIN public.whatsapp_ai_conversations c ON c.active_handoff_id=h.id
  WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id AND c.control_mode='human_active' FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_ACTIVE' USING ERRCODE='P0002'; END IF;
  IF v_handoff.assigned_user_id<>v_actor AND NOT public.has_clinic_role(v_actor,p_clinic_id,'admin') THEN RAISE EXCEPTION 'HANDOFF_NOT_OWNER' USING ERRCODE='42501'; END IF;
  UPDATE public.ai_conversation_handoffs SET assigned_user_id=p_target_user_id,status='assigned',assigned_at=now(),accepted_at=NULL WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET control_mode='handoff_pending',assigned_user_id=p_target_user_id,control_revision=control_revision+1 WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason) VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'transferred',v_actor,v_handoff.reason);
  RETURN v_handoff;
END; $$;


--
-- Name: transition_appointment_status_secure("uuid", "uuid", "public"."appointment_status"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status") RETURNS "public"."appointments"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old public.appointments;
  v_result public.appointments;
BEGIN
  SELECT *
    INTO v_old
  FROM public.appointments
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENDA_APPOINTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_user <> 'service_role'
     AND NOT public.is_clinic_staff((SELECT auth.uid()), p_clinic_id) THEN
    RAISE EXCEPTION 'AGENDA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_status = 'scheduled' AND v_old.status = 'scheduled' THEN
    RETURN v_old;
  ELSIF p_status = 'in_progress' AND v_old.status = 'confirmed' THEN
    NULL;
  ELSIF p_status = 'completed' AND v_old.status = 'in_progress' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'AGENDA_INVALID_STATUS_TRANSITION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointments
  SET status = p_status,
      checked_in_at = CASE
        WHEN p_status = 'in_progress' THEN now()
        ELSE checked_in_at
      END,
      completed_at = CASE
        WHEN p_status = 'completed' THEN now()
        ELSE completed_at
      END
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;


--
-- Name: FUNCTION "transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status") IS 'Controlled tenant-explicit transition: confirmed to in_progress to completed.';


--
-- Name: unassign_ai_conversation("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."unassign_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") RETURNS "public"."ai_conversation_handoffs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_staff(v_actor,p_clinic_id) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT h.* INTO v_handoff FROM public.ai_conversation_handoffs h JOIN public.whatsapp_ai_conversations c ON c.active_handoff_id=h.id
  WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_ACTIVE' USING ERRCODE='P0002'; END IF;
  IF v_handoff.assigned_user_id<>v_actor AND NOT public.has_clinic_role(v_actor,p_clinic_id,'admin') THEN RAISE EXCEPTION 'HANDOFF_NOT_OWNER' USING ERRCODE='42501'; END IF;
  UPDATE public.ai_conversation_handoffs SET assigned_user_id=NULL,status='queued',assigned_at=NULL,accepted_at=NULL WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET control_mode='handoff_pending',assigned_user_id=NULL,control_revision=control_revision+1 WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason) VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'unassigned',v_actor,v_handoff.reason);
  RETURN v_handoff;
END; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_whatsapp_ai_conversation_state("uuid", "uuid", integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


--
-- Name: FUNCTION "update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb") IS 'Service-role-only compare-and-swap for Aura conversation state; raises SQLSTATE 40001 on a stale revision.';


--
-- Name: user_belongs_to_clinic("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."user_belongs_to_clinic"("_user_id" "uuid", "_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id AND is_active = true) $$;


--
-- Name: validate_appointment_provider_identity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_appointment_provider_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


--
-- Name: validate_appointment_reminder_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_appointment_reminder_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinic_locations l WHERE l.id=NEW.location_id AND l.clinic_id=NEW.clinic_id
  ) THEN RAISE EXCEPTION 'AUTOMATION_LOCATION_INVALID' USING ERRCODE='23503'; END IF;
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professionals p WHERE p.id=NEW.professional_id AND p.clinic_id=NEW.clinic_id
  ) THEN RAISE EXCEPTION 'AUTOMATION_PROFESSIONAL_INVALID' USING ERRCODE='23503'; END IF;
  IF TG_OP='UPDATE' AND (NEW.template_name,NEW.template_language_code) IS DISTINCT FROM (OLD.template_name,OLD.template_language_code) THEN
    NEW.template_status := 'unverified'; NEW.template_verified_at := NULL; NEW.is_enabled := false;
  END IF;
  IF (SELECT auth.uid()) IS NOT NULL THEN NEW.updated_by := (SELECT auth.uid()); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: validate_daily_agenda_summary_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_daily_agenda_summary_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.template_name,NEW.template_language_code) IS DISTINCT FROM (OLD.template_name,OLD.template_language_code) THEN
    NEW.template_status:='unverified'; NEW.template_verified_at:=NULL; NEW.is_enabled:=false;
  END IF;
  IF (SELECT auth.uid()) IS NOT NULL THEN NEW.updated_by:=(SELECT auth.uid()); END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;


--
-- Name: validate_location_schedule_configuration(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_location_schedule_configuration"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'AGENDA_INVALID_TIMEZONE' USING ERRCODE = '22023';
  END IF;
  IF NOT public.location_opening_hours_are_valid(NEW.opening_hours) THEN
    RAISE EXCEPTION 'AGENDA_INVALID_OPENING_HOURS' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: validate_scheduling_provider_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_scheduling_provider_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


--
-- Name: access_group_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."access_group_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: access_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."access_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "access_groups_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


--
-- Name: administrative_knowledge_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."administrative_knowledge_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "scope" "text" DEFAULT 'clinic'::"text" NOT NULL,
    "location_id" "uuid",
    "professional_id" "uuid",
    "service_id" "uuid",
    "insurance_id" "uuid",
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "priority" integer DEFAULT 50 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "patient_visible" boolean DEFAULT false NOT NULL,
    CONSTRAINT "administrative_knowledge_entries_content_valid" CHECK (((("char_length"("btrim"("question")) >= 3) AND ("char_length"("btrim"("question")) <= 500)) AND (("char_length"("btrim"("answer")) >= 3) AND ("char_length"("btrim"("answer")) <= 5000)) AND "public"."administrative_text_array_is_valid"("keywords", 30, 100))),
    CONSTRAINT "administrative_knowledge_entries_priority_valid" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "administrative_knowledge_entries_published_verified" CHECK ((("status" <> 'published'::"text") OR ("verified_at" IS NOT NULL))),
    CONSTRAINT "administrative_knowledge_entries_revision_valid" CHECK (("revision" >= 1)),
    CONSTRAINT "administrative_knowledge_entries_scope_reference_valid" CHECK (((("scope" = 'clinic'::"text") AND ("location_id" IS NULL) AND ("professional_id" IS NULL) AND ("service_id" IS NULL) AND ("insurance_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL) AND ("professional_id" IS NULL) AND ("service_id" IS NULL) AND ("insurance_id" IS NULL)) OR (("scope" = 'professional'::"text") AND ("location_id" IS NULL) AND ("professional_id" IS NOT NULL) AND ("service_id" IS NULL) AND ("insurance_id" IS NULL)) OR (("scope" = 'service'::"text") AND ("location_id" IS NULL) AND ("professional_id" IS NULL) AND ("service_id" IS NOT NULL) AND ("insurance_id" IS NULL)) OR (("scope" = 'insurance'::"text") AND ("location_id" IS NULL) AND ("professional_id" IS NULL) AND ("service_id" IS NULL) AND ("insurance_id" IS NOT NULL)))),
    CONSTRAINT "administrative_knowledge_entries_scope_valid" CHECK (("scope" = ANY (ARRAY['clinic'::"text", 'location'::"text", 'professional'::"text", 'service'::"text", 'insurance'::"text"]))),
    CONSTRAINT "administrative_knowledge_entries_status_valid" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "administrative_knowledge_entries_topic_valid" CHECK (("topic" = ANY (ARRAY['address'::"text", 'parking'::"text", 'accessibility'::"text", 'opening_hours'::"text", 'arrival'::"text", 'required_documents'::"text", 'companion'::"text", 'children'::"text", 'first_consultation'::"text", 'service_preparation'::"text", 'payment_methods'::"text", 'late_policy'::"text", 'cancellation_policy'::"text", 'professional_information'::"text", 'insurance_information'::"text", 'contact'::"text", 'faq'::"text"]))),
    CONSTRAINT "administrative_knowledge_entries_validity_window" CHECK ((("valid_until" IS NULL) OR ("valid_from" IS NULL) OR ("valid_until" > "valid_from")))
);


--
-- Name: TABLE "administrative_knowledge_entries"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."administrative_knowledge_entries" IS 'Curated and versioned administrative FAQs. Only published, verified and currently valid entries may answer patients.';


--
-- Name: COLUMN "administrative_knowledge_entries"."patient_visible"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."administrative_knowledge_entries"."patient_visible" IS 'Explicit patient visibility gate. Published content remains unavailable to Aura until separately marked visible.';


--
-- Name: agenda_job_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."agenda_job_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "job_name" "text" NOT NULL,
    "run_key" "text" NOT NULL,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "details" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ai_admin_action_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_admin_action_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "previous_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "next_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_admin_action_events_action_check" CHECK (("action" = ANY (ARRAY['settings_created'::"text", 'feature_gates_changed'::"text"]))),
    CONSTRAINT "ai_admin_action_events_state_objects" CHECK ((("jsonb_typeof"("previous_state") = 'object'::"text") AND ("jsonb_typeof"("next_state") = 'object'::"text") AND ("pg_column_size"("previous_state") <= 2048) AND ("pg_column_size"("next_state") <= 2048)))
);


--
-- Name: TABLE "ai_admin_action_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_admin_action_events" IS 'Audit of AI feature-gate changes containing only booleans/mode and technical actor IDs.';


--
-- Name: ai_handoff_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_handoff_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "handoff_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_user_id" "uuid",
    "reason" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_handoff_events_action_check" CHECK (("action" = ANY (ARRAY['requested'::"text", 'queued'::"text", 'assigned'::"text", 'accepted'::"text", 'transferred'::"text", 'unassigned'::"text", 'resolved'::"text", 'returned_to_ai'::"text", 'closed'::"text", 'reopened'::"text", 'outbound_failed'::"text"])))
);


--
-- Name: TABLE "ai_handoff_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_handoff_events" IS 'Content-free operational audit for handoff lifecycle and future aggregate metrics.';


--
-- Name: ai_knowledge_answer_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_knowledge_answer_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "source_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "latency_ms" integer NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_knowledge_answer_events_latency_valid" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "ai_knowledge_answer_events_outcome_valid" CHECK (("outcome" = ANY (ARRAY['answered'::"text", 'not_found'::"text", 'ambiguous'::"text", 'restricted'::"text"]))),
    CONSTRAINT "ai_knowledge_answer_events_sources_valid" CHECK ((("jsonb_typeof"("source_refs") = 'array'::"text") AND ("jsonb_array_length"("source_refs") <= 8) AND ("octet_length"(("source_refs")::"text") <= 8000)))
);


--
-- Name: TABLE "ai_knowledge_answer_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_knowledge_answer_events" IS 'PHI-free audit of Knowledge Engine outcomes and source references. Stores no patient question or generated answer.';


--
-- Name: ai_operational_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_operational_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "correlation_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "component" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "error_code" "text",
    "error_category" "text",
    "retryable" boolean,
    "latency_ms" integer,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_operational_events_channel_valid" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'web'::"text", 'internal'::"text"]))),
    CONSTRAINT "ai_operational_events_component_valid" CHECK (("component" = ANY (ARRAY['edge'::"text", 'database'::"text", 'openai'::"text", 'whatsapp'::"text", 'conversation'::"text", 'tool'::"text", 'knowledge'::"text", 'safety'::"text", 'handoff'::"text", 'outbound'::"text"]))),
    CONSTRAINT "ai_operational_events_error_shape" CHECK (((("outcome" = 'success'::"text") AND ("error_code" IS NULL) AND ("error_category" IS NULL) AND ("retryable" IS NULL)) OR (("outcome" <> 'success'::"text") AND ("error_code" ~ '^[A-Z][A-Z0-9_]{1,79}$'::"text") AND ("error_category" = ANY (ARRAY['provider_timeout'::"text", 'provider_rate_limit'::"text", 'invalid_provider_response'::"text", 'database_error'::"text", 'rpc_conflict'::"text", 'tool_denied'::"text", 'knowledge_unavailable'::"text", 'safety_fail_closed'::"text", 'whatsapp_send_failure'::"text", 'configuration_error'::"text", 'unknown'::"text"])) AND ("retryable" IS NOT NULL)))),
    CONSTRAINT "ai_operational_events_latency_valid" CHECK ((("latency_ms" IS NULL) OR ("latency_ms" >= 0))),
    CONSTRAINT "ai_operational_events_outcome_valid" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'failure'::"text", 'rejected'::"text"]))),
    CONSTRAINT "ai_operational_events_type_valid" CHECK (("event_type" = ANY (ARRAY['whatsapp_inbound_received'::"text", 'whatsapp_inbound_rejected'::"text", 'ai_processing_started'::"text", 'ai_processing_completed'::"text", 'ai_processing_failed'::"text", 'llm_request'::"text", 'llm_failure'::"text", 'tool_execution'::"text", 'tool_failure'::"text", 'knowledge_lookup'::"text", 'safety_validation'::"text", 'handoff_requested'::"text", 'handoff_accepted'::"text", 'outbound_attempt'::"text", 'outbound_success'::"text", 'outbound_failure'::"text"])))
);


--
-- Name: TABLE "ai_operational_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_operational_events" IS 'PHI-free operational gap events for channel lifecycle and failures; no message, prompt, transcript, phone, patient name, token or raw provider payload.';


--
-- Name: ai_safety_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_safety_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "disposition" "text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "validator" "text" NOT NULL,
    "grounded" boolean NOT NULL,
    "latency_ms" integer NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_safety_events_categories_valid" CHECK ("public"."administrative_text_array_is_valid"("categories", 20, 80)),
    CONSTRAINT "ai_safety_events_disposition_valid" CHECK (("disposition" = ANY (ARRAY['allow'::"text", 'rewrite_safe'::"text", 'block'::"text", 'require_clarification'::"text", 'require_handoff'::"text"]))),
    CONSTRAINT "ai_safety_events_latency_valid" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "ai_safety_events_validator_valid" CHECK ((("char_length"("validator") >= 1) AND ("char_length"("validator") <= 80)))
);


--
-- Name: TABLE "ai_safety_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_safety_events" IS 'PHI-free technical audit of the mandatory deterministic response validator. Stores no input, draft or final text.';


--
-- Name: ai_tool_execution_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_tool_execution_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "tool_name" "text" NOT NULL,
    "tool_kind" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "error_code" "text",
    "latency_ms" integer NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_tool_execution_events_error_valid" CHECK (((("outcome" = 'success'::"text") AND ("error_code" IS NULL)) OR (("outcome" <> 'success'::"text") AND ("error_code" IS NOT NULL) AND (("char_length"("error_code") >= 1) AND ("char_length"("error_code") <= 100))))),
    CONSTRAINT "ai_tool_execution_events_kind_valid" CHECK (("tool_kind" = ANY (ARRAY['read'::"text", 'mutation'::"text"]))),
    CONSTRAINT "ai_tool_execution_events_latency_valid" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "ai_tool_execution_events_name_valid" CHECK (("tool_name" = ANY (ARRAY['list_locations'::"text", 'list_professionals'::"text", 'list_services'::"text", 'list_insurances'::"text", 'get_available_slots'::"text", 'find_patient_appointments'::"text", 'create_appointment'::"text", 'confirm_appointment'::"text", 'cancel_appointment'::"text", 'reschedule_appointment'::"text", 'search_administrative_knowledge'::"text"]))),
    CONSTRAINT "ai_tool_execution_events_outcome_valid" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'clarification_required'::"text", 'denied'::"text", 'error'::"text"])))
);


--
-- Name: TABLE "ai_tool_execution_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_tool_execution_events" IS 'PHI-free technical audit of typed Aura tool executions. Stores no arguments, result payloads, prompts or responses.';


--
-- Name: ai_tool_mutation_claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_tool_mutation_claims" (
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "tool_name" "text" NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_tool_mutation_claims_name_valid" CHECK (("tool_name" = ANY (ARRAY['create_appointment'::"text", 'confirm_appointment'::"text", 'cancel_appointment'::"text", 'reschedule_appointment'::"text"])))
);


--
-- Name: TABLE "ai_tool_mutation_claims"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_tool_mutation_claims" IS 'Atomic idempotency claims for Aura scheduling mutations, keyed by tenant, correlation and tool.';


--
-- Name: ai_usage_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text",
    "input_units" integer,
    "output_units" integer,
    "total_units" integer,
    "preprocessing_latency_ms" integer,
    "provider_latency_ms" integer,
    "total_latency_ms" integer NOT NULL,
    "outcome" "text" NOT NULL,
    "error_code" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_usage_events_channel_valid" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'web'::"text", 'internal'::"text"]))),
    CONSTRAINT "ai_usage_events_error_valid" CHECK (((("outcome" = 'success'::"text") AND ("error_code" IS NULL)) OR (("outcome" = 'error'::"text") AND ("error_code" IS NOT NULL) AND (("char_length"("error_code") >= 1) AND ("char_length"("error_code") <= 100))))),
    CONSTRAINT "ai_usage_events_latency_valid" CHECK (((("preprocessing_latency_ms" IS NULL) OR ("preprocessing_latency_ms" >= 0)) AND (("provider_latency_ms" IS NULL) OR ("provider_latency_ms" >= 0)) AND ("total_latency_ms" >= 0))),
    CONSTRAINT "ai_usage_events_message_type_valid" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'audio'::"text", 'image'::"text", 'document'::"text"]))),
    CONSTRAINT "ai_usage_events_model_not_blank" CHECK ((("model" IS NULL) OR ("btrim"("model") <> ''::"text"))),
    CONSTRAINT "ai_usage_events_outcome_valid" CHECK (("outcome" = ANY (ARRAY['success'::"text", 'error'::"text"]))),
    CONSTRAINT "ai_usage_events_provider_valid" CHECK (("provider" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "ai_usage_events_request_type_valid" CHECK (("request_type" = ANY (ARRAY['llm_response'::"text", 'conversation_interpretation'::"text", 'tool_response'::"text", 'transcription'::"text", 'vision'::"text", 'document_preprocessing'::"text"]))),
    CONSTRAINT "ai_usage_events_units_valid" CHECK (((("input_units" IS NULL) OR ("input_units" >= 0)) AND (("output_units" IS NULL) OR ("output_units" >= 0)) AND (("total_units" IS NULL) OR ("total_units" >= 0))))
);


--
-- Name: TABLE "ai_usage_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_usage_events" IS 'Clinic-scoped AI metering without prompts, responses, media, URLs, tokens, headers, PHI, or raw provider payloads.';


--
-- Name: COLUMN "ai_usage_events"."correlation_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ai_usage_events"."correlation_id" IS 'Technical UUID propagated across ingestion, processing, LLM, usage and outbound handling; never derived from PII.';


--
-- Name: appointment_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."appointment_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_id" "uuid",
    CONSTRAINT "appointment_blocks_valid_period" CHECK (("end_at" > "start_at"))
);


--
-- Name: appointment_reminder_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."appointment_reminder_settings" (
    "clinic_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "preferred_send_time" time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    "template_name" "text" DEFAULT 'appointment_reminder_7d'::"text" NOT NULL,
    "template_language_code" "text" DEFAULT 'pt_BR'::"text" NOT NULL,
    "template_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "template_verified_at" timestamp with time zone,
    "location_id" "uuid",
    "professional_id" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "automation_key" "text" DEFAULT 'appointment_reminder_7d'::"text" NOT NULL,
    CONSTRAINT "appointment_reminder_7d_settings_check" CHECK (((NOT "is_enabled") OR ("template_status" = 'approved'::"text"))),
    CONSTRAINT "appointment_reminder_7d_settings_template_language_code_check" CHECK (("template_language_code" ~ '^[a-z]{2}_[A-Z]{2}$'::"text")),
    CONSTRAINT "appointment_reminder_7d_settings_template_name_check" CHECK ((("char_length"("template_name") >= 1) AND ("char_length"("template_name") <= 512) AND ("template_name" ~ '^[a-z0-9_]+$'::"text"))),
    CONSTRAINT "appointment_reminder_7d_settings_template_status_check" CHECK (("template_status" = ANY (ARRAY['unverified'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "appointment_reminder_settings_automation_key_check" CHECK (("automation_key" = ANY (ARRAY['appointment_reminder_7d'::"text", 'appointment_reminder_24h'::"text"])))
);


--
-- Name: TABLE "appointment_reminder_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."appointment_reminder_settings" IS 'Tenant-scoped settings shared by canonical appointment reminder automations.';


--
-- Name: appointment_waitlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."appointment_waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "lead_id" "uuid",
    "preferred_professional_id" "uuid",
    "treatment_id" "uuid",
    "window_type" "public"."waitlist_window_type" NOT NULL,
    "window_start" "date" NOT NULL,
    "window_end" "date" NOT NULL,
    "preferred_periods" "text"[] DEFAULT ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"] NOT NULL,
    "min_duration_minutes" integer DEFAULT 60 NOT NULL,
    "priority" "public"."waitlist_priority" DEFAULT 'normal'::"public"."waitlist_priority" NOT NULL,
    "status" "public"."waitlist_status" DEFAULT 'waiting'::"public"."waitlist_status" NOT NULL,
    "contact_preference" "public"."waitlist_contact_preference" DEFAULT 'whatsapp'::"public"."waitlist_contact_preference" NOT NULL,
    "contact_phone" "text",
    "notes" "text",
    "resulting_appointment_id" "uuid",
    "last_checked_at" timestamp with time zone,
    "match_found_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_id" "uuid",
    "health_insurance_id" "uuid",
    "billing_type" "text",
    "appointment_type" "text",
    CONSTRAINT "appointment_waitlist_appointment_type_check" CHECK ((("appointment_type" IS NULL) OR ("appointment_type" = ANY (ARRAY['first_visit'::"text", 'consultation'::"text", 'return_or_post_op'::"text", 'maintenance'::"text", 'procedure'::"text"])))),
    CONSTRAINT "appointment_waitlist_billing_type_check" CHECK ((("billing_type" IS NULL) OR ("billing_type" = ANY (ARRAY['private'::"text", 'insurance'::"text"])))),
    CONSTRAINT "appointment_waitlist_insurance_context_check" CHECK ((("billing_type" IS DISTINCT FROM 'insurance'::"text") OR ("health_insurance_id" IS NOT NULL))),
    CONSTRAINT "appointment_waitlist_min_duration_minutes_check" CHECK (("min_duration_minutes" > 0)),
    CONSTRAINT "waitlist_patient_or_lead_required" CHECK ((("patient_id" IS NOT NULL) OR ("lead_id" IS NOT NULL))),
    CONSTRAINT "waitlist_window_valid" CHECK (("window_end" >= "window_start"))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: class_entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."class_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "abbreviation" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "linked_professionals" "text"
);


--
-- Name: clinic_administrative_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."clinic_administrative_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "arrival_minutes" integer,
    "arrival_instructions" "text",
    "required_documents" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "companion_policy" "text",
    "children_policy" "text",
    "first_consultation_information" "text",
    "allowed_payment_methods" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "late_policy" "text",
    "cancellation_policy" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinic_administrative_policies_arrival_minutes_valid" CHECK ((("arrival_minutes" IS NULL) OR (("arrival_minutes" >= 0) AND ("arrival_minutes" <= 180)))),
    CONSTRAINT "clinic_administrative_policies_documents_valid" CHECK ("public"."administrative_text_array_is_valid"("required_documents", 30, 200)),
    CONSTRAINT "clinic_administrative_policies_payment_methods_valid" CHECK ("public"."administrative_text_array_is_valid"("allowed_payment_methods", 20, 100)),
    CONSTRAINT "clinic_administrative_policies_text_size" CHECK (((COALESCE("char_length"("arrival_instructions"), 0) <= 3000) AND (COALESCE("char_length"("companion_policy"), 0) <= 3000) AND (COALESCE("char_length"("children_policy"), 0) <= 3000) AND (COALESCE("char_length"("first_consultation_information"), 0) <= 4000) AND (COALESCE("char_length"("late_policy"), 0) <= 3000) AND (COALESCE("char_length"("cancellation_policy"), 0) <= 3000)))
);


--
-- Name: TABLE "clinic_administrative_policies"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."clinic_administrative_policies" IS 'Structured clinic-wide administrative policies consumed by the source-backed Knowledge Engine.';


--
-- Name: clinic_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."clinic_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address_line" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "phone" "text",
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opening_hours" "jsonb",
    "parking_information" "text",
    "accessibility_information" "text",
    "hide_closed_days" boolean DEFAULT true NOT NULL,
    "limit_calendar_to_operating_hours" boolean DEFAULT true NOT NULL,
    CONSTRAINT "clinic_locations_accessibility_information_size" CHECK ((("accessibility_information" IS NULL) OR ("char_length"("accessibility_information") <= 2000))),
    CONSTRAINT "clinic_locations_opening_hours_object" CHECK ((("opening_hours" IS NULL) OR (("jsonb_typeof"("opening_hours") = 'object'::"text") AND ("octet_length"(("opening_hours")::"text") <= 12000)))),
    CONSTRAINT "clinic_locations_parking_information_size" CHECK ((("parking_information" IS NULL) OR ("char_length"("parking_information") <= 2000)))
);


--
-- Name: COLUMN "clinic_locations"."opening_hours"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."clinic_locations"."opening_hours" IS 'Aura canonical weekly hours. Schema v1: {schemaVersion:1,weekdays:{"0".."6":[{start:"HH:mm",end:"HH:mm"}]}}.';


--
-- Name: clinic_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."clinic_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: clinics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#1a7a6d'::"text",
    "secondary_color" "text" DEFAULT '#f5f0e8'::"text",
    "accent_color" "text" DEFAULT '#c8912e'::"text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "support_whatsapp" "text",
    "custom_domain" "text",
    "white_label_enabled" boolean DEFAULT false NOT NULL,
    "plan_name" "text" DEFAULT 'starter'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "administrative_manager_name" "text",
    "reception_contact_name" "text",
    CONSTRAINT "clinics_administrative_manager_name_length" CHECK ((("administrative_manager_name" IS NULL) OR ("char_length"("btrim"("administrative_manager_name")) <= 160))),
    CONSTRAINT "clinics_reception_contact_name_length" CHECK ((("reception_contact_name" IS NULL) OR ("char_length"("btrim"("reception_contact_name")) <= 160)))
);


--
-- Name: COLUMN "clinics"."administrative_manager_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."clinics"."administrative_manager_name" IS 'Optional administrative manager contact name. Does not reference an Aura user.';


--
-- Name: COLUMN "clinics"."reception_contact_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."clinics"."reception_contact_name" IS 'Optional secretary or reception contact name. Does not reference an Aura user.';


--
-- Name: daily_agenda_summary_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."daily_agenda_summary_settings" (
    "clinic_id" "uuid" NOT NULL,
    "automation_key" "text" DEFAULT 'daily_agenda_summary'::"text" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "send_time" time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    "send_when_empty" boolean DEFAULT false NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "template_name" "text" DEFAULT 'daily_agenda_summary'::"text" NOT NULL,
    "template_language_code" "text" DEFAULT 'pt_BR'::"text" NOT NULL,
    "template_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "template_verified_at" timestamp with time zone,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_agenda_summary_settings_automation_key_check" CHECK (("automation_key" = 'daily_agenda_summary'::"text")),
    CONSTRAINT "daily_agenda_summary_settings_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "daily_agenda_summary_settings_check" CHECK (((NOT "is_enabled") OR ("template_status" = 'approved'::"text"))),
    CONSTRAINT "daily_agenda_summary_settings_template_language_code_check" CHECK (("template_language_code" ~ '^[a-z]{2}_[A-Z]{2}$'::"text")),
    CONSTRAINT "daily_agenda_summary_settings_template_name_check" CHECK ((("char_length"("template_name") >= 1) AND ("char_length"("template_name") <= 512) AND ("template_name" ~ '^[a-z0-9_]+$'::"text"))),
    CONSTRAINT "daily_agenda_summary_settings_template_status_check" CHECK (("template_status" = ANY (ARRAY['unverified'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: health_insurances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."health_insurances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "ans_code" "text",
    "phone" "text",
    "email" "text",
    "authorization_notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "health_insurances_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "health_insurances_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


--
-- Name: TABLE "health_insurances"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."health_insurances" IS 'Convênios disponíveis por clínica, incluindo dados usados no atendimento e autorização.';


--
-- Name: lead_interactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."lead_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "notes" "text",
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: lead_stage_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."lead_stage_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "from_stage" "text",
    "to_stage" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "cpf" "text",
    "birth_date" "date",
    "email" "text",
    "kanban_stage" "text" DEFAULT 'new_lead'::"text" NOT NULL,
    "assigned_to" "uuid",
    "source" "text",
    "treatments_of_interest" "text"[] DEFAULT '{}'::"text"[],
    "notes" "text",
    "lost_reason" "text",
    "lost_reason_notes" "text",
    "patient_id" "uuid",
    "appointment_id" "uuid",
    "last_interaction_at" timestamp with time zone,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converted_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "next_action" "text",
    "next_action_at" timestamp with time zone,
    "priority_level" "text" DEFAULT 'medium'::"text" NOT NULL,
    "zip_code" "text",
    "address" "text",
    "city" "text",
    "state" "text"
);


--
-- Name: patients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "cpf" "text",
    "date_of_birth" "date",
    "gender" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "notes" "text",
    "status" "public"."patient_status" DEFAULT 'active'::"public"."patient_status" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: professional_availability; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professional_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_id" "uuid",
    "valid_from" "date",
    "valid_until" "date",
    CONSTRAINT "professional_availability_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "professional_availability_valid_dates" CHECK ((("valid_until" IS NULL) OR ("valid_from" IS NULL) OR ("valid_until" >= "valid_from"))),
    CONSTRAINT "professional_availability_valid_period" CHECK (("end_time" > "start_time"))
);


--
-- Name: professional_health_insurances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professional_health_insurances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "health_insurance_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepts_new_patients" boolean DEFAULT true NOT NULL,
    "authorization_required" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "ai_instructions" "text",
    "appointment_duration_minutes" integer DEFAULT 20 NOT NULL,
    CONSTRAINT "professional_health_insuranc_appointment_duration_minutes_check" CHECK ((("appointment_duration_minutes" >= 5) AND ("appointment_duration_minutes" <= 480))),
    CONSTRAINT "professional_health_insurances_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


--
-- Name: TABLE "professional_health_insurances"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."professional_health_insurances" IS 'Relação entre profissionais e os convênios que atendem, preparada para consulta da IA.';


--
-- Name: COLUMN "professional_health_insurances"."appointment_duration_minutes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professional_health_insurances"."appointment_duration_minutes" IS 'Duração padrão, em minutos, da consulta deste profissional por este convênio.';


--
-- Name: professional_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professional_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: professional_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professional_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "allow_ai_booking" boolean DEFAULT false NOT NULL,
    "allow_ai_cancellation" boolean DEFAULT false NOT NULL,
    "allow_ai_rescheduling" boolean DEFAULT false NOT NULL,
    "allow_waitlist" boolean DEFAULT true NOT NULL,
    "accept_new_patients" boolean DEFAULT true NOT NULL,
    "minimum_booking_notice_hours" integer DEFAULT 2 NOT NULL,
    "maximum_booking_days" integer DEFAULT 90 NOT NULL,
    "cancellation_notice_hours" integer DEFAULT 24 NOT NULL,
    "default_appointment_duration_minutes" integer DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "private_appointment_duration_minutes" integer DEFAULT 60 NOT NULL,
    "first_visit_price" numeric(12,2),
    "first_visit_duration_minutes" integer,
    CONSTRAINT "professional_settings_cancellation_notice_hours_check" CHECK (("cancellation_notice_hours" >= 0)),
    CONSTRAINT "professional_settings_default_appointment_duration_minute_check" CHECK ((("default_appointment_duration_minutes" >= 5) AND ("default_appointment_duration_minutes" <= 480))),
    CONSTRAINT "professional_settings_first_visit_complete_check" CHECK ((("first_visit_price" IS NULL) = ("first_visit_duration_minutes" IS NULL))),
    CONSTRAINT "professional_settings_first_visit_duration_check" CHECK ((("first_visit_duration_minutes" IS NULL) OR (("first_visit_duration_minutes" >= 5) AND ("first_visit_duration_minutes" <= 480)))),
    CONSTRAINT "professional_settings_first_visit_price_check" CHECK ((("first_visit_price" IS NULL) OR ("first_visit_price" >= (0)::numeric))),
    CONSTRAINT "professional_settings_maximum_booking_days_check" CHECK (("maximum_booking_days" > 0)),
    CONSTRAINT "professional_settings_minimum_booking_notice_hours_check" CHECK (("minimum_booking_notice_hours" >= 0)),
    CONSTRAINT "professional_settings_private_appointment_duration_minute_check" CHECK ((("private_appointment_duration_minutes" >= 5) AND ("private_appointment_duration_minutes" <= 480)))
);


--
-- Name: COLUMN "professional_settings"."private_appointment_duration_minutes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professional_settings"."private_appointment_duration_minutes" IS 'Duração padrão, em minutos, da consulta particular deste profissional.';


--
-- Name: COLUMN "professional_settings"."first_visit_price"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professional_settings"."first_visit_price" IS 'Optional private first-visit price override. NULL inherits professionals.private_consultation_price.';


--
-- Name: COLUMN "professional_settings"."first_visit_duration_minutes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professional_settings"."first_visit_duration_minutes" IS 'Optional private first-visit duration override. NULL inherits private_appointment_duration_minutes.';


--
-- Name: professional_treatments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professional_treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "duration_minutes" integer,
    "private_price" numeric(10,2),
    "show_price" boolean,
    "can_ai_schedule" boolean,
    "requires_previous_evaluation" boolean,
    CONSTRAINT "professional_treatments_duration_minutes_check" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 480))),
    CONSTRAINT "professional_treatments_private_price_check" CHECK (("private_price" >= (0)::numeric))
);


--
-- Name: professionals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role_id" "uuid",
    "class_entity_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "registration_number" "text",
    "specialty" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cpf" "text",
    "additional_phones" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "private_consultation_price" numeric(12,2),
    CONSTRAINT "professionals_additional_phones_limit" CHECK (("cardinality"("additional_phones") <= 10)),
    CONSTRAINT "professionals_private_consultation_price_nonnegative" CHECK ((("private_consultation_price" IS NULL) OR ("private_consultation_price" >= (0)::numeric)))
);


--
-- Name: COLUMN "professionals"."user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professionals"."user_id" IS 'Optional Supabase Auth login. The professional can operate in the agenda without a user account.';


--
-- Name: COLUMN "professionals"."additional_phones"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professionals"."additional_phones" IS 'Telefones adicionais do profissional. O contato principal permanece na coluna phone.';


--
-- Name: COLUMN "professionals"."private_consultation_price"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."professionals"."private_consultation_price" IS 'Valor padrão da consulta particular deste profissional, em reais.';


--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: scheduling_connection_professionals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_connection_professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "scheduling_connection_professionals"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_connection_professionals" IS 'Optional active provider override per professional. Clinic default remains on the connection.';


--
-- Name: scheduling_exceptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "professional_id" "uuid",
    "exception_date" "date" NOT NULL,
    "is_closed" boolean DEFAULT true NOT NULL,
    "periods" "jsonb",
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_exceptions_kind_check" CHECK (("kind" = ANY (ARRAY['holiday'::"text", 'day_off'::"text", 'special_hours'::"text", 'other'::"text"]))),
    CONSTRAINT "scheduling_exceptions_periods_shape" CHECK ((("is_closed" AND (("periods" IS NULL) OR ("periods" = '[]'::"jsonb"))) OR ((NOT "is_closed") AND ("periods" IS NOT NULL) AND ("jsonb_array_length"("periods") > 0) AND "public"."schedule_periods_are_valid"("periods")))),
    CONSTRAINT "scheduling_exceptions_reason_size" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 500)))
);


--
-- Name: TABLE "scheduling_exceptions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_exceptions" IS 'Date-specific location/professional override. professional_id NULL means location-wide exception.';


--
-- Name: scheduling_insurance_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_insurance_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "health_insurance_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_parent_id" "text",
    "external_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_insurance_mappings_external_id_not_blank" CHECK (("btrim"("external_id") <> ''::"text")),
    CONSTRAINT "scheduling_insurance_mappings_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_insurance_mappings_status_valid" CHECK (("status" = ANY (ARRAY['active'::"text", 'stale'::"text", 'invalid'::"text", 'disabled'::"text"])))
);


--
-- Name: TABLE "scheduling_insurance_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_insurance_mappings" IS 'One-to-one active mapping between an Aura health insurance and a provider resource.';


--
-- Name: scheduling_location_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_location_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_parent_id" "text",
    "external_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_location_mappings_external_id_not_blank" CHECK (("btrim"("external_id") <> ''::"text")),
    CONSTRAINT "scheduling_location_mappings_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_location_mappings_status_valid" CHECK (("status" = ANY (ARRAY['active'::"text", 'stale'::"text", 'invalid'::"text", 'disabled'::"text"])))
);


--
-- Name: TABLE "scheduling_location_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_location_mappings" IS 'One-to-one active mapping between an Aura clinic location and a provider resource.';


--
-- Name: scheduling_professional_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_professional_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_parent_id" "text",
    "external_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_professional_mappings_external_id_not_blank" CHECK (("btrim"("external_id") <> ''::"text")),
    CONSTRAINT "scheduling_professional_mappings_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_professional_mappings_status_valid" CHECK (("status" = ANY (ARRAY['active'::"text", 'stale'::"text", 'invalid'::"text", 'disabled'::"text"])))
);


--
-- Name: TABLE "scheduling_professional_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_professional_mappings" IS 'One-to-one active mapping between an Aura professional and a provider resource.';


--
-- Name: scheduling_provider_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_provider_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "provider_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "display_name" "text" NOT NULL,
    "external_account_id" "text",
    "external_account_name" "text",
    "source_of_truth" "text" NOT NULL,
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "connected_at" timestamp with time zone,
    "disconnected_at" timestamp with time zone,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_provider_connections_capabilities_object" CHECK (("jsonb_typeof"("capabilities") = 'object'::"text")),
    CONSTRAINT "scheduling_provider_connections_display_name_not_blank" CHECK (("btrim"("display_name") <> ''::"text")),
    CONSTRAINT "scheduling_provider_connections_external_account_not_blank" CHECK ((("external_account_id" IS NULL) OR ("btrim"("external_account_id") <> ''::"text"))),
    CONSTRAINT "scheduling_provider_connections_internal_valid" CHECK ((("provider_type" <> 'internal'::"text") OR (("source_of_truth" = 'aura'::"text") AND ("external_account_id" IS NULL) AND ("external_account_name" IS NULL)))),
    CONSTRAINT "scheduling_provider_connections_lifecycle_times_valid" CHECK ((("disconnected_at" IS NULL) OR ("connected_at" IS NULL) OR ("disconnected_at" >= "connected_at"))),
    CONSTRAINT "scheduling_provider_connections_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_provider_connections_provider_type_valid" CHECK (("provider_type" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "scheduling_provider_connections_source_valid" CHECK (("source_of_truth" = ANY (ARRAY['aura'::"text", 'external_provider'::"text"]))),
    CONSTRAINT "scheduling_provider_connections_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'disconnected'::"text", 'error'::"text", 'reauthorization_required'::"text", 'disabled'::"text"])))
);


--
-- Name: TABLE "scheduling_provider_connections"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_provider_connections" IS 'Provider-neutral scheduling account/configuration. Contains no OAuth tokens or provider secrets.';


--
-- Name: COLUMN "scheduling_provider_connections"."provider_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scheduling_provider_connections"."provider_type" IS 'Extensible lowercase provider key; validated by format instead of a PostgreSQL enum.';


--
-- Name: COLUMN "scheduling_provider_connections"."capabilities"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scheduling_provider_connections"."capabilities" IS 'Effective connection capabilities normalized by the application; boolean JSON object.';


--
-- Name: COLUMN "scheduling_provider_connections"."metadata"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scheduling_provider_connections"."metadata" IS 'Limited non-secret provider metadata. Credential storage is deferred to provider implementation.';


--
-- Name: scheduling_provider_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_provider_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "provider_type" "text" NOT NULL,
    "external_event_id" "text",
    "payload_hash" "text",
    "event_type" "text" NOT NULL,
    "external_appointment_id" "text",
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_provider_events_error_code_length" CHECK ((("error_code" IS NULL) OR ("char_length"("error_code") <= 100))),
    CONSTRAINT "scheduling_provider_events_error_message_length" CHECK ((("error_message" IS NULL) OR ("char_length"("error_message") <= 1000))),
    CONSTRAINT "scheduling_provider_events_event_type_not_blank" CHECK (("btrim"("event_type") <> ''::"text")),
    CONSTRAINT "scheduling_provider_events_external_appointment_not_blank" CHECK ((("external_appointment_id" IS NULL) OR ("btrim"("external_appointment_id") <> ''::"text"))),
    CONSTRAINT "scheduling_provider_events_identity_valid" CHECK (((("external_event_id" IS NOT NULL) AND ("btrim"("external_event_id") <> ''::"text")) OR (("payload_hash" IS NOT NULL) AND ("btrim"("payload_hash") <> ''::"text")))),
    CONSTRAINT "scheduling_provider_events_provider_type_valid" CHECK (("provider_type" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "scheduling_provider_events_status_valid" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'ignored'::"text", 'error'::"text"])))
);


--
-- Name: TABLE "scheduling_provider_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_provider_events" IS 'Idempotency inbox metadata without raw provider payloads. No webhook or polling is implemented.';


--
-- Name: scheduling_reconciliation_states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_reconciliation_states" (
    "connection_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "checkpoint" "text",
    "sync_token" "text",
    "checkpoint_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_started_at" timestamp with time zone,
    "last_completed_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_error_code" "text",
    "last_error_message" "text",
    "last_error_at" timestamp with time zone,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_reconciliation_states_checkpoint_metadata_object" CHECK (("jsonb_typeof"("checkpoint_metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_reconciliation_states_error_code_length" CHECK ((("last_error_code" IS NULL) OR ("char_length"("last_error_code") <= 100))),
    CONSTRAINT "scheduling_reconciliation_states_error_message_length" CHECK ((("last_error_message" IS NULL) OR ("char_length"("last_error_message") <= 1000))),
    CONSTRAINT "scheduling_reconciliation_states_failures_valid" CHECK (("consecutive_failures" >= 0)),
    CONSTRAINT "scheduling_reconciliation_states_status_valid" CHECK (("status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'error'::"text"]))),
    CONSTRAINT "scheduling_reconciliation_states_times_valid" CHECK ((("last_completed_at" IS NULL) OR ("last_started_at" IS NULL) OR ("last_completed_at" >= "last_started_at")))
);


--
-- Name: TABLE "scheduling_reconciliation_states"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_reconciliation_states" IS 'One provider-neutral reconciliation checkpoint per scheduling connection. No job is implemented.';


--
-- Name: scheduling_service_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scheduling_service_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_parent_id" "text",
    "external_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduling_service_mappings_external_id_not_blank" CHECK (("btrim"("external_id") <> ''::"text")),
    CONSTRAINT "scheduling_service_mappings_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "scheduling_service_mappings_status_valid" CHECK (("status" = ANY (ARRAY['active'::"text", 'stale'::"text", 'invalid'::"text", 'disabled'::"text"])))
);


--
-- Name: TABLE "scheduling_service_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scheduling_service_mappings" IS 'One-to-one active mapping between an Aura treatment/service and a provider resource.';


--
-- Name: team_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."team_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cargo_name" "text"
);


--
-- Name: treatment_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."treatment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text"
);


--
-- Name: treatments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid",
    "can_be_scheduled_online" boolean DEFAULT true NOT NULL,
    "can_be_scheduled_by_ai" boolean DEFAULT false NOT NULL,
    "requires_evaluation" boolean DEFAULT false NOT NULL,
    "show_price_to_patient" boolean DEFAULT false NOT NULL,
    "show_price_to_ai" boolean DEFAULT false NOT NULL,
    "preparation_instructions" "text",
    "administrative_instructions" "text",
    CONSTRAINT "treatments_administrative_instructions_size" CHECK ((("administrative_instructions" IS NULL) OR ("char_length"("administrative_instructions") <= 4000))),
    CONSTRAINT "treatments_preparation_instructions_size" CHECK ((("preparation_instructions" IS NULL) OR ("char_length"("preparation_instructions") <= 4000)))
);


--
-- Name: user_access_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_access_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: waitlist_agent_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."waitlist_agent_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "entries_checked" integer DEFAULT 0 NOT NULL,
    "matches_found" integer DEFAULT 0 NOT NULL,
    "notifications_sent" integer DEFAULT 0 NOT NULL,
    "errors" "jsonb",
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: waitlist_match_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."waitlist_match_events" (
    "id" bigint NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "location_id" "uuid",
    "professional_id" "uuid",
    "slot_start" timestamp with time zone,
    "slot_end" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "waitlist_match_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['appointment_cancelled'::"text", 'appointment_rescheduled'::"text", 'block_removed'::"text", 'schedule_changed'::"text", 'periodic_reconciliation'::"text"])))
);


--
-- Name: TABLE "waitlist_match_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."waitlist_match_events" IS 'Explicit availability hints. They trigger reconciliation only; SchedulingService remains authoritative.';


--
-- Name: waitlist_match_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."waitlist_match_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."waitlist_match_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: waitlist_matching_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."waitlist_matching_settings" (
    "clinic_id" "uuid" NOT NULL,
    "automation_key" "text" DEFAULT 'waitlist_matching'::"text" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "offer_ttl_minutes" integer DEFAULT 30 NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "template_name" "text" DEFAULT 'waitlist_slot_offer'::"text" NOT NULL,
    "template_language_code" "text" DEFAULT 'pt_BR'::"text" NOT NULL,
    "template_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "template_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "waitlist_matching_settings_automation_key_check" CHECK (("automation_key" = 'waitlist_matching'::"text")),
    CONSTRAINT "waitlist_matching_settings_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "waitlist_matching_settings_offer_ttl_minutes_check" CHECK ((("offer_ttl_minutes" >= 5) AND ("offer_ttl_minutes" <= 120))),
    CONSTRAINT "waitlist_matching_settings_template_status_check" CHECK (("template_status" = ANY (ARRAY['unverified'::"text", 'approved'::"text", 'rejected'::"text"])))
);


--
-- Name: whatsapp_ai_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whatsapp_ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "phone" "text" NOT NULL,
    "contact_name" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "last_message_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_state" "jsonb" DEFAULT '{"entities": {}, "constraints": {"excludedInsurances": [], "excludedProfessionals": [], "excludedTimePreferences": []}, "activeIntent": "unknown", "schemaVersion": 1, "activeIntentStatus": "collecting", "lastPresentedOptions": []}'::"jsonb" NOT NULL,
    "state_revision" integer DEFAULT 0 NOT NULL,
    "state_updated_at" timestamp with time zone,
    "control_mode" "text" DEFAULT 'ai_active'::"text" NOT NULL,
    "active_handoff_id" "uuid",
    "ai_failure_count" integer DEFAULT 0 NOT NULL,
    "control_revision" bigint DEFAULT 0 NOT NULL,
    "assigned_user_id" "uuid",
    CONSTRAINT "whatsapp_ai_conversations_control_mode_valid" CHECK (("control_mode" = ANY (ARRAY['ai_active'::"text", 'handoff_pending'::"text", 'human_active'::"text", 'ai_resume_pending'::"text", 'closed'::"text"]))),
    CONSTRAINT "whatsapp_ai_conversations_control_revision_valid" CHECK (("control_revision" >= 0)),
    CONSTRAINT "whatsapp_ai_conversations_failure_count_valid" CHECK ((("ai_failure_count" >= 0) AND ("ai_failure_count" <= 100))),
    CONSTRAINT "whatsapp_ai_conversations_state_revision_valid" CHECK (("state_revision" >= 0)),
    CONSTRAINT "whatsapp_ai_conversations_state_shape_valid" CHECK ((("jsonb_typeof"("conversation_state") = 'object'::"text") AND (("conversation_state" ->> 'schemaVersion'::"text") = '1'::"text") AND ("jsonb_typeof"(("conversation_state" -> 'entities'::"text")) = 'object'::"text") AND ("jsonb_typeof"(("conversation_state" -> 'constraints'::"text")) = 'object'::"text") AND ("jsonb_typeof"(("conversation_state" -> 'lastPresentedOptions'::"text")) = 'array'::"text") AND ("octet_length"(("conversation_state")::"text") <= 16384))),
    CONSTRAINT "whatsapp_ai_conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'handoff'::"text", 'closed'::"text"])))
);


--
-- Name: COLUMN "whatsapp_ai_conversations"."conversation_state"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_conversations"."conversation_state" IS 'Versioned, clinic-scoped operational conversation context. Never a source of scheduling truth or long-term memory.';


--
-- Name: COLUMN "whatsapp_ai_conversations"."state_revision"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_conversations"."state_revision" IS 'Optimistic concurrency counter incremented atomically by update_whatsapp_ai_conversation_state.';


--
-- Name: COLUMN "whatsapp_ai_conversations"."control_mode"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_ai_conversations"."control_mode" IS 'Per-conversation control plane; independent from clinic ai_engine_mode.';


--
-- Name: whatsapp_ai_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whatsapp_ai_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "direction" "text" NOT NULL,
    "role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "provider_message_id" "text",
    "provider_status" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ai_model" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_origin" "text" DEFAULT 'patient'::"text" NOT NULL,
    "actor_user_id" "uuid",
    CONSTRAINT "whatsapp_ai_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "whatsapp_ai_messages_origin_valid" CHECK (("message_origin" = ANY (ARRAY['patient'::"text", 'ai'::"text", 'human'::"text", 'system'::"text"]))),
    CONSTRAINT "whatsapp_ai_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


--
-- Name: whatsapp_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whatsapp_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "waba_id" "text" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "display_phone_number" "text",
    "business_name" "text",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "token_ciphertext" "text" NOT NULL,
    "token_expires_at" timestamp with time zone,
    "connected_by" "uuid",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disconnected_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_connections_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'attention'::"text", 'disconnected'::"text"])))
);


--
-- Name: TABLE "whatsapp_connections"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."whatsapp_connections" IS 'One Meta WhatsApp Business connection per clinic. Tokens are AES-GCM encrypted by Edge Functions.';


--
-- Name: COLUMN "whatsapp_connections"."token_ciphertext"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."whatsapp_connections"."token_ciphertext" IS 'Server-only AES-GCM payload. Never return this column to the browser.';


--
-- Name: access_group_permissions access_group_permissions_group_id_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_group_permissions"
    ADD CONSTRAINT "access_group_permissions_group_id_permission_key_key" UNIQUE ("group_id", "permission_key");


--
-- Name: access_group_permissions access_group_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_group_permissions"
    ADD CONSTRAINT "access_group_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: access_groups access_groups_clinic_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_groups"
    ADD CONSTRAINT "access_groups_clinic_id_code_key" UNIQUE ("clinic_id", "code");


--
-- Name: access_groups access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_groups"
    ADD CONSTRAINT "access_groups_pkey" PRIMARY KEY ("id");


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_pkey" PRIMARY KEY ("id");


--
-- Name: agenda_job_executions agenda_job_executions_job_name_run_key_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agenda_job_executions"
    ADD CONSTRAINT "agenda_job_executions_job_name_run_key_clinic_id_key" UNIQUE ("job_name", "run_key", "clinic_id");


--
-- Name: agenda_job_executions agenda_job_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agenda_job_executions"
    ADD CONSTRAINT "agenda_job_executions_pkey" PRIMARY KEY ("id");


--
-- Name: ai_admin_action_events ai_admin_action_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_admin_action_events"
    ADD CONSTRAINT "ai_admin_action_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_id_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_id_clinic_id_key" UNIQUE ("id", "clinic_id");


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_pkey" PRIMARY KEY ("id");


--
-- Name: ai_handoff_events ai_handoff_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_handoff_events"
    ADD CONSTRAINT "ai_handoff_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_knowledge_answer_events ai_knowledge_answer_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_knowledge_answer_events"
    ADD CONSTRAINT "ai_knowledge_answer_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_operational_events ai_operational_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_operational_events"
    ADD CONSTRAINT "ai_operational_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_safety_events ai_safety_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_safety_events"
    ADD CONSTRAINT "ai_safety_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_tool_execution_events ai_tool_execution_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_execution_events"
    ADD CONSTRAINT "ai_tool_execution_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_tool_mutation_claims ai_tool_mutation_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_mutation_claims"
    ADD CONSTRAINT "ai_tool_mutation_claims_pkey" PRIMARY KEY ("clinic_id", "correlation_id", "tool_name");


--
-- Name: ai_usage_events ai_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id");


--
-- Name: appointment_blocks appointment_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_blocks"
    ADD CONSTRAINT "appointment_blocks_pkey" PRIMARY KEY ("id");


--
-- Name: appointment_reminder_settings appointment_reminder_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminder_settings"
    ADD CONSTRAINT "appointment_reminder_settings_pkey" PRIMARY KEY ("clinic_id", "automation_key");


--
-- Name: appointment_reminders appointment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminders"
    ADD CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id");


--
-- Name: appointment_waitlist appointment_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_pkey" PRIMARY KEY ("id");


--
-- Name: appointments appointments_no_professional_overlap; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_professional_overlap" EXCLUDE USING "gist" ("professional_id" WITH =, "tstzrange"("start_time", "end_time", '[)'::"text") WITH &&) WHERE ((("professional_id" IS NOT NULL) AND ("source_of_truth" = 'aura'::"text") AND ("status" = ANY (ARRAY['scheduled'::"public"."appointment_status", 'confirmed'::"public"."appointment_status", 'in_progress'::"public"."appointment_status"]))));


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: class_entities class_entities_clinic_id_abbreviation_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."class_entities"
    ADD CONSTRAINT "class_entities_clinic_id_abbreviation_key" UNIQUE ("clinic_id", "abbreviation");


--
-- Name: class_entities class_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."class_entities"
    ADD CONSTRAINT "class_entities_pkey" PRIMARY KEY ("id");


--
-- Name: clinic_administrative_policies clinic_administrative_policies_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_administrative_policies"
    ADD CONSTRAINT "clinic_administrative_policies_clinic_id_key" UNIQUE ("clinic_id");


--
-- Name: clinic_administrative_policies clinic_administrative_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_administrative_policies"
    ADD CONSTRAINT "clinic_administrative_policies_pkey" PRIMARY KEY ("id");


--
-- Name: clinic_locations clinic_locations_clinic_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_locations"
    ADD CONSTRAINT "clinic_locations_clinic_id_id_key" UNIQUE ("clinic_id", "id");


--
-- Name: clinic_locations clinic_locations_clinic_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_locations"
    ADD CONSTRAINT "clinic_locations_clinic_id_name_key" UNIQUE ("clinic_id", "name");


--
-- Name: clinic_locations clinic_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_locations"
    ADD CONSTRAINT "clinic_locations_pkey" PRIMARY KEY ("id");


--
-- Name: clinic_settings clinic_settings_clinic_id_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_clinic_id_key_key" UNIQUE ("clinic_id", "key");


--
-- Name: clinic_settings clinic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id");


--
-- Name: clinics clinics_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_custom_domain_key" UNIQUE ("custom_domain");


--
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");


--
-- Name: clinics clinics_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_slug_key" UNIQUE ("slug");


--
-- Name: daily_agenda_summary_executions daily_agenda_summary_executio_clinic_id_professional_id_aut_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_executions"
    ADD CONSTRAINT "daily_agenda_summary_executio_clinic_id_professional_id_aut_key" UNIQUE ("clinic_id", "professional_id", "automation_key", "local_date");


--
-- Name: daily_agenda_summary_executions daily_agenda_summary_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_executions"
    ADD CONSTRAINT "daily_agenda_summary_executions_pkey" PRIMARY KEY ("id");


--
-- Name: daily_agenda_summary_settings daily_agenda_summary_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_settings"
    ADD CONSTRAINT "daily_agenda_summary_settings_pkey" PRIMARY KEY ("clinic_id");


--
-- Name: health_insurances health_insurances_id_clinic_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."health_insurances"
    ADD CONSTRAINT "health_insurances_id_clinic_unique" UNIQUE ("id", "clinic_id");


--
-- Name: health_insurances health_insurances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."health_insurances"
    ADD CONSTRAINT "health_insurances_pkey" PRIMARY KEY ("id");


--
-- Name: lead_interactions lead_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_pkey" PRIMARY KEY ("id");


--
-- Name: lead_stage_history lead_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_stage_history"
    ADD CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id");


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");


--
-- Name: professional_availability professional_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_availability"
    ADD CONSTRAINT "professional_availability_pkey" PRIMARY KEY ("id");


--
-- Name: professional_health_insurances professional_health_insurances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_health_insurances"
    ADD CONSTRAINT "professional_health_insurances_pkey" PRIMARY KEY ("id");


--
-- Name: professional_health_insurances professional_health_insurances_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_health_insurances"
    ADD CONSTRAINT "professional_health_insurances_unique" UNIQUE ("health_insurance_id", "professional_id");


--
-- Name: professional_locations professional_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_locations"
    ADD CONSTRAINT "professional_locations_pkey" PRIMARY KEY ("id");


--
-- Name: professional_locations professional_locations_professional_id_location_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_locations"
    ADD CONSTRAINT "professional_locations_professional_id_location_id_key" UNIQUE ("professional_id", "location_id");


--
-- Name: professional_settings professional_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_settings"
    ADD CONSTRAINT "professional_settings_pkey" PRIMARY KEY ("id");


--
-- Name: professional_settings professional_settings_professional_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_settings"
    ADD CONSTRAINT "professional_settings_professional_id_key" UNIQUE ("professional_id");


--
-- Name: professional_treatments professional_treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_treatments"
    ADD CONSTRAINT "professional_treatments_pkey" PRIMARY KEY ("id");


--
-- Name: professional_treatments professional_treatments_professional_id_treatment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_treatments"
    ADD CONSTRAINT "professional_treatments_professional_id_treatment_id_key" UNIQUE ("professional_id", "treatment_id");


--
-- Name: professionals professionals_clinic_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_clinic_id_user_id_key" UNIQUE ("clinic_id", "user_id");


--
-- Name: professionals professionals_id_clinic_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_id_clinic_unique" UNIQUE ("id", "clinic_id");


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");


--
-- Name: roles roles_clinic_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_clinic_id_name_key" UNIQUE ("clinic_id", "name");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_connection_professionals scheduling_connection_professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_connection_professionals"
    ADD CONSTRAINT "scheduling_connection_professionals_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_connection_professionals scheduling_connection_professionals_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_connection_professionals"
    ADD CONSTRAINT "scheduling_connection_professionals_unique" UNIQUE ("connection_id", "professional_id");


--
-- Name: scheduling_exceptions scheduling_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_exceptions"
    ADD CONSTRAINT "scheduling_exceptions_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_insurance_mappings scheduling_insurance_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_insurance_mappings"
    ADD CONSTRAINT "scheduling_insurance_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_location_mappings scheduling_location_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_location_mappings"
    ADD CONSTRAINT "scheduling_location_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_professional_mappings scheduling_professional_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_professional_mappings"
    ADD CONSTRAINT "scheduling_professional_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_provider_connections scheduling_provider_connections_id_clinic_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_connections"
    ADD CONSTRAINT "scheduling_provider_connections_id_clinic_unique" UNIQUE ("id", "clinic_id");


--
-- Name: scheduling_provider_connections scheduling_provider_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_connections"
    ADD CONSTRAINT "scheduling_provider_connections_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_provider_events scheduling_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_events"
    ADD CONSTRAINT "scheduling_provider_events_pkey" PRIMARY KEY ("id");


--
-- Name: scheduling_reconciliation_states scheduling_reconciliation_states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_reconciliation_states"
    ADD CONSTRAINT "scheduling_reconciliation_states_pkey" PRIMARY KEY ("connection_id");


--
-- Name: scheduling_service_mappings scheduling_service_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_service_mappings"
    ADD CONSTRAINT "scheduling_service_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: team_invitations team_invitations_clinic_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_clinic_id_email_key" UNIQUE ("clinic_id", "email");


--
-- Name: team_invitations team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id");


--
-- Name: treatment_categories treatment_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_pkey" PRIMARY KEY ("id");


--
-- Name: treatments treatments_id_clinic_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_id_clinic_unique" UNIQUE ("id", "clinic_id");


--
-- Name: treatments treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_pkey" PRIMARY KEY ("id");


--
-- Name: user_access_groups user_access_groups_clinic_id_user_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_access_groups"
    ADD CONSTRAINT "user_access_groups_clinic_id_user_id_group_id_key" UNIQUE ("clinic_id", "user_id", "group_id");


--
-- Name: user_access_groups user_access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_access_groups"
    ADD CONSTRAINT "user_access_groups_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_clinic_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_clinic_id_role_key" UNIQUE ("user_id", "clinic_id", "role");


--
-- Name: waitlist_agent_logs waitlist_agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_agent_logs"
    ADD CONSTRAINT "waitlist_agent_logs_pkey" PRIMARY KEY ("id");


--
-- Name: waitlist_match_events waitlist_match_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_match_events"
    ADD CONSTRAINT "waitlist_match_events_pkey" PRIMARY KEY ("id");


--
-- Name: waitlist_matching_settings waitlist_matching_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_matching_settings"
    ADD CONSTRAINT "waitlist_matching_settings_pkey" PRIMARY KEY ("clinic_id");


--
-- Name: waitlist_notifications waitlist_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_pkey" PRIMARY KEY ("id");


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_clinic_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_clinic_id_phone_key" UNIQUE ("clinic_id", "phone");


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_id_clinic_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_id_clinic_unique" UNIQUE ("id", "clinic_id");


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_pkey" PRIMARY KEY ("id");


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_messages"
    ADD CONSTRAINT "whatsapp_ai_messages_pkey" PRIMARY KEY ("id");


--
-- Name: whatsapp_ai_settings whatsapp_ai_settings_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_settings"
    ADD CONSTRAINT "whatsapp_ai_settings_clinic_id_key" UNIQUE ("clinic_id");


--
-- Name: whatsapp_ai_settings whatsapp_ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_settings"
    ADD CONSTRAINT "whatsapp_ai_settings_pkey" PRIMARY KEY ("id");


--
-- Name: whatsapp_ai_settings whatsapp_ai_settings_production_gate_dependencies; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whatsapp_ai_settings"
    ADD CONSTRAINT "whatsapp_ai_settings_production_gate_dependencies" CHECK ((((NOT "ai_read_tools_enabled") OR ("ai_engine_mode" = ANY (ARRAY['shadow'::"text", 'active'::"text"]))) AND ((NOT "ai_knowledge_enabled") OR (("ai_engine_mode" = 'active'::"text") AND "ai_read_tools_enabled" AND ("ai_read_tools_validated_at" IS NOT NULL) AND ("ai_knowledge_validated_at" IS NOT NULL))) AND ((NOT "ai_handoff_enabled") OR (("ai_engine_mode" = 'active'::"text") AND ("ai_handoff_validated_at" IS NOT NULL))) AND ((NOT "ai_mutation_tools_enabled") OR (("ai_engine_mode" = 'active'::"text") AND "ai_read_tools_enabled" AND ("ai_read_tools_validated_at" IS NOT NULL))))) NOT VALID;


--
-- Name: CONSTRAINT "whatsapp_ai_settings_production_gate_dependencies" ON "whatsapp_ai_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT "whatsapp_ai_settings_production_gate_dependencies" ON "public"."whatsapp_ai_settings" IS 'NOT VALID preserves legacy rows while enforcing safe gate combinations on new/updated settings.';


--
-- Name: whatsapp_connections whatsapp_connections_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_clinic_id_key" UNIQUE ("clinic_id");


--
-- Name: whatsapp_connections whatsapp_connections_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_phone_number_id_key" UNIQUE ("phone_number_id");


--
-- Name: whatsapp_connections whatsapp_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id");


--
-- Name: administrative_knowledge_entries_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "administrative_knowledge_entries_lookup" ON "public"."administrative_knowledge_entries" USING "btree" ("clinic_id", "status", "topic", "priority" DESC);


--
-- Name: administrative_knowledge_entries_patient_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "administrative_knowledge_entries_patient_lookup" ON "public"."administrative_knowledge_entries" USING "btree" ("clinic_id", "status", "patient_visible", "topic", "priority" DESC);


--
-- Name: administrative_knowledge_entries_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "administrative_knowledge_entries_scope" ON "public"."administrative_knowledge_entries" USING "btree" ("clinic_id", "scope", "location_id", "professional_id", "service_id", "insurance_id");


--
-- Name: ai_admin_action_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_admin_action_events_clinic_occurred" ON "public"."ai_admin_action_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_conversation_handoffs_assignee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_conversation_handoffs_assignee" ON "public"."ai_conversation_handoffs" USING "btree" ("clinic_id", "assigned_user_id", "status") WHERE ("assigned_user_id" IS NOT NULL);


--
-- Name: ai_conversation_handoffs_one_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ai_conversation_handoffs_one_active" ON "public"."ai_conversation_handoffs" USING "btree" ("conversation_id") WHERE ("status" = ANY (ARRAY['requested'::"text", 'queued'::"text", 'assigned'::"text", 'accepted'::"text"]));


--
-- Name: ai_conversation_handoffs_queue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_conversation_handoffs_queue" ON "public"."ai_conversation_handoffs" USING "btree" ("clinic_id", "status", "priority", "requested_at") WHERE ("status" = ANY (ARRAY['requested'::"text", 'queued'::"text", 'assigned'::"text", 'accepted'::"text"]));


--
-- Name: ai_handoff_events_clinic_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_handoff_events_clinic_time" ON "public"."ai_handoff_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_handoff_events_handoff_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_handoff_events_handoff_time" ON "public"."ai_handoff_events" USING "btree" ("handoff_id", "occurred_at");


--
-- Name: ai_knowledge_answer_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_knowledge_answer_events_clinic_occurred" ON "public"."ai_knowledge_answer_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_operational_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_operational_events_clinic_occurred" ON "public"."ai_operational_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_operational_events_clinic_type_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_operational_events_clinic_type_outcome" ON "public"."ai_operational_events" USING "btree" ("clinic_id", "event_type", "outcome", "occurred_at" DESC);


--
-- Name: ai_safety_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_safety_events_clinic_occurred" ON "public"."ai_safety_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_safety_events_conversation_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_safety_events_conversation_occurred" ON "public"."ai_safety_events" USING "btree" ("conversation_id", "occurred_at" DESC);


--
-- Name: ai_tool_execution_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_tool_execution_events_clinic_occurred" ON "public"."ai_tool_execution_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_tool_execution_events_conversation_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_tool_execution_events_conversation_occurred" ON "public"."ai_tool_execution_events" USING "btree" ("conversation_id", "occurred_at" DESC);


--
-- Name: ai_usage_events_clinic_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_usage_events_clinic_occurred" ON "public"."ai_usage_events" USING "btree" ("clinic_id", "occurred_at" DESC);


--
-- Name: ai_usage_events_clinic_request_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_usage_events_clinic_request_outcome" ON "public"."ai_usage_events" USING "btree" ("clinic_id", "request_type", "outcome", "occurred_at" DESC);


--
-- Name: ai_usage_events_conversation_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_usage_events_conversation_occurred" ON "public"."ai_usage_events" USING "btree" ("conversation_id", "occurred_at" DESC);


--
-- Name: ai_usage_events_correlation_request_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ai_usage_events_correlation_request_unique" ON "public"."ai_usage_events" USING "btree" ("clinic_id", "correlation_id", "request_type") WHERE ("request_type" = 'llm_response'::"text");


--
-- Name: appointment_blocks_clinic_location_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointment_blocks_clinic_location_start" ON "public"."appointment_blocks" USING "btree" ("clinic_id", "location_id", "start_at");


--
-- Name: appointment_blocks_interval; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointment_blocks_interval" ON "public"."appointment_blocks" USING "btree" ("clinic_id", "location_id", "professional_id", "start_at", "end_at");


--
-- Name: appointment_reminder_settings_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointment_reminder_settings_enabled" ON "public"."appointment_reminder_settings" USING "btree" ("clinic_id") WHERE "is_enabled";


--
-- Name: appointment_reminders_7d_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointment_reminders_7d_due" ON "public"."appointment_reminders" USING "btree" ("scheduled_for", "created_at") WHERE (("automation_key" = 'appointment_reminder_7d'::"text") AND ("status" = 'pending'::"public"."reminder_status"));


--
-- Name: appointment_reminders_automation_version_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "appointment_reminders_automation_version_unique" ON "public"."appointment_reminders" USING "btree" ("clinic_id", "automation_key", "appointment_id", "appointment_start_time", "channel") WHERE ("automation_key" IS NOT NULL);


--
-- Name: appointments_active_interval; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_active_interval" ON "public"."appointments" USING "btree" ("clinic_id", "professional_id", "start_time", "end_time") WHERE ("status" = ANY (ARRAY['scheduled'::"public"."appointment_status", 'confirmed'::"public"."appointment_status", 'in_progress'::"public"."appointment_status"]));


--
-- Name: appointments_clinic_location_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_clinic_location_start" ON "public"."appointments" USING "btree" ("clinic_id", "location_id", "start_time");


--
-- Name: appointments_clinic_provider_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_clinic_provider_start" ON "public"."appointments" USING "btree" ("clinic_id", "provider_type", "start_time");


--
-- Name: appointments_completed_history_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_completed_history_idx" ON "public"."appointments" USING "btree" ("clinic_id", "patient_id", "professional_id", "completed_at" DESC) WHERE (("status" = 'completed'::"public"."appointment_status") AND ("patient_id" IS NOT NULL) AND ("professional_id" IS NOT NULL));


--
-- Name: appointments_connection_external_identity_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "appointments_connection_external_identity_unique" ON "public"."appointments" USING "btree" ("connection_id", "external_appointment_id") WHERE ("external_appointment_id" IS NOT NULL);


--
-- Name: appointments_connection_sync_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_connection_sync_state" ON "public"."appointments" USING "btree" ("connection_id", "sync_state") WHERE ("connection_id" IS NOT NULL);


--
-- Name: appointments_external_stale_scan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_external_stale_scan" ON "public"."appointments" USING "btree" ("connection_id", "last_synced_at", "last_provider_seen_at") WHERE (("source_of_truth" = 'external_provider'::"text") AND (NOT "is_tombstone"));


--
-- Name: appointments_health_insurance_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "appointments_health_insurance_idx" ON "public"."appointments" USING "btree" ("clinic_id", "health_insurance_id") WHERE ("health_insurance_id" IS NOT NULL);


--
-- Name: clinic_locations_clinic_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "clinic_locations_clinic_active" ON "public"."clinic_locations" USING "btree" ("clinic_id", "active", "name");


--
-- Name: clinic_locations_one_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "clinic_locations_one_primary" ON "public"."clinic_locations" USING "btree" ("clinic_id") WHERE "is_primary";


--
-- Name: daily_agenda_summary_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "daily_agenda_summary_due" ON "public"."daily_agenda_summary_executions" USING "btree" ("scheduled_for", "created_at") WHERE (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"])) AND ("sent_at" IS NULL));


--
-- Name: health_insurances_clinic_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "health_insurances_clinic_name_unique" ON "public"."health_insurances" USING "btree" ("clinic_id", "lower"("btrim"("name")));


--
-- Name: health_insurances_clinic_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "health_insurances_clinic_status_idx" ON "public"."health_insurances" USING "btree" ("clinic_id", "status", "name");


--
-- Name: idx_access_group_permissions_clinic_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_access_group_permissions_clinic_id" ON "public"."access_group_permissions" USING "btree" ("clinic_id");


--
-- Name: idx_access_group_permissions_group_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_access_group_permissions_group_id" ON "public"."access_group_permissions" USING "btree" ("group_id");


--
-- Name: idx_access_groups_clinic_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_access_groups_clinic_id" ON "public"."access_groups" USING "btree" ("clinic_id");


--
-- Name: idx_agenda_job_executions_job_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agenda_job_executions_job_started" ON "public"."agenda_job_executions" USING "btree" ("job_name", "started_at" DESC);


--
-- Name: idx_appointment_blocks_clinic_professional_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointment_blocks_clinic_professional_start" ON "public"."appointment_blocks" USING "btree" ("clinic_id", "professional_id", "start_at");


--
-- Name: idx_appointment_reminders_appointment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointment_reminders_appointment" ON "public"."appointment_reminders" USING "btree" ("appointment_id", "channel");


--
-- Name: idx_appointment_reminders_clinic_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointment_reminders_clinic_status" ON "public"."appointment_reminders" USING "btree" ("clinic_id", "status", "scheduled_for");


--
-- Name: idx_appointments_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_clinic" ON "public"."appointments" USING "btree" ("clinic_id");


--
-- Name: idx_appointments_clinic_professional_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_clinic_professional_start" ON "public"."appointments" USING "btree" ("clinic_id", "professional_id", "start_time");


--
-- Name: idx_appointments_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_lead" ON "public"."appointments" USING "btree" ("lead_id");


--
-- Name: idx_appointments_patient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_patient" ON "public"."appointments" USING "btree" ("patient_id");


--
-- Name: idx_appointments_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_professional" ON "public"."appointments" USING "btree" ("professional_id");


--
-- Name: idx_appointments_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_time" ON "public"."appointments" USING "btree" ("clinic_id", "start_time");


--
-- Name: idx_appointments_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_appointments_type" ON "public"."appointments" USING "btree" ("clinic_id", "appointment_type");


--
-- Name: idx_audit_logs_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_clinic" ON "public"."audit_logs" USING "btree" ("clinic_id");


--
-- Name: idx_lead_interactions_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_interactions_lead" ON "public"."lead_interactions" USING "btree" ("lead_id", "performed_at" DESC);


--
-- Name: idx_lead_stage_history_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_stage_history_lead" ON "public"."lead_stage_history" USING "btree" ("lead_id", "changed_at" DESC);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_assigned_to" ON "public"."leads" USING "btree" ("assigned_to");


--
-- Name: idx_leads_clinic_cpf; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_clinic_cpf" ON "public"."leads" USING "btree" ("clinic_id", "cpf");


--
-- Name: idx_leads_clinic_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_clinic_phone" ON "public"."leads" USING "btree" ("clinic_id", "phone");


--
-- Name: idx_leads_clinic_stage; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_clinic_stage" ON "public"."leads" USING "btree" ("clinic_id", "kanban_stage");


--
-- Name: idx_leads_next_action_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_next_action_at" ON "public"."leads" USING "btree" ("clinic_id", "next_action_at");


--
-- Name: idx_leads_priority_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_priority_level" ON "public"."leads" USING "btree" ("clinic_id", "priority_level");


--
-- Name: idx_patients_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_patients_clinic" ON "public"."patients" USING "btree" ("clinic_id");


--
-- Name: idx_patients_cpf; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_patients_cpf" ON "public"."patients" USING "btree" ("clinic_id", "cpf");


--
-- Name: idx_professional_availability_clinic_professional_day; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_professional_availability_clinic_professional_day" ON "public"."professional_availability" USING "btree" ("clinic_id", "professional_id", "day_of_week");


--
-- Name: idx_professionals_clinic_cpf; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_professionals_clinic_cpf" ON "public"."professionals" USING "btree" ("clinic_id", "cpf") WHERE ("cpf" IS NOT NULL);


--
-- Name: idx_professionals_clinic_status_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_professionals_clinic_status_name" ON "public"."professionals" USING "btree" ("clinic_id", "status", "full_name");


--
-- Name: idx_professionals_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_professionals_user_id" ON "public"."professionals" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: idx_treatments_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_clinic" ON "public"."treatments" USING "btree" ("clinic_id");


--
-- Name: idx_user_access_groups_clinic_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_access_groups_clinic_user" ON "public"."user_access_groups" USING "btree" ("clinic_id", "user_id");


--
-- Name: idx_user_roles_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_roles_clinic" ON "public"."user_roles" USING "btree" ("clinic_id");


--
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_roles_user" ON "public"."user_roles" USING "btree" ("user_id");


--
-- Name: idx_user_roles_user_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_roles_user_clinic" ON "public"."user_roles" USING "btree" ("user_id", "clinic_id");


--
-- Name: idx_waitlist_clinic_professional_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_clinic_professional_status" ON "public"."appointment_waitlist" USING "btree" ("clinic_id", "preferred_professional_id", "status");


--
-- Name: idx_waitlist_clinic_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_clinic_status" ON "public"."appointment_waitlist" USING "btree" ("clinic_id", "status");


--
-- Name: idx_waitlist_logs_clinic_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_logs_clinic_started" ON "public"."waitlist_agent_logs" USING "btree" ("clinic_id", "started_at" DESC);


--
-- Name: idx_waitlist_notifications_waitlist; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_notifications_waitlist" ON "public"."waitlist_notifications" USING "btree" ("waitlist_id", "notification_sent_at" DESC);


--
-- Name: idx_waitlist_priority_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_priority_created" ON "public"."appointment_waitlist" USING "btree" ("priority", "created_at");


--
-- Name: idx_waitlist_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_professional" ON "public"."appointment_waitlist" USING "btree" ("preferred_professional_id");


--
-- Name: idx_waitlist_window; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_waitlist_window" ON "public"."appointment_waitlist" USING "btree" ("window_start", "window_end");


--
-- Name: idx_whatsapp_ai_conversations_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_conversations_clinic" ON "public"."whatsapp_ai_conversations" USING "btree" ("clinic_id", "last_message_at" DESC);


--
-- Name: idx_whatsapp_ai_conversations_clinic_status_activity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_conversations_clinic_status_activity" ON "public"."whatsapp_ai_conversations" USING "btree" ("clinic_id", "status", "last_message_at" DESC);


--
-- Name: idx_whatsapp_ai_conversations_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_conversations_lead" ON "public"."whatsapp_ai_conversations" USING "btree" ("lead_id");


--
-- Name: idx_whatsapp_ai_messages_clinic_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_messages_clinic_created" ON "public"."whatsapp_ai_messages" USING "btree" ("clinic_id", "created_at" DESC);


--
-- Name: idx_whatsapp_ai_messages_clinic_direction_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_messages_clinic_direction_created" ON "public"."whatsapp_ai_messages" USING "btree" ("clinic_id", "direction", "created_at" DESC);


--
-- Name: idx_whatsapp_ai_messages_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_ai_messages_conversation" ON "public"."whatsapp_ai_messages" USING "btree" ("conversation_id", "created_at" DESC);


--
-- Name: idx_whatsapp_ai_messages_provider_any; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_whatsapp_ai_messages_provider_any" ON "public"."whatsapp_ai_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);


--
-- Name: INDEX "idx_whatsapp_ai_messages_provider_any"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."idx_whatsapp_ai_messages_provider_any" IS 'Prevents duplicate processing when Meta retries an inbound or status event.';


--
-- Name: idx_whatsapp_ai_messages_provider_inbound; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_whatsapp_ai_messages_provider_inbound" ON "public"."whatsapp_ai_messages" USING "btree" ("provider_message_id") WHERE (("provider_message_id" IS NOT NULL) AND ("direction" = 'inbound'::"text"));


--
-- Name: idx_whatsapp_connections_clinic_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_connections_clinic_status" ON "public"."whatsapp_connections" USING "btree" ("clinic_id", "status");


--
-- Name: idx_whatsapp_connections_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whatsapp_connections_phone" ON "public"."whatsapp_connections" USING "btree" ("phone_number_id") WHERE ("status" = 'connected'::"text");


--
-- Name: professional_availability_clinic_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_availability_clinic_location" ON "public"."professional_availability" USING "btree" ("clinic_id", "location_id", "professional_id");


--
-- Name: professional_availability_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_availability_lookup" ON "public"."professional_availability" USING "btree" ("clinic_id", "location_id", "professional_id", "day_of_week", "valid_from", "valid_until") WHERE "is_active";


--
-- Name: professional_health_insurances_clinic_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_health_insurances_clinic_idx" ON "public"."professional_health_insurances" USING "btree" ("clinic_id");


--
-- Name: professional_health_insurances_insurance_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_health_insurances_insurance_idx" ON "public"."professional_health_insurances" USING "btree" ("health_insurance_id", "status");


--
-- Name: professional_health_insurances_professional_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_health_insurances_professional_idx" ON "public"."professional_health_insurances" USING "btree" ("professional_id", "status");


--
-- Name: professional_locations_clinic_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_locations_clinic_location" ON "public"."professional_locations" USING "btree" ("clinic_id", "location_id", "active");


--
-- Name: professional_locations_clinic_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_locations_clinic_professional" ON "public"."professional_locations" USING "btree" ("clinic_id", "professional_id", "active");


--
-- Name: professional_settings_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_settings_clinic" ON "public"."professional_settings" USING "btree" ("clinic_id", "professional_id");


--
-- Name: professional_treatments_clinic_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "professional_treatments_clinic_professional" ON "public"."professional_treatments" USING "btree" ("clinic_id", "professional_id", "status");


--
-- Name: scheduling_connection_professionals_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_connection_professionals_clinic" ON "public"."scheduling_connection_professionals" USING "btree" ("clinic_id", "professional_id", "is_active");


--
-- Name: scheduling_connection_professionals_connection; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_connection_professionals_connection" ON "public"."scheduling_connection_professionals" USING "btree" ("connection_id", "is_active");


--
-- Name: scheduling_connection_professionals_one_active_override; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_connection_professionals_one_active_override" ON "public"."scheduling_connection_professionals" USING "btree" ("clinic_id", "professional_id") WHERE "is_active";


--
-- Name: scheduling_exceptions_location_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_exceptions_location_date" ON "public"."scheduling_exceptions" USING "btree" ("clinic_id", "location_id", "exception_date") WHERE ("professional_id" IS NULL);


--
-- Name: scheduling_exceptions_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_exceptions_lookup" ON "public"."scheduling_exceptions" USING "btree" ("clinic_id", "location_id", "exception_date", "professional_id");


--
-- Name: scheduling_exceptions_professional_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_exceptions_professional_date" ON "public"."scheduling_exceptions" USING "btree" ("clinic_id", "location_id", "professional_id", "exception_date") WHERE ("professional_id" IS NOT NULL);


--
-- Name: scheduling_insurance_mappings_aura_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_insurance_mappings_aura_active_unique" ON "public"."scheduling_insurance_mappings" USING "btree" ("connection_id", "health_insurance_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_insurance_mappings_clinic_connection_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_insurance_mappings_clinic_connection_status" ON "public"."scheduling_insurance_mappings" USING "btree" ("clinic_id", "connection_id", "status");


--
-- Name: scheduling_insurance_mappings_external_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_insurance_mappings_external_active_unique" ON "public"."scheduling_insurance_mappings" USING "btree" ("connection_id", "external_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_location_mappings_aura_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_location_mappings_aura_active_unique" ON "public"."scheduling_location_mappings" USING "btree" ("connection_id", "location_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_location_mappings_clinic_connection_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_location_mappings_clinic_connection_status" ON "public"."scheduling_location_mappings" USING "btree" ("clinic_id", "connection_id", "status");


--
-- Name: scheduling_location_mappings_external_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_location_mappings_external_active_unique" ON "public"."scheduling_location_mappings" USING "btree" ("connection_id", "external_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_professional_mappings_aura_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_professional_mappings_aura_active_unique" ON "public"."scheduling_professional_mappings" USING "btree" ("connection_id", "professional_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_professional_mappings_clinic_connection_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_professional_mappings_clinic_connection_status" ON "public"."scheduling_professional_mappings" USING "btree" ("clinic_id", "connection_id", "status");


--
-- Name: scheduling_professional_mappings_external_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_professional_mappings_external_active_unique" ON "public"."scheduling_professional_mappings" USING "btree" ("connection_id", "external_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_provider_connections_clinic_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_provider_connections_clinic_provider" ON "public"."scheduling_provider_connections" USING "btree" ("clinic_id", "provider_type");


--
-- Name: scheduling_provider_connections_clinic_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_provider_connections_clinic_status" ON "public"."scheduling_provider_connections" USING "btree" ("clinic_id", "status");


--
-- Name: scheduling_provider_connections_one_default_per_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_provider_connections_one_default_per_clinic" ON "public"."scheduling_provider_connections" USING "btree" ("clinic_id") WHERE "is_default";


--
-- Name: scheduling_provider_connections_one_internal_per_clinic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_provider_connections_one_internal_per_clinic" ON "public"."scheduling_provider_connections" USING "btree" ("clinic_id") WHERE ("provider_type" = 'internal'::"text");


--
-- Name: scheduling_provider_events_external_appointment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_provider_events_external_appointment" ON "public"."scheduling_provider_events" USING "btree" ("connection_id", "external_appointment_id") WHERE ("external_appointment_id" IS NOT NULL);


--
-- Name: scheduling_provider_events_external_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_provider_events_external_id_unique" ON "public"."scheduling_provider_events" USING "btree" ("connection_id", "external_event_id") WHERE ("external_event_id" IS NOT NULL);


--
-- Name: scheduling_provider_events_payload_hash_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_provider_events_payload_hash_unique" ON "public"."scheduling_provider_events" USING "btree" ("connection_id", "payload_hash") WHERE (("external_event_id" IS NULL) AND ("payload_hash" IS NOT NULL));


--
-- Name: scheduling_provider_events_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_provider_events_pending" ON "public"."scheduling_provider_events" USING "btree" ("connection_id", "processing_status", "received_at");


--
-- Name: scheduling_reconciliation_states_clinic_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_reconciliation_states_clinic_status" ON "public"."scheduling_reconciliation_states" USING "btree" ("clinic_id", "status");


--
-- Name: scheduling_reconciliation_states_error_scan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_reconciliation_states_error_scan" ON "public"."scheduling_reconciliation_states" USING "btree" ("status", "last_error_at") WHERE ("status" = 'error'::"text");


--
-- Name: scheduling_service_mappings_aura_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_service_mappings_aura_active_unique" ON "public"."scheduling_service_mappings" USING "btree" ("connection_id", "treatment_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: scheduling_service_mappings_clinic_connection_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "scheduling_service_mappings_clinic_connection_status" ON "public"."scheduling_service_mappings" USING "btree" ("clinic_id", "connection_id", "status");


--
-- Name: scheduling_service_mappings_external_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "scheduling_service_mappings_external_active_unique" ON "public"."scheduling_service_mappings" USING "btree" ("connection_id", "external_id") WHERE ("status" <> 'disabled'::"text");


--
-- Name: waitlist_match_events_pending_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "waitlist_match_events_pending_idx" ON "public"."waitlist_match_events" USING "btree" ("clinic_id", "created_at") WHERE ("processed_at" IS NULL);


--
-- Name: waitlist_no_retry_duplicate_offer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "waitlist_no_retry_duplicate_offer" ON "public"."waitlist_notifications" USING "btree" ("waitlist_id", "location_id", "matched_professional_id", "matched_slot_start", "matched_slot_end");


--
-- Name: waitlist_offer_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "waitlist_offer_expiry_idx" ON "public"."waitlist_notifications" USING "btree" ("expires_at") WHERE ("offer_status" = 'offered'::"text");


--
-- Name: waitlist_one_active_offer_per_entry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "waitlist_one_active_offer_per_entry" ON "public"."waitlist_notifications" USING "btree" ("waitlist_id") WHERE ("offer_status" = ANY (ARRAY['offered'::"text", 'accepted'::"text"]));


--
-- Name: waitlist_one_active_offer_per_slot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "waitlist_one_active_offer_per_slot" ON "public"."waitlist_notifications" USING "btree" ("clinic_id", "location_id", "matched_professional_id", "matched_slot_start", "matched_slot_end") WHERE ("offer_status" = ANY (ARRAY['offered'::"text", 'accepted'::"text"]));


--
-- Name: patients audit_patients; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_patients" AFTER INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_connection_professionals audit_scheduling_connection_professionals; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_connection_professionals" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_connection_professionals" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_insurance_mappings audit_scheduling_insurance_mappings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_insurance_mappings" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_insurance_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_location_mappings audit_scheduling_location_mappings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_location_mappings" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_location_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_professional_mappings audit_scheduling_professional_mappings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_professional_mappings" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_professional_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_provider_connections audit_scheduling_provider_connections; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_provider_connections" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: scheduling_service_mappings audit_scheduling_service_mappings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_scheduling_service_mappings" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_service_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();


--
-- Name: whatsapp_ai_settings audit_whatsapp_ai_feature_gates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "audit_whatsapp_ai_feature_gates" AFTER INSERT OR UPDATE OF "is_enabled", "ai_engine_mode", "ai_read_tools_enabled", "ai_read_tools_validated_at", "ai_mutation_tools_enabled", "ai_knowledge_enabled", "ai_knowledge_validated_at", "ai_handoff_enabled", "ai_handoff_validated_at" ON "public"."whatsapp_ai_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_ai_feature_gate_change"();


--
-- Name: administrative_knowledge_entries bump_administrative_knowledge_revision; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "bump_administrative_knowledge_revision" BEFORE UPDATE ON "public"."administrative_knowledge_entries" FOR EACH ROW EXECUTE FUNCTION "public"."bump_administrative_knowledge_revision"();


--
-- Name: appointments cancel_stale_appointment_reminders; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "cancel_stale_appointment_reminders" AFTER UPDATE OF "start_time", "status", "is_tombstone" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."cancel_stale_appointment_reminders"();


--
-- Name: clinics create_internal_scheduling_connection_after_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "create_internal_scheduling_connection_after_clinic" AFTER INSERT ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."create_internal_scheduling_connection_for_clinic"();


--
-- Name: clinics create_primary_location_after_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "create_primary_location_after_clinic" AFTER INSERT ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."create_primary_location_for_clinic"();


--
-- Name: professionals create_settings_after_professional; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "create_settings_after_professional" AFTER INSERT ON "public"."professionals" FOR EACH ROW EXECUTE FUNCTION "public"."create_settings_for_professional"();


--
-- Name: appointments enforce_appointment_professional_location; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_appointment_professional_location" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id", "location_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_serves_location"();


--
-- Name: appointments enforce_appointments_location_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_appointments_location_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_clinic"('location_id');


--
-- Name: appointments enforce_appointments_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_appointments_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: professional_availability enforce_availability_location_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_availability_location_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id" ON "public"."professional_availability" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_clinic"('location_id');


--
-- Name: professional_availability enforce_availability_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_availability_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."professional_availability" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: professional_availability enforce_availability_professional_location; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_availability_professional_location" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id", "location_id" ON "public"."professional_availability" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_serves_location"();


--
-- Name: appointment_blocks enforce_blocks_location_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_blocks_location_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id" ON "public"."appointment_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_clinic"('location_id');


--
-- Name: appointment_blocks enforce_blocks_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_blocks_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."appointment_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: professional_health_insurances enforce_professional_insurance_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_insurance_tenant" BEFORE INSERT OR UPDATE OF "clinic_id", "health_insurance_id" ON "public"."professional_health_insurances" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_rule_tenant"();


--
-- Name: professional_locations enforce_professional_locations_location_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_locations_location_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id" ON "public"."professional_locations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_clinic"('location_id');


--
-- Name: professional_locations enforce_professional_locations_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_locations_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."professional_locations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: professional_settings enforce_professional_settings_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_settings_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."professional_settings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: professional_treatments enforce_professional_treatment_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_treatment_tenant" BEFORE INSERT OR UPDATE OF "clinic_id", "treatment_id" ON "public"."professional_treatments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_rule_tenant"();


--
-- Name: professional_treatments enforce_professional_treatments_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_professional_treatments_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "professional_id" ON "public"."professional_treatments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('professional_id');


--
-- Name: scheduling_exceptions enforce_schedule_exception_professional_location; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_schedule_exception_professional_location" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id", "professional_id" ON "public"."scheduling_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_serves_location"();


--
-- Name: scheduling_service_mappings enforce_scheduling_service_mapping_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_scheduling_service_mapping_tenant" BEFORE INSERT OR UPDATE OF "clinic_id", "treatment_id" ON "public"."scheduling_service_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_scheduling_service_mapping_tenant"();


--
-- Name: waitlist_notifications enforce_waitlist_notification_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_waitlist_notification_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "matched_professional_id" ON "public"."waitlist_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('matched_professional_id');


--
-- Name: appointment_waitlist enforce_waitlist_professional_clinic; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enforce_waitlist_professional_clinic" BEFORE INSERT OR UPDATE OF "clinic_id", "preferred_professional_id" ON "public"."appointment_waitlist" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_agenda_professional_clinic"('preferred_professional_id');


--
-- Name: appointment_waitlist invalidate_waitlist_active_offer; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "invalidate_waitlist_active_offer" AFTER UPDATE OF "status" ON "public"."appointment_waitlist" FOR EACH ROW EXECUTE FUNCTION "public"."invalidate_waitlist_active_offer"();


--
-- Name: professional_availability prevent_professional_availability_overlap; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "prevent_professional_availability_overlap" BEFORE INSERT OR UPDATE OF "clinic_id", "location_id", "professional_id", "day_of_week", "start_time", "end_time", "valid_from", "valid_until", "is_active" ON "public"."professional_availability" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_professional_availability_overlap"();


--
-- Name: appointments record_waitlist_appointment_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_waitlist_appointment_event" AFTER UPDATE OF "status", "start_time" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."record_waitlist_appointment_event"();


--
-- Name: appointment_blocks record_waitlist_block_removed_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_waitlist_block_removed_event" AFTER DELETE ON "public"."appointment_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."record_waitlist_block_removed_event"();


--
-- Name: scheduling_exceptions record_waitlist_exception_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_waitlist_exception_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."scheduling_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."record_waitlist_exception_event"();


--
-- Name: clinic_locations record_waitlist_location_schedule_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_waitlist_location_schedule_event" AFTER UPDATE OF "opening_hours", "active" ON "public"."clinic_locations" FOR EACH ROW WHEN ((("new"."opening_hours" IS DISTINCT FROM "old"."opening_hours") OR ("new"."active" IS DISTINCT FROM "old"."active"))) EXECUTE FUNCTION "public"."record_waitlist_location_schedule_event"();


--
-- Name: professional_availability record_waitlist_schedule_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "record_waitlist_schedule_event" AFTER INSERT OR DELETE OR UPDATE ON "public"."professional_availability" FOR EACH ROW EXECUTE FUNCTION "public"."record_waitlist_schedule_event"();


--
-- Name: clinics seed_default_class_entities_after_clinic_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "seed_default_class_entities_after_clinic_insert" AFTER INSERT ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."seed_default_class_entities_for_clinic"();


--
-- Name: clinics seed_default_health_insurances_after_clinic_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "seed_default_health_insurances_after_clinic_insert" AFTER INSERT ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."seed_default_health_insurances_for_clinic"();


--
-- Name: lead_interactions trg_lead_interactions_touch_lead; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_lead_interactions_touch_lead" AFTER INSERT ON "public"."lead_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lead_interaction_timestamp"();


--
-- Name: leads trg_leads_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."touch_lead_updated_at"();


--
-- Name: leads trg_track_lead_stage_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_track_lead_stage_change" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."track_lead_stage_change"();


--
-- Name: access_group_permissions update_access_group_permissions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_access_group_permissions_updated_at" BEFORE UPDATE ON "public"."access_group_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: access_groups update_access_groups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_access_groups_updated_at" BEFORE UPDATE ON "public"."access_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ai_conversation_handoffs update_ai_conversation_handoffs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_ai_conversation_handoffs_updated_at" BEFORE UPDATE ON "public"."ai_conversation_handoffs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: appointment_waitlist update_appointment_waitlist_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_appointment_waitlist_updated_at" BEFORE UPDATE ON "public"."appointment_waitlist" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: appointments update_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: class_entities update_class_entities_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_class_entities_updated_at" BEFORE UPDATE ON "public"."class_entities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clinic_administrative_policies update_clinic_administrative_policies_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_clinic_administrative_policies_updated_at" BEFORE UPDATE ON "public"."clinic_administrative_policies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clinic_locations update_clinic_locations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_clinic_locations_updated_at" BEFORE UPDATE ON "public"."clinic_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clinics update_clinics_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_clinics_updated_at" BEFORE UPDATE ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: daily_agenda_summary_executions update_daily_agenda_summary_executions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_daily_agenda_summary_executions_updated_at" BEFORE UPDATE ON "public"."daily_agenda_summary_executions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: health_insurances update_health_insurances_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_health_insurances_updated_at" BEFORE UPDATE ON "public"."health_insurances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: patients update_patients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_patients_updated_at" BEFORE UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: professional_health_insurances update_professional_health_insurances_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_professional_health_insurances_updated_at" BEFORE UPDATE ON "public"."professional_health_insurances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: professional_locations update_professional_locations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_professional_locations_updated_at" BEFORE UPDATE ON "public"."professional_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: professional_settings update_professional_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_professional_settings_updated_at" BEFORE UPDATE ON "public"."professional_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: professional_treatments update_professional_treatments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_professional_treatments_updated_at" BEFORE UPDATE ON "public"."professional_treatments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: professionals update_professionals_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_professionals_updated_at" BEFORE UPDATE ON "public"."professionals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: roles update_roles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_roles_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_connection_professionals update_scheduling_connection_professionals_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_connection_professionals_updated_at" BEFORE UPDATE ON "public"."scheduling_connection_professionals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_exceptions update_scheduling_exceptions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_exceptions_updated_at" BEFORE UPDATE ON "public"."scheduling_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_insurance_mappings update_scheduling_insurance_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_insurance_mappings_updated_at" BEFORE UPDATE ON "public"."scheduling_insurance_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_location_mappings update_scheduling_location_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_location_mappings_updated_at" BEFORE UPDATE ON "public"."scheduling_location_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_professional_mappings update_scheduling_professional_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_professional_mappings_updated_at" BEFORE UPDATE ON "public"."scheduling_professional_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_provider_connections update_scheduling_provider_connections_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_provider_connections_updated_at" BEFORE UPDATE ON "public"."scheduling_provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_provider_events update_scheduling_provider_events_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_provider_events_updated_at" BEFORE UPDATE ON "public"."scheduling_provider_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_reconciliation_states update_scheduling_reconciliation_states_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_reconciliation_states_updated_at" BEFORE UPDATE ON "public"."scheduling_reconciliation_states" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scheduling_service_mappings update_scheduling_service_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scheduling_service_mappings_updated_at" BEFORE UPDATE ON "public"."scheduling_service_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: team_invitations update_team_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_team_invitations_updated_at" BEFORE UPDATE ON "public"."team_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: treatments update_treatments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_treatments_updated_at" BEFORE UPDATE ON "public"."treatments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_access_groups update_user_access_groups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_user_access_groups_updated_at" BEFORE UPDATE ON "public"."user_access_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_roles update_user_roles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: waitlist_matching_settings update_waitlist_matching_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_waitlist_matching_settings_updated_at" BEFORE UPDATE ON "public"."waitlist_matching_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: whatsapp_ai_conversations update_whatsapp_ai_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_whatsapp_ai_conversations_updated_at" BEFORE UPDATE ON "public"."whatsapp_ai_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: whatsapp_ai_settings update_whatsapp_ai_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_whatsapp_ai_settings_updated_at" BEFORE UPDATE ON "public"."whatsapp_ai_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: whatsapp_connections update_whatsapp_connections_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_whatsapp_connections_updated_at" BEFORE UPDATE ON "public"."whatsapp_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: appointments validate_appointment_provider_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_appointment_provider_identity" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_appointment_provider_identity"();


--
-- Name: appointment_reminder_settings validate_appointment_reminder_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_appointment_reminder_settings" BEFORE INSERT OR UPDATE ON "public"."appointment_reminder_settings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_appointment_reminder_settings"();


--
-- Name: daily_agenda_summary_settings validate_daily_agenda_summary_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_daily_agenda_summary_settings" BEFORE INSERT OR UPDATE ON "public"."daily_agenda_summary_settings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_daily_agenda_summary_settings"();


--
-- Name: clinic_locations validate_location_schedule_configuration; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_location_schedule_configuration" BEFORE INSERT OR UPDATE OF "timezone", "opening_hours" ON "public"."clinic_locations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_location_schedule_configuration"();


--
-- Name: scheduling_provider_events validate_scheduling_provider_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validate_scheduling_provider_event" BEFORE INSERT OR UPDATE OF "clinic_id", "connection_id", "provider_type" ON "public"."scheduling_provider_events" FOR EACH ROW EXECUTE FUNCTION "public"."validate_scheduling_provider_event"();


--
-- Name: access_group_permissions access_group_permissions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_group_permissions"
    ADD CONSTRAINT "access_group_permissions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: access_group_permissions access_group_permissions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_group_permissions"
    ADD CONSTRAINT "access_group_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."access_groups"("id") ON DELETE CASCADE;


--
-- Name: access_groups access_groups_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."access_groups"
    ADD CONSTRAINT "access_groups_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_insurance_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_insurance_clinic_fkey" FOREIGN KEY ("insurance_id", "clinic_id") REFERENCES "public"."health_insurances"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_location_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_location_clinic_fkey" FOREIGN KEY ("location_id", "clinic_id") REFERENCES "public"."clinic_locations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_professional_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_professional_clinic_fkey" FOREIGN KEY ("professional_id", "clinic_id") REFERENCES "public"."professionals"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_service_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_service_clinic_fkey" FOREIGN KEY ("service_id", "clinic_id") REFERENCES "public"."treatments"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: administrative_knowledge_entries administrative_knowledge_entries_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."administrative_knowledge_entries"
    ADD CONSTRAINT "administrative_knowledge_entries_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: agenda_job_executions agenda_job_executions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agenda_job_executions"
    ADD CONSTRAINT "agenda_job_executions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_admin_action_events ai_admin_action_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_admin_action_events"
    ADD CONSTRAINT "ai_admin_action_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_admin_action_events ai_admin_action_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_admin_action_events"
    ADD CONSTRAINT "ai_admin_action_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_conversation_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_conversation_tenant_fk" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_conversation_handoffs ai_conversation_handoffs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_conversation_handoffs"
    ADD CONSTRAINT "ai_conversation_handoffs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_handoff_events ai_handoff_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_handoff_events"
    ADD CONSTRAINT "ai_handoff_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ai_handoff_events ai_handoff_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_handoff_events"
    ADD CONSTRAINT "ai_handoff_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_handoff_events ai_handoff_events_conversation_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_handoff_events"
    ADD CONSTRAINT "ai_handoff_events_conversation_tenant_fk" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_handoff_events ai_handoff_events_handoff_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_handoff_events"
    ADD CONSTRAINT "ai_handoff_events_handoff_tenant_fk" FOREIGN KEY ("handoff_id", "clinic_id") REFERENCES "public"."ai_conversation_handoffs"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_knowledge_answer_events ai_knowledge_answer_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_knowledge_answer_events"
    ADD CONSTRAINT "ai_knowledge_answer_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_knowledge_answer_events ai_knowledge_answer_events_conversation_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_knowledge_answer_events"
    ADD CONSTRAINT "ai_knowledge_answer_events_conversation_clinic_fkey" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_operational_events ai_operational_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_operational_events"
    ADD CONSTRAINT "ai_operational_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_operational_events ai_operational_events_conversation_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_operational_events"
    ADD CONSTRAINT "ai_operational_events_conversation_tenant_fk" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_safety_events ai_safety_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_safety_events"
    ADD CONSTRAINT "ai_safety_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_safety_events ai_safety_events_conversation_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_safety_events"
    ADD CONSTRAINT "ai_safety_events_conversation_clinic_fkey" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_tool_execution_events ai_tool_execution_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_execution_events"
    ADD CONSTRAINT "ai_tool_execution_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_tool_execution_events ai_tool_execution_events_conversation_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_execution_events"
    ADD CONSTRAINT "ai_tool_execution_events_conversation_clinic_fkey" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_tool_mutation_claims ai_tool_mutation_claims_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_mutation_claims"
    ADD CONSTRAINT "ai_tool_mutation_claims_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_tool_mutation_claims ai_tool_mutation_claims_conversation_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_tool_mutation_claims"
    ADD CONSTRAINT "ai_tool_mutation_claims_conversation_clinic_fkey" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: ai_usage_events ai_usage_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: ai_usage_events ai_usage_events_conversation_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_conversation_clinic_fkey" FOREIGN KEY ("conversation_id", "clinic_id") REFERENCES "public"."whatsapp_ai_conversations"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: appointment_blocks appointment_blocks_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_blocks"
    ADD CONSTRAINT "appointment_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: appointment_blocks appointment_blocks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_blocks"
    ADD CONSTRAINT "appointment_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: appointment_blocks appointment_blocks_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_blocks"
    ADD CONSTRAINT "appointment_blocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE CASCADE;


--
-- Name: appointment_blocks appointment_blocks_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_blocks"
    ADD CONSTRAINT "appointment_blocks_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: appointment_reminder_settings appointment_reminder_7d_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminder_settings"
    ADD CONSTRAINT "appointment_reminder_7d_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: appointment_reminder_settings appointment_reminder_7d_settings_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminder_settings"
    ADD CONSTRAINT "appointment_reminder_7d_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE SET NULL;


--
-- Name: appointment_reminder_settings appointment_reminder_7d_settings_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminder_settings"
    ADD CONSTRAINT "appointment_reminder_7d_settings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE SET NULL;


--
-- Name: appointment_reminder_settings appointment_reminder_7d_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminder_settings"
    ADD CONSTRAINT "appointment_reminder_7d_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: appointment_reminders appointment_reminders_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminders"
    ADD CONSTRAINT "appointment_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;


--
-- Name: appointment_reminders appointment_reminders_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_reminders"
    ADD CONSTRAINT "appointment_reminders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: appointment_waitlist appointment_waitlist_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: appointment_waitlist appointment_waitlist_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_health_insurance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_health_insurance_id_fkey" FOREIGN KEY ("health_insurance_id") REFERENCES "public"."health_insurances"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_preferred_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_preferred_professional_id_fkey" FOREIGN KEY ("preferred_professional_id") REFERENCES "public"."professionals"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_resulting_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_resulting_appointment_id_fkey" FOREIGN KEY ("resulting_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;


--
-- Name: appointment_waitlist appointment_waitlist_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: appointments appointments_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: appointments appointments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: appointments appointments_health_insurance_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_health_insurance_clinic_fkey" FOREIGN KEY ("health_insurance_id", "clinic_id") REFERENCES "public"."health_insurances"("id", "clinic_id");


--
-- Name: appointments appointments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE RESTRICT;


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;


--
-- Name: appointments appointments_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE RESTRICT;


--
-- Name: appointments appointments_rescheduled_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_rescheduled_from_fkey" FOREIGN KEY ("rescheduled_from") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_rescheduled_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_rescheduled_to_fkey" FOREIGN KEY ("rescheduled_to") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;


--
-- Name: appointments appointments_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id");


--
-- Name: audit_logs audit_logs_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: class_entities class_entities_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."class_entities"
    ADD CONSTRAINT "class_entities_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: clinic_administrative_policies clinic_administrative_policies_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_administrative_policies"
    ADD CONSTRAINT "clinic_administrative_policies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: clinic_locations clinic_locations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_locations"
    ADD CONSTRAINT "clinic_locations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: clinic_settings clinic_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");


--
-- Name: daily_agenda_summary_executions daily_agenda_summary_executions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_executions"
    ADD CONSTRAINT "daily_agenda_summary_executions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: daily_agenda_summary_executions daily_agenda_summary_executions_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_executions"
    ADD CONSTRAINT "daily_agenda_summary_executions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: daily_agenda_summary_settings daily_agenda_summary_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_settings"
    ADD CONSTRAINT "daily_agenda_summary_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: daily_agenda_summary_settings daily_agenda_summary_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_agenda_summary_settings"
    ADD CONSTRAINT "daily_agenda_summary_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: health_insurances health_insurances_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."health_insurances"
    ADD CONSTRAINT "health_insurances_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: lead_interactions lead_interactions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: lead_interactions lead_interactions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_interactions lead_interactions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_interactions"
    ADD CONSTRAINT "lead_interactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: lead_stage_history lead_stage_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_stage_history"
    ADD CONSTRAINT "lead_stage_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: lead_stage_history lead_stage_history_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_stage_history"
    ADD CONSTRAINT "lead_stage_history_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: lead_stage_history lead_stage_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_stage_history"
    ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: leads leads_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: leads leads_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: leads leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: leads leads_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;


--
-- Name: patients patients_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_availability professional_availability_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_availability"
    ADD CONSTRAINT "professional_availability_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_availability professional_availability_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_availability"
    ADD CONSTRAINT "professional_availability_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE CASCADE;


--
-- Name: professional_availability professional_availability_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_availability"
    ADD CONSTRAINT "professional_availability_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: professional_health_insurances professional_health_insurances_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_health_insurances"
    ADD CONSTRAINT "professional_health_insurances_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_health_insurances professional_health_insurances_insurance_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_health_insurances"
    ADD CONSTRAINT "professional_health_insurances_insurance_clinic_fkey" FOREIGN KEY ("health_insurance_id", "clinic_id") REFERENCES "public"."health_insurances"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: professional_health_insurances professional_health_insurances_professional_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_health_insurances"
    ADD CONSTRAINT "professional_health_insurances_professional_clinic_fkey" FOREIGN KEY ("professional_id", "clinic_id") REFERENCES "public"."professionals"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: professional_locations professional_locations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_locations"
    ADD CONSTRAINT "professional_locations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_locations professional_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_locations"
    ADD CONSTRAINT "professional_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE CASCADE;


--
-- Name: professional_locations professional_locations_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_locations"
    ADD CONSTRAINT "professional_locations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: professional_settings professional_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_settings"
    ADD CONSTRAINT "professional_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_settings professional_settings_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_settings"
    ADD CONSTRAINT "professional_settings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: professional_treatments professional_treatments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_treatments"
    ADD CONSTRAINT "professional_treatments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professional_treatments professional_treatments_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_treatments"
    ADD CONSTRAINT "professional_treatments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: professional_treatments professional_treatments_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professional_treatments"
    ADD CONSTRAINT "professional_treatments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;


--
-- Name: professionals professionals_class_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_class_entity_id_fkey" FOREIGN KEY ("class_entity_id") REFERENCES "public"."class_entities"("id") ON DELETE SET NULL;


--
-- Name: professionals professionals_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: professionals professionals_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;


--
-- Name: professionals professionals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: roles roles_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: scheduling_connection_professionals scheduling_connection_professionals_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_connection_professionals"
    ADD CONSTRAINT "scheduling_connection_professionals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_connection_professionals scheduling_connection_professionals_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_connection_professionals"
    ADD CONSTRAINT "scheduling_connection_professionals_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_connection_professionals scheduling_connection_professionals_professional_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_connection_professionals"
    ADD CONSTRAINT "scheduling_connection_professionals_professional_clinic_fkey" FOREIGN KEY ("professional_id", "clinic_id") REFERENCES "public"."professionals"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_exceptions scheduling_exceptions_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_exceptions"
    ADD CONSTRAINT "scheduling_exceptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: scheduling_exceptions scheduling_exceptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_exceptions"
    ADD CONSTRAINT "scheduling_exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: scheduling_exceptions scheduling_exceptions_location_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_exceptions"
    ADD CONSTRAINT "scheduling_exceptions_location_tenant_fk" FOREIGN KEY ("clinic_id", "location_id") REFERENCES "public"."clinic_locations"("clinic_id", "id") ON DELETE CASCADE;


--
-- Name: scheduling_exceptions scheduling_exceptions_professional_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_exceptions"
    ADD CONSTRAINT "scheduling_exceptions_professional_tenant_fk" FOREIGN KEY ("professional_id", "clinic_id") REFERENCES "public"."professionals"("id", "clinic_id") ON DELETE CASCADE;


--
-- Name: scheduling_insurance_mappings scheduling_insurance_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_insurance_mappings"
    ADD CONSTRAINT "scheduling_insurance_mappings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_insurance_mappings scheduling_insurance_mappings_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_insurance_mappings"
    ADD CONSTRAINT "scheduling_insurance_mappings_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_insurance_mappings scheduling_insurance_mappings_insurance_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_insurance_mappings"
    ADD CONSTRAINT "scheduling_insurance_mappings_insurance_clinic_fkey" FOREIGN KEY ("health_insurance_id", "clinic_id") REFERENCES "public"."health_insurances"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_location_mappings scheduling_location_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_location_mappings"
    ADD CONSTRAINT "scheduling_location_mappings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_location_mappings scheduling_location_mappings_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_location_mappings"
    ADD CONSTRAINT "scheduling_location_mappings_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_location_mappings scheduling_location_mappings_location_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_location_mappings"
    ADD CONSTRAINT "scheduling_location_mappings_location_clinic_fkey" FOREIGN KEY ("location_id", "clinic_id") REFERENCES "public"."clinic_locations"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_professional_mappings scheduling_professional_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_professional_mappings"
    ADD CONSTRAINT "scheduling_professional_mappings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_professional_mappings scheduling_professional_mappings_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_professional_mappings"
    ADD CONSTRAINT "scheduling_professional_mappings_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_professional_mappings scheduling_professional_mappings_professional_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_professional_mappings"
    ADD CONSTRAINT "scheduling_professional_mappings_professional_clinic_fkey" FOREIGN KEY ("professional_id", "clinic_id") REFERENCES "public"."professionals"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_provider_connections scheduling_provider_connections_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_connections"
    ADD CONSTRAINT "scheduling_provider_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_provider_events scheduling_provider_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_events"
    ADD CONSTRAINT "scheduling_provider_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_provider_events scheduling_provider_events_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_provider_events"
    ADD CONSTRAINT "scheduling_provider_events_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_reconciliation_states scheduling_reconciliation_states_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_reconciliation_states"
    ADD CONSTRAINT "scheduling_reconciliation_states_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_reconciliation_states scheduling_reconciliation_states_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_reconciliation_states"
    ADD CONSTRAINT "scheduling_reconciliation_states_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_service_mappings scheduling_service_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_service_mappings"
    ADD CONSTRAINT "scheduling_service_mappings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;


--
-- Name: scheduling_service_mappings scheduling_service_mappings_connection_clinic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_service_mappings"
    ADD CONSTRAINT "scheduling_service_mappings_connection_clinic_fkey" FOREIGN KEY ("connection_id", "clinic_id") REFERENCES "public"."scheduling_provider_connections"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: scheduling_service_mappings scheduling_service_mappings_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduling_service_mappings"
    ADD CONSTRAINT "scheduling_service_mappings_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE RESTRICT;


--
-- Name: team_invitations team_invitations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: treatment_categories treatment_categories_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_categories"
    ADD CONSTRAINT "treatment_categories_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");


--
-- Name: treatments treatments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."treatment_categories"("id");


--
-- Name: treatments treatments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: user_access_groups user_access_groups_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_access_groups"
    ADD CONSTRAINT "user_access_groups_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: user_access_groups user_access_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_access_groups"
    ADD CONSTRAINT "user_access_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."access_groups"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: waitlist_agent_logs waitlist_agent_logs_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_agent_logs"
    ADD CONSTRAINT "waitlist_agent_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: waitlist_match_events waitlist_match_events_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_match_events"
    ADD CONSTRAINT "waitlist_match_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: waitlist_match_events waitlist_match_events_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_match_events"
    ADD CONSTRAINT "waitlist_match_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE CASCADE;


--
-- Name: waitlist_match_events waitlist_match_events_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_match_events"
    ADD CONSTRAINT "waitlist_match_events_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;


--
-- Name: waitlist_matching_settings waitlist_matching_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_matching_settings"
    ADD CONSTRAINT "waitlist_matching_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: waitlist_notifications waitlist_notifications_action_taken_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_action_taken_by_fkey" FOREIGN KEY ("action_taken_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: waitlist_notifications waitlist_notifications_health_insurance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_health_insurance_id_fkey" FOREIGN KEY ("health_insurance_id") REFERENCES "public"."health_insurances"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_locations"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_matched_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_matched_professional_id_fkey" FOREIGN KEY ("matched_professional_id") REFERENCES "public"."professionals"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_resulting_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_resulting_appointment_id_fkey" FOREIGN KEY ("resulting_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE SET NULL;


--
-- Name: waitlist_notifications waitlist_notifications_waitlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."waitlist_notifications"
    ADD CONSTRAINT "waitlist_notifications_waitlist_id_fkey" FOREIGN KEY ("waitlist_id") REFERENCES "public"."appointment_waitlist"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_active_handoff_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_active_handoff_tenant_fk" FOREIGN KEY ("active_handoff_id", "clinic_id") REFERENCES "public"."ai_conversation_handoffs"("id", "clinic_id") ON DELETE RESTRICT;


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_ai_conversations whatsapp_ai_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_conversations"
    ADD CONSTRAINT "whatsapp_ai_conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_messages"
    ADD CONSTRAINT "whatsapp_ai_messages_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_messages"
    ADD CONSTRAINT "whatsapp_ai_messages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_messages"
    ADD CONSTRAINT "whatsapp_ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_ai_conversations"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_messages"
    ADD CONSTRAINT "whatsapp_ai_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: whatsapp_ai_settings whatsapp_ai_settings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_ai_settings"
    ADD CONSTRAINT "whatsapp_ai_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_connections whatsapp_connections_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_connections whatsapp_connections_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: clinics Admin can update their clinic; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can update their clinic" ON "public"."clinics" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "id", 'admin'::"public"."app_role"));


--
-- Name: class_entities Admin creates class entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates class entities" ON "public"."class_entities" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_treatments Admin creates professional treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates professional treatments" ON "public"."professional_treatments" FOR INSERT TO "authenticated" WITH CHECK (("professional_id" IN ( SELECT "professionals"."id"
   FROM "public"."professionals"
  WHERE "public"."has_clinic_role"("auth"."uid"(), "professionals"."clinic_id", 'admin'::"public"."app_role"))));


--
-- Name: professionals Admin creates professionals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates professionals" ON "public"."professionals" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: roles Admin creates roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates roles" ON "public"."roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: user_roles Admin creates roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: treatment_categories Admin creates treatment categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates treatment categories" ON "public"."treatment_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: treatments Admin creates treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin creates treatments" ON "public"."treatments" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: class_entities Admin deletes class entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes class entities" ON "public"."class_entities" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: patients Admin deletes patients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes patients" ON "public"."patients" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_treatments Admin deletes professional treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes professional treatments" ON "public"."professional_treatments" FOR DELETE TO "authenticated" USING (("professional_id" IN ( SELECT "professionals"."id"
   FROM "public"."professionals"
  WHERE "public"."has_clinic_role"("auth"."uid"(), "professionals"."clinic_id", 'admin'::"public"."app_role"))));


--
-- Name: professionals Admin deletes professionals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes professionals" ON "public"."professionals" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: roles Admin deletes roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes roles" ON "public"."roles" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: user_roles Admin deletes roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: treatment_categories Admin deletes treatment categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin deletes treatment categories" ON "public"."treatment_categories" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: access_group_permissions Admin manage access group permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage access group permissions" ON "public"."access_group_permissions" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: access_groups Admin manage access groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage access groups" ON "public"."access_groups" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: user_access_groups Admin manage user access groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage user access groups" ON "public"."user_access_groups" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: appointment_reminder_settings Admin manages 7d reminder settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages 7d reminder settings" ON "public"."appointment_reminder_settings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: administrative_knowledge_entries Admin manages administrative knowledge; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages administrative knowledge" ON "public"."administrative_knowledge_entries" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: clinic_administrative_policies Admin manages administrative policies; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages administrative policies" ON "public"."clinic_administrative_policies" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: appointment_blocks Admin manages appointment blocks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages appointment blocks" ON "public"."appointment_blocks" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: health_insurances Admin manages clinic health insurances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages clinic health insurances" ON "public"."health_insurances" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: clinic_locations Admin manages clinic locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages clinic locations" ON "public"."clinic_locations" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: clinic_settings Admin manages clinic settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages clinic settings" ON "public"."clinic_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: daily_agenda_summary_settings Admin manages daily agenda summary settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages daily agenda summary settings" ON "public"."daily_agenda_summary_settings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: team_invitations Admin manages invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages invitations" ON "public"."team_invitations" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_availability Admin manages professional availability; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages professional availability" ON "public"."professional_availability" TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_health_insurances Admin manages professional health insurances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages professional health insurances" ON "public"."professional_health_insurances" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_locations Admin manages professional locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages professional locations" ON "public"."professional_locations" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_settings Admin manages professional settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages professional settings" ON "public"."professional_settings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_provider_connections Admin manages scheduling connections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling connections" ON "public"."scheduling_provider_connections" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_exceptions Admin manages scheduling exceptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling exceptions" ON "public"."scheduling_exceptions" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_connection_professionals Admin manages scheduling professional assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling professional assignments" ON "public"."scheduling_connection_professionals" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_insurance_mappings Admin manages scheduling_insurance_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling_insurance_mappings" ON "public"."scheduling_insurance_mappings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_location_mappings Admin manages scheduling_location_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling_location_mappings" ON "public"."scheduling_location_mappings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_professional_mappings Admin manages scheduling_professional_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling_professional_mappings" ON "public"."scheduling_professional_mappings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: scheduling_service_mappings Admin manages scheduling_service_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manages scheduling_service_mappings" ON "public"."scheduling_service_mappings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: user_roles Admin sees clinic roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin sees clinic roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: leads Admin soft deletes leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin soft deletes leads" ON "public"."leads" FOR DELETE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: class_entities Admin updates class entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates class entities" ON "public"."class_entities" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: clinic_settings Admin updates clinic settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates clinic settings" ON "public"."clinic_settings" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: professional_treatments Admin updates professional treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates professional treatments" ON "public"."professional_treatments" FOR UPDATE TO "authenticated" USING (("professional_id" IN ( SELECT "professionals"."id"
   FROM "public"."professionals"
  WHERE "public"."has_clinic_role"("auth"."uid"(), "professionals"."clinic_id", 'admin'::"public"."app_role"))));


--
-- Name: professionals Admin updates professionals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates professionals" ON "public"."professionals" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: roles Admin updates roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates roles" ON "public"."roles" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: user_roles Admin updates roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: treatment_categories Admin updates treatment categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates treatment categories" ON "public"."treatment_categories" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: treatments Admin updates treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin updates treatments" ON "public"."treatments" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: audit_logs Admin views audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin views audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: ai_admin_action_events Clinic admins read AI admin actions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic admins read AI admin actions" ON "public"."ai_admin_action_events" FOR SELECT TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: ai_operational_events Clinic staff reads AI operational events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads AI operational events" ON "public"."ai_operational_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: ai_safety_events Clinic staff reads AI safety events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads AI safety events" ON "public"."ai_safety_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: ai_tool_execution_events Clinic staff reads AI tool execution events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads AI tool execution events" ON "public"."ai_tool_execution_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: ai_usage_events Clinic staff reads AI usage events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads AI usage events" ON "public"."ai_usage_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: administrative_knowledge_entries Clinic staff reads administrative knowledge; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads administrative knowledge" ON "public"."administrative_knowledge_entries" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: clinic_administrative_policies Clinic staff reads administrative policies; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads administrative policies" ON "public"."clinic_administrative_policies" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: ai_knowledge_answer_events Clinic staff reads knowledge audit; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clinic staff reads knowledge audit" ON "public"."ai_knowledge_answer_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: clinics Staff can view their clinic; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view their clinic" ON "public"."clinics" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_clinic"("auth"."uid"(), "id"));


--
-- Name: appointments Staff creates appointments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: lead_interactions Staff creates lead interactions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates lead interactions" ON "public"."lead_interactions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: lead_stage_history Staff creates lead stage history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates lead stage history" ON "public"."lead_stage_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: leads Staff creates leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates leads" ON "public"."leads" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: patients Staff creates patients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates patients" ON "public"."patients" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_settings Staff creates whatsapp ai settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff creates whatsapp ai settings" ON "public"."whatsapp_ai_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: audit_logs Staff inserts audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff inserts audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: access_group_permissions Staff read access group permissions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff read access group permissions" ON "public"."access_group_permissions" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: access_groups Staff read access groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff read access groups" ON "public"."access_groups" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: user_access_groups Staff read user access groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff read user access groups" ON "public"."user_access_groups" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: health_insurances Staff reads clinic health insurances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads clinic health insurances" ON "public"."health_insurances" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: professional_health_insurances Staff reads professional health insurances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads professional health insurances" ON "public"."professional_health_insurances" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_provider_connections Staff reads scheduling connections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling connections" ON "public"."scheduling_provider_connections" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_connection_professionals Staff reads scheduling professional assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling professional assignments" ON "public"."scheduling_connection_professionals" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_provider_events Staff reads scheduling provider events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling provider events" ON "public"."scheduling_provider_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_reconciliation_states Staff reads scheduling reconciliation state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling reconciliation state" ON "public"."scheduling_reconciliation_states" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_insurance_mappings Staff reads scheduling_insurance_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling_insurance_mappings" ON "public"."scheduling_insurance_mappings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_location_mappings Staff reads scheduling_location_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling_location_mappings" ON "public"."scheduling_location_mappings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_professional_mappings Staff reads scheduling_professional_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling_professional_mappings" ON "public"."scheduling_professional_mappings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_service_mappings Staff reads scheduling_service_mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff reads scheduling_service_mappings" ON "public"."scheduling_service_mappings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: appointments Staff updates appointments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updates appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: leads Staff updates leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updates leads" ON "public"."leads" FOR UPDATE TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: patients Staff updates patients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updates patients" ON "public"."patients" FOR UPDATE TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_conversations Staff updates whatsapp ai conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updates whatsapp ai conversations" ON "public"."whatsapp_ai_conversations" FOR UPDATE TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id")) WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_settings Staff updates whatsapp ai settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff updates whatsapp ai settings" ON "public"."whatsapp_ai_settings" FOR UPDATE TO "authenticated" USING ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"("auth"."uid"(), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: appointment_reminder_settings Staff views 7d reminder settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views 7d reminder settings" ON "public"."appointment_reminder_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: appointment_blocks Staff views appointment blocks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views appointment blocks" ON "public"."appointment_blocks" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: appointments Staff views appointments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: class_entities Staff views class entities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views class entities" ON "public"."class_entities" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: ai_handoff_events Staff views clinic handoff events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views clinic handoff events" ON "public"."ai_handoff_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: ai_conversation_handoffs Staff views clinic handoffs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views clinic handoffs" ON "public"."ai_conversation_handoffs" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: clinic_locations Staff views clinic locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views clinic locations" ON "public"."clinic_locations" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: patients Staff views clinic patients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views clinic patients" ON "public"."patients" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: clinic_settings Staff views clinic settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views clinic settings" ON "public"."clinic_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: daily_agenda_summary_executions Staff views daily agenda summary executions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views daily agenda summary executions" ON "public"."daily_agenda_summary_executions" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: daily_agenda_summary_settings Staff views daily agenda summary settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views daily agenda summary settings" ON "public"."daily_agenda_summary_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: lead_interactions Staff views lead interactions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views lead interactions" ON "public"."lead_interactions" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: lead_stage_history Staff views lead stage history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views lead stage history" ON "public"."lead_stage_history" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: leads Staff views leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views leads" ON "public"."leads" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: professional_availability Staff views professional availability; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views professional availability" ON "public"."professional_availability" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: professional_locations Staff views professional locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views professional locations" ON "public"."professional_locations" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: professional_settings Staff views professional settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views professional settings" ON "public"."professional_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: professional_treatments Staff views professional treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views professional treatments" ON "public"."professional_treatments" FOR SELECT TO "authenticated" USING (("professional_id" IN ( SELECT "professionals"."id"
   FROM "public"."professionals"
  WHERE "public"."is_clinic_staff"("auth"."uid"(), "professionals"."clinic_id"))));


--
-- Name: professionals Staff views professionals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views professionals" ON "public"."professionals" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: roles Staff views roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views roles" ON "public"."roles" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_connections Staff views safe WhatsApp connection status; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views safe WhatsApp connection status" ON "public"."whatsapp_connections" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: scheduling_exceptions Staff views scheduling exceptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views scheduling exceptions" ON "public"."scheduling_exceptions" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: treatment_categories Staff views treatment categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views treatment categories" ON "public"."treatment_categories" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: treatments Staff views treatments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views treatments" ON "public"."treatments" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_conversations Staff views whatsapp ai conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views whatsapp ai conversations" ON "public"."whatsapp_ai_conversations" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_messages Staff views whatsapp ai messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views whatsapp ai messages" ON "public"."whatsapp_ai_messages" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: whatsapp_ai_settings Staff views whatsapp ai settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff views whatsapp ai settings" ON "public"."whatsapp_ai_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: user_roles Users see own roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: access_group_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."access_group_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: access_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."access_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: administrative_knowledge_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."administrative_knowledge_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_job_executions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agenda_job_executions" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_admin_action_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_admin_action_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversation_handoffs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_conversation_handoffs" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_handoff_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_handoff_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_answer_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_knowledge_answer_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_operational_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_operational_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_safety_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_safety_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_tool_execution_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_tool_execution_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_tool_mutation_claims; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_tool_mutation_claims" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_usage_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_blocks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointment_blocks" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_reminder_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointment_reminder_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_reminders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointment_reminders" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_waitlist; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointment_waitlist" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: class_entities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."class_entities" ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_matching_settings clinic admins manage waitlist matching settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic admins manage waitlist matching settings" ON "public"."waitlist_matching_settings" TO "authenticated" USING ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role")) WITH CHECK ("public"."has_clinic_role"(( SELECT "auth"."uid"() AS "uid"), "clinic_id", 'admin'::"public"."app_role"));


--
-- Name: appointment_waitlist clinic staff can manage appointment_waitlist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff can manage appointment_waitlist" ON "public"."appointment_waitlist" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id")) WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: waitlist_notifications clinic staff can manage waitlist_notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff can manage waitlist_notifications" ON "public"."waitlist_notifications" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id")) WITH CHECK ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: agenda_job_executions clinic staff can view agenda job executions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff can view agenda job executions" ON "public"."agenda_job_executions" FOR SELECT USING ((("clinic_id" IS NULL) OR "public"."is_clinic_staff"("auth"."uid"(), "clinic_id")));


--
-- Name: appointment_reminders clinic staff can view appointment_reminders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff can view appointment_reminders" ON "public"."appointment_reminders" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"(( SELECT "auth"."uid"() AS "uid"), "clinic_id"));


--
-- Name: waitlist_agent_logs clinic staff can view waitlist_agent_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff can view waitlist_agent_logs" ON "public"."waitlist_agent_logs" FOR SELECT USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: waitlist_match_events clinic staff view waitlist matching events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff view waitlist matching events" ON "public"."waitlist_match_events" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: waitlist_matching_settings clinic staff view waitlist matching settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clinic staff view waitlist matching settings" ON "public"."waitlist_matching_settings" FOR SELECT TO "authenticated" USING ("public"."is_clinic_staff"("auth"."uid"(), "clinic_id"));


--
-- Name: clinic_administrative_policies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clinic_administrative_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clinic_locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinic_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clinic_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: clinics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_agenda_summary_executions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."daily_agenda_summary_executions" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_agenda_summary_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."daily_agenda_summary_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: health_insurances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."health_insurances" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_interactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_interactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_stage_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_stage_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_availability; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professional_availability" ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_health_insurances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professional_health_insurances" ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professional_locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professional_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_treatments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professional_treatments" ENABLE ROW LEVEL SECURITY;

--
-- Name: professionals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_connection_professionals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_connection_professionals" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_exceptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_exceptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_insurance_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_insurance_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_location_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_location_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_professional_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_professional_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_provider_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_provider_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_provider_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_provider_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_reconciliation_states; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_reconciliation_states" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_service_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduling_service_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: team_invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."team_invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."treatment_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: treatments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."treatments" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_access_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_access_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_agent_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."waitlist_agent_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_match_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."waitlist_match_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_matching_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."waitlist_matching_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."waitlist_notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whatsapp_ai_conversations" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whatsapp_ai_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whatsapp_ai_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whatsapp_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "administrative_text_array_is_valid"("values_to_check" "text"[], "maximum_items" integer, "maximum_item_length" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."administrative_text_array_is_valid"("values_to_check" "text"[], "maximum_items" integer, "maximum_item_length" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."administrative_text_array_is_valid"("values_to_check" "text"[], "maximum_items" integer, "maximum_item_length" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."administrative_text_array_is_valid"("values_to_check" "text"[], "maximum_items" integer, "maximum_item_length" integer) TO "service_role";


--
-- Name: TABLE "whatsapp_ai_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE "public"."whatsapp_ai_settings" TO "authenticated";


--
-- Name: FUNCTION "ai_feature_gate_snapshot"("p_row" "public"."whatsapp_ai_settings"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."ai_feature_gate_snapshot"("p_row" "public"."whatsapp_ai_settings") FROM PUBLIC;


--
-- Name: FUNCTION "assert_appointment_slot"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_ignore_appointment_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assert_appointment_slot"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_ignore_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_appointment_slot"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_ignore_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_appointment_slot"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_ignore_appointment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "audit_ai_feature_gate_change"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_ai_feature_gate_change"() FROM PUBLIC;


--
-- Name: FUNCTION "audit_trigger_func"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_trigger_func"() FROM PUBLIC;


--
-- Name: FUNCTION "auth_clinic_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."auth_clinic_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_clinic_id"() TO "service_role";


--
-- Name: FUNCTION "auth_user_role"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."auth_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_role"() TO "service_role";


--
-- Name: FUNCTION "authorize_human_conversation_outbound"("p_clinic_id" "uuid", "p_conversation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."authorize_human_conversation_outbound"("p_clinic_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."authorize_human_conversation_outbound"("p_clinic_id" "uuid", "p_conversation_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "bump_administrative_knowledge_revision"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."bump_administrative_knowledge_revision"() FROM PUBLIC;


--
-- Name: TABLE "appointments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE "public"."appointments" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."appointments" TO "service_role";


--
-- Name: FUNCTION "cancel_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_reason" "text", "p_status" "public"."appointment_status"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_reason" "text", "p_status" "public"."appointment_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_reason" "text", "p_status" "public"."appointment_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_reason" "text", "p_status" "public"."appointment_status") TO "service_role";


--
-- Name: FUNCTION "cancel_stale_appointment_reminders"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_stale_appointment_reminders"() FROM PUBLIC;


--
-- Name: FUNCTION "claim_ai_tool_mutation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_tool_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_ai_tool_mutation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_tool_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_ai_tool_mutation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_tool_name" "text") TO "service_role";


--
-- Name: TABLE "appointment_reminders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."appointment_reminders" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."appointment_reminders" TO "service_role";


--
-- Name: FUNCTION "claim_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: TABLE "daily_agenda_summary_executions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."daily_agenda_summary_executions" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_agenda_summary_executions" TO "authenticated";


--
-- Name: FUNCTION "claim_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: TABLE "waitlist_notifications"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: FUNCTION "claim_waitlist_offer"("p_clinic_id" "uuid", "p_waitlist_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_slot_start" timestamp with time zone, "p_slot_end" timestamp with time zone, "p_duration_minutes" integer, "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_waitlist_offer"("p_clinic_id" "uuid", "p_waitlist_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_slot_start" timestamp with time zone, "p_slot_end" timestamp with time zone, "p_duration_minutes" integer, "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_waitlist_offer"("p_clinic_id" "uuid", "p_waitlist_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_slot_start" timestamp with time zone, "p_slot_end" timestamp with time zone, "p_duration_minutes" integer, "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_appointment_with_type_secure"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_patient_id" "uuid", "p_lead_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_appointment_type" "text", "p_notes" "text", "p_duration_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_appointment_with_type_secure"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_patient_id" "uuid", "p_lead_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_appointment_type" "text", "p_notes" "text", "p_duration_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_appointment_with_type_secure"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_patient_id" "uuid", "p_lead_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_appointment_type" "text", "p_notes" "text", "p_duration_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_appointment_with_type_secure"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_patient_id" "uuid", "p_lead_id" "uuid", "p_treatment_id" "uuid", "p_start_time" timestamp with time zone, "p_appointment_type" "text", "p_notes" "text", "p_duration_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_internal_scheduling_connection_for_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_internal_scheduling_connection_for_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "create_primary_location_for_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_primary_location_for_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "create_settings_for_professional"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_settings_for_professional"() FROM PUBLIC;


--
-- Name: FUNCTION "determine_patient_appointment_type"("p_clinic_id" "uuid", "p_patient_id" "uuid", "p_professional_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."determine_patient_appointment_type"("p_clinic_id" "uuid", "p_patient_id" "uuid", "p_professional_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."determine_patient_appointment_type"("p_clinic_id" "uuid", "p_patient_id" "uuid", "p_professional_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."determine_patient_appointment_type"("p_clinic_id" "uuid", "p_patient_id" "uuid", "p_professional_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "enforce_agenda_professional_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_agenda_professional_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "enforce_location_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_location_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "enforce_professional_rule_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_professional_rule_tenant"() FROM PUBLIC;


--
-- Name: FUNCTION "enforce_professional_serves_location"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_professional_serves_location"() FROM PUBLIC;


--
-- Name: FUNCTION "enforce_scheduling_service_mapping_tenant"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_scheduling_service_mapping_tenant"() FROM PUBLIC;


--
-- Name: FUNCTION "enqueue_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enqueue_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_appointment_reminders"("p_automation_key" "text", "p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "enqueue_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enqueue_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_daily_agenda_summaries"("p_clinic_id" "uuid", "p_now" timestamp with time zone, "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "expire_waitlist_offers"("p_clinic_id" "uuid", "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."expire_waitlist_offers"("p_clinic_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_waitlist_offers"("p_clinic_id" "uuid", "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_aura_operational_metrics"("p_clinic_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_aura_operational_metrics"("p_clinic_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_aura_operational_metrics"("p_clinic_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_aura_operational_metrics"("p_clinic_id" "uuid", "p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_aura_pilot_snapshot"("p_clinic_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_aura_pilot_snapshot"("p_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_aura_pilot_snapshot"("p_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_aura_pilot_snapshot"("p_clinic_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_available_slots_for_appointment_type"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_date_from" "date", "p_date_to" "date", "p_step_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_available_slots_for_appointment_type"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_date_from" "date", "p_date_to" "date", "p_step_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_available_slots_for_appointment_type"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_date_from" "date", "p_date_to" "date", "p_step_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots_for_appointment_type"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_date_from" "date", "p_date_to" "date", "p_step_minutes" integer, "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") TO "service_role";


--
-- Name: FUNCTION "get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_location_operating_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_location_operating_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_location_operating_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_location_operating_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_professional_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_professional_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_professional_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_professional_working_periods"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_schedule_restriction_reason"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_schedule_restriction_reason"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_schedule_restriction_reason"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schedule_restriction_reason"("p_clinic_id" "uuid", "p_location_id" "uuid", "p_professional_id" "uuid", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_user_clinic_ids"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_user_clinic_ids"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_clinic_ids"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_clinic_ids"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_clinic_role"("_user_id" "uuid", "_clinic_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_clinic_role"("_user_id" "uuid", "_clinic_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_clinic_role"("_user_id" "uuid", "_clinic_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_clinic_role"("_user_id" "uuid", "_clinic_id" "uuid", "_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "has_menu_access"("_user_id" "uuid", "_clinic_id" "uuid", "_permission_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_menu_access"("_user_id" "uuid", "_clinic_id" "uuid", "_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_menu_access"("_user_id" "uuid", "_clinic_id" "uuid", "_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_menu_access"("_user_id" "uuid", "_clinic_id" "uuid", "_permission_key" "text") TO "service_role";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "invalidate_waitlist_active_offer"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invalidate_waitlist_active_offer"() FROM PUBLIC;


--
-- Name: FUNCTION "is_clinic_staff"("_user_id" "uuid", "_clinic_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_clinic_staff"("_user_id" "uuid", "_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_clinic_staff"("_user_id" "uuid", "_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_clinic_staff"("_user_id" "uuid", "_clinic_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "location_opening_hours_are_valid"("p_hours" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."location_opening_hours_are_valid"("p_hours" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."location_opening_hours_are_valid"("p_hours" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."location_opening_hours_are_valid"("p_hours" "jsonb") TO "service_role";


--
-- Name: FUNCTION "mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_appointment_reminder_delivery_attempt"("p_reminder_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "mark_daily_agenda_summary_delivery_attempt"("p_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_daily_agenda_summary_delivery_attempt"("p_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_daily_agenda_summary_delivery_attempt"("p_id" "uuid", "p_clinic_id" "uuid", "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "prevent_professional_availability_overlap"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prevent_professional_availability_overlap"() FROM PUBLIC;


--
-- Name: FUNCTION "process_team_invitation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."process_team_invitation"() FROM PUBLIC;


--
-- Name: FUNCTION "reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reassign_appointment_professional_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_professional_id" "uuid") TO "service_role";


--
-- Name: TABLE "ai_conversation_handoffs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_conversation_handoffs" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_conversation_handoffs" TO "service_role";


--
-- Name: FUNCTION "record_ai_conversation_failure"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_reason" "text", "p_threshold" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_ai_conversation_failure"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_reason" "text", "p_threshold" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ai_conversation_failure"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_reason" "text", "p_threshold" integer) TO "service_role";


--
-- Name: FUNCTION "record_ai_operational_event"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_channel" "text", "p_event_type" "text", "p_component" "text", "p_outcome" "text", "p_error_code" "text", "p_error_category" "text", "p_retryable" boolean, "p_latency_ms" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_ai_operational_event"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_channel" "text", "p_event_type" "text", "p_component" "text", "p_outcome" "text", "p_error_code" "text", "p_error_category" "text", "p_retryable" boolean, "p_latency_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ai_operational_event"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_correlation_id" "uuid", "p_channel" "text", "p_event_type" "text", "p_component" "text", "p_outcome" "text", "p_error_code" "text", "p_error_category" "text", "p_retryable" boolean, "p_latency_ms" integer) TO "service_role";


--
-- Name: FUNCTION "record_waitlist_appointment_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_waitlist_appointment_event"() FROM PUBLIC;


--
-- Name: FUNCTION "record_waitlist_block_removed_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_waitlist_block_removed_event"() FROM PUBLIC;


--
-- Name: FUNCTION "record_waitlist_exception_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_waitlist_exception_event"() FROM PUBLIC;


--
-- Name: FUNCTION "record_waitlist_location_schedule_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_waitlist_location_schedule_event"() FROM PUBLIC;


--
-- Name: FUNCTION "record_waitlist_schedule_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_waitlist_schedule_event"() FROM PUBLIC;


--
-- Name: FUNCTION "request_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_reason" "text", "p_priority" "text", "p_source" "text", "p_correlation_id" "uuid", "p_summary" "jsonb", "p_description" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."request_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_reason" "text", "p_priority" "text", "p_source" "text", "p_correlation_id" "uuid", "p_summary" "jsonb", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_reason" "text", "p_priority" "text", "p_source" "text", "p_correlation_id" "uuid", "p_summary" "jsonb", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_reason" "text", "p_priority" "text", "p_source" "text", "p_correlation_id" "uuid", "p_summary" "jsonb", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "reschedule_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_start_time" timestamp with time zone, "p_professional_id" "uuid", "p_location_id" "uuid", "p_notes" "text", "p_duration_minutes" integer, "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reschedule_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_start_time" timestamp with time zone, "p_professional_id" "uuid", "p_location_id" "uuid", "p_notes" "text", "p_duration_minutes" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_start_time" timestamp with time zone, "p_professional_id" "uuid", "p_location_id" "uuid", "p_notes" "text", "p_duration_minutes" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_appointment_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_start_time" timestamp with time zone, "p_professional_id" "uuid", "p_location_id" "uuid", "p_notes" "text", "p_duration_minutes" integer, "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "reset_ai_conversation_failures"("p_clinic_id" "uuid", "p_conversation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_ai_conversation_failures"("p_clinic_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_ai_conversation_failures"("p_clinic_id" "uuid", "p_conversation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_resolution" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resolve_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_resolution" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_ai_conversation_handoff"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_resolution" "text") TO "authenticated";


--
-- Name: FUNCTION "resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_appointment_duration"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_appointment_type_terms"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resolve_appointment_type_terms"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_appointment_type_terms"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_appointment_type_terms"("p_clinic_id" "uuid", "p_professional_id" "uuid", "p_treatment_id" "uuid", "p_billing_type" "text", "p_health_insurance_id" "uuid", "p_appointment_type" "text") TO "service_role";


--
-- Name: FUNCTION "respond_waitlist_offer"("p_clinic_id" "uuid", "p_phone" "text", "p_response" "text", "p_now" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."respond_waitlist_offer"("p_clinic_id" "uuid", "p_phone" "text", "p_response" "text", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_waitlist_offer"("p_clinic_id" "uuid", "p_phone" "text", "p_response" "text", "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_crm_stage_settings"("p_clinic_id" "uuid", "p_settings" "jsonb", "p_relocations" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "schedule_periods_are_valid"("p_periods" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."schedule_periods_are_valid"("p_periods" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."schedule_periods_are_valid"("p_periods" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_periods_are_valid"("p_periods" "jsonb") TO "service_role";


--
-- Name: FUNCTION "seed_default_class_entities_for_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."seed_default_class_entities_for_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "seed_default_health_insurances_for_clinic"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."seed_default_health_insurances_for_clinic"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_lead_interaction_timestamp"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."sync_lead_interaction_timestamp"() FROM PUBLIC;


--
-- Name: FUNCTION "take_over_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."take_over_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."take_over_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "touch_lead_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."touch_lead_updated_at"() FROM PUBLIC;


--
-- Name: FUNCTION "track_lead_stage_change"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."track_lead_stage_change"() FROM PUBLIC;


--
-- Name: FUNCTION "transfer_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."transfer_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_appointment_status_secure"("p_clinic_id" "uuid", "p_appointment_id" "uuid", "p_status" "public"."appointment_status") TO "service_role";


--
-- Name: FUNCTION "unassign_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."unassign_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unassign_ai_conversation"("p_clinic_id" "uuid", "p_conversation_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;


--
-- Name: FUNCTION "update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_whatsapp_ai_conversation_state"("p_clinic_id" "uuid", "p_conversation_id" "uuid", "p_expected_revision" integer, "p_state" "jsonb") TO "service_role";


--
-- Name: FUNCTION "user_belongs_to_clinic"("_user_id" "uuid", "_clinic_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."user_belongs_to_clinic"("_user_id" "uuid", "_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_belongs_to_clinic"("_user_id" "uuid", "_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_belongs_to_clinic"("_user_id" "uuid", "_clinic_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "validate_appointment_provider_identity"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."validate_appointment_provider_identity"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_appointment_reminder_settings"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."validate_appointment_reminder_settings"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_daily_agenda_summary_settings"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."validate_daily_agenda_summary_settings"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_location_schedule_configuration"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."validate_location_schedule_configuration"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_scheduling_provider_event"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."validate_scheduling_provider_event"() FROM PUBLIC;


--
-- Name: TABLE "access_group_permissions"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "access_groups"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "administrative_knowledge_entries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."administrative_knowledge_entries" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."administrative_knowledge_entries" TO "service_role";


--
-- Name: TABLE "agenda_job_executions"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "ai_admin_action_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_admin_action_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_admin_action_events" TO "service_role";


--
-- Name: TABLE "ai_handoff_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_handoff_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_handoff_events" TO "service_role";


--
-- Name: TABLE "ai_knowledge_answer_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_knowledge_answer_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_knowledge_answer_events" TO "service_role";


--
-- Name: TABLE "ai_operational_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_operational_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_operational_events" TO "service_role";


--
-- Name: TABLE "ai_safety_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_safety_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_safety_events" TO "service_role";


--
-- Name: TABLE "ai_tool_execution_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_tool_execution_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_tool_execution_events" TO "service_role";


--
-- Name: TABLE "ai_tool_mutation_claims"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_tool_mutation_claims" TO "service_role";


--
-- Name: TABLE "ai_usage_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."ai_usage_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."ai_usage_events" TO "service_role";


--
-- Name: TABLE "appointment_blocks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."appointment_blocks" TO "authenticated";
GRANT SELECT ON TABLE "public"."appointment_blocks" TO "service_role";


--
-- Name: TABLE "appointment_reminder_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."appointment_reminder_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."clinic_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("clinic_id") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."is_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("is_enabled"),UPDATE("is_enabled") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."preferred_send_time"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("preferred_send_time"),UPDATE("preferred_send_time") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."template_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("template_name"),UPDATE("template_name") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."template_language_code"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("template_language_code"),UPDATE("template_language_code") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."location_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("location_id"),UPDATE("location_id") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."professional_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("professional_id"),UPDATE("professional_id") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: COLUMN "appointment_reminder_settings"."automation_key"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("automation_key") ON TABLE "public"."appointment_reminder_settings" TO "authenticated";


--
-- Name: TABLE "appointment_waitlist"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "audit_logs"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "class_entities"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "clinic_administrative_policies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."clinic_administrative_policies" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."clinic_administrative_policies" TO "service_role";


--
-- Name: TABLE "clinic_locations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."clinic_locations" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."clinic_locations" TO "service_role";


--
-- Name: TABLE "clinic_settings"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "clinics"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "daily_agenda_summary_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."daily_agenda_summary_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."clinic_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("clinic_id") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."is_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("is_enabled"),UPDATE("is_enabled") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."send_time"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("send_time"),UPDATE("send_time") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."send_when_empty"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("send_when_empty"),UPDATE("send_when_empty") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."template_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("template_name"),UPDATE("template_name") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: COLUMN "daily_agenda_summary_settings"."template_language_code"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("template_language_code"),UPDATE("template_language_code") ON TABLE "public"."daily_agenda_summary_settings" TO "authenticated";


--
-- Name: TABLE "health_insurances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."health_insurances" TO "authenticated";
GRANT SELECT ON TABLE "public"."health_insurances" TO "service_role";


--
-- Name: TABLE "lead_interactions"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "lead_stage_history"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "leads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."leads" TO "authenticated";
GRANT SELECT ON TABLE "public"."leads" TO "service_role";


--
-- Name: TABLE "patients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."patients" TO "authenticated";
GRANT SELECT ON TABLE "public"."patients" TO "service_role";


--
-- Name: TABLE "professional_availability"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."professional_availability" TO "authenticated";
GRANT SELECT ON TABLE "public"."professional_availability" TO "service_role";


--
-- Name: TABLE "professional_health_insurances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."professional_health_insurances" TO "authenticated";
GRANT SELECT ON TABLE "public"."professional_health_insurances" TO "service_role";


--
-- Name: TABLE "professional_locations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."professional_locations" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."professional_locations" TO "service_role";


--
-- Name: TABLE "professional_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."professional_settings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."professional_settings" TO "service_role";


--
-- Name: TABLE "professional_treatments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."professional_treatments" TO "authenticated";
GRANT SELECT ON TABLE "public"."professional_treatments" TO "service_role";


--
-- Name: TABLE "professionals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."professionals" TO "authenticated";
GRANT SELECT ON TABLE "public"."professionals" TO "service_role";


--
-- Name: TABLE "roles"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "scheduling_connection_professionals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_connection_professionals" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_connection_professionals" TO "service_role";


--
-- Name: TABLE "scheduling_exceptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_exceptions" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_exceptions" TO "service_role";


--
-- Name: TABLE "scheduling_insurance_mappings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_insurance_mappings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_insurance_mappings" TO "service_role";


--
-- Name: TABLE "scheduling_location_mappings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_location_mappings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_location_mappings" TO "service_role";


--
-- Name: TABLE "scheduling_professional_mappings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_professional_mappings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_professional_mappings" TO "service_role";


--
-- Name: TABLE "scheduling_provider_connections"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_provider_connections" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_provider_connections" TO "service_role";


--
-- Name: TABLE "scheduling_provider_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."scheduling_provider_events" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_provider_events" TO "service_role";


--
-- Name: TABLE "scheduling_reconciliation_states"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."scheduling_reconciliation_states" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_reconciliation_states" TO "service_role";


--
-- Name: TABLE "scheduling_service_mappings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_service_mappings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."scheduling_service_mappings" TO "service_role";


--
-- Name: TABLE "team_invitations"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "treatment_categories"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "treatments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."treatments" TO "authenticated";
GRANT SELECT ON TABLE "public"."treatments" TO "service_role";


--
-- Name: TABLE "user_access_groups"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "waitlist_agent_logs"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "waitlist_match_events"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: SEQUENCE "waitlist_match_events_id_seq"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "waitlist_matching_settings"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: TABLE "whatsapp_ai_conversations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."lead_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("lead_id") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."contact_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("contact_name") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."last_inbound_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_inbound_at") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."last_outbound_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_outbound_at") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."last_message_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("last_message_at") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."metadata"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("metadata") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: COLUMN "whatsapp_ai_conversations"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE("updated_at") ON TABLE "public"."whatsapp_ai_conversations" TO "authenticated";


--
-- Name: TABLE "whatsapp_ai_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."whatsapp_ai_messages" TO "authenticated";


--
-- Name: TABLE "whatsapp_connections"; Type: ACL; Schema: public; Owner: postgres
--


--
-- Name: COLUMN "whatsapp_connections"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."clinic_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("clinic_id") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."waba_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("waba_id") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."phone_number_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("phone_number_id") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."display_phone_number"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("display_phone_number") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."business_name"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("business_name") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("status") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."token_expires_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("token_expires_at") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."connected_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("connected_by") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."connected_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("connected_at") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."disconnected_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("disconnected_at") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."metadata"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("metadata") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--
-- Name: COLUMN "whatsapp_connections"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."whatsapp_connections" TO "authenticated";


--

-- ---------------------------------------------------------------------------
-- Canonical Data API grants (RLS remains the authorization boundary)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.access_group_permissions,
  public.access_groups,
  public.appointment_blocks,
  public.appointment_waitlist,
  public.class_entities,
  public.leads,
  public.patients,
  public.professional_availability,
  public.professional_treatments,
  public.professionals,
  public.roles,
  public.team_invitations,
  public.treatment_categories,
  public.user_access_groups,
  public.user_roles,
  public.waitlist_matching_settings
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.clinic_settings,
  public.treatments
TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.clinics TO authenticated;

GRANT SELECT, INSERT ON TABLE
  public.audit_logs,
  public.lead_interactions,
  public.lead_stage_history
TO authenticated;

GRANT SELECT ON TABLE
  public.agenda_job_executions,
  public.waitlist_agent_logs,
  public.waitlist_match_events,
  public.waitlist_notifications
TO authenticated;

-- ---------------------------------------------------------------------------
-- Default access posture for future objects
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: the only product bucket retained by the clean baseline
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-logos', 'clinic-logos', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

CREATE POLICY "Public can view clinic logos"
ON storage.objects FOR SELECT
TO PUBLIC
USING (bucket_id = 'clinic-logos');

CREATE POLICY "Admin uploads clinic logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'clinic-logos'
  AND (storage.foldername(name))[1] = public.auth_clinic_id()::text
  AND public.has_clinic_role(auth.uid(), public.auth_clinic_id(), 'admin')
);

CREATE POLICY "Admin updates clinic logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'clinic-logos'
  AND (storage.foldername(name))[1] = public.auth_clinic_id()::text
  AND public.has_clinic_role(auth.uid(), public.auth_clinic_id(), 'admin')
)
WITH CHECK (
  bucket_id = 'clinic-logos'
  AND (storage.foldername(name))[1] = public.auth_clinic_id()::text
  AND public.has_clinic_role(auth.uid(), public.auth_clinic_id(), 'admin')
);

RESET client_min_messages;
RESET check_function_bodies;
