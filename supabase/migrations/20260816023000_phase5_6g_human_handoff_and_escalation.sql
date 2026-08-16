-- Phase 5.6G — operational human handoff and conversation escalation.

ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN IF NOT EXISTS ai_handoff_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_handoff_validated_at timestamptz;

ALTER TABLE public.whatsapp_ai_settings
  DROP CONSTRAINT IF EXISTS whatsapp_ai_settings_handoff_gate_valid;
ALTER TABLE public.whatsapp_ai_settings
  ADD CONSTRAINT whatsapp_ai_settings_handoff_gate_valid CHECK (
    NOT ai_handoff_enabled
    OR (ai_handoff_validated_at IS NOT NULL AND ai_engine_mode = 'active')
  );

ALTER TABLE public.whatsapp_ai_conversations
  ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'ai_active',
  ADD COLUMN IF NOT EXISTS active_handoff_id uuid,
  ADD COLUMN IF NOT EXISTS ai_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS control_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.whatsapp_ai_conversations
SET control_mode = CASE
  WHEN status = 'closed' THEN 'closed'
  WHEN status = 'handoff' OR ai_enabled = false THEN 'human_active'
  ELSE 'ai_active'
END;

ALTER TABLE public.whatsapp_ai_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_ai_conversations_control_mode_valid,
  DROP CONSTRAINT IF EXISTS whatsapp_ai_conversations_failure_count_valid,
  DROP CONSTRAINT IF EXISTS whatsapp_ai_conversations_control_revision_valid;
ALTER TABLE public.whatsapp_ai_conversations
  ADD CONSTRAINT whatsapp_ai_conversations_control_mode_valid CHECK (
    control_mode IN ('ai_active', 'handoff_pending', 'human_active', 'ai_resume_pending', 'closed')
  ),
  ADD CONSTRAINT whatsapp_ai_conversations_failure_count_valid CHECK (ai_failure_count BETWEEN 0 AND 100),
  ADD CONSTRAINT whatsapp_ai_conversations_control_revision_valid CHECK (control_revision >= 0);

CREATE TABLE public.ai_conversation_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'user_requested_human', 'medical_out_of_scope', 'urgent_language', 'repeated_failure',
    'repeated_ambiguity', 'knowledge_conflict', 'knowledge_not_found', 'provider_unavailable',
    'external_provider_write_unavailable', 'mutation_failure', 'identity_unresolved',
    'policy_required', 'safety_fail_closed', 'staff_manual_takeover', 'other'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'queued', 'assigned', 'accepted', 'resolved', 'cancelled')),
  source text NOT NULL CHECK (source IN ('conversation_engine', 'safety', 'tool', 'knowledge', 'user_request', 'staff', 'system')),
  correlation_id uuid,
  sanitized_description text CHECK (sanitized_description IS NULL OR length(sanitized_description) <= 240),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object' AND pg_column_size(summary) <= 16384),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  accepted_at timestamptz,
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR resolution IN ('resolved_by_human', 'returned_to_ai', 'patient_ended', 'duplicate', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, clinic_id),
  CONSTRAINT ai_conversation_handoffs_conversation_tenant_fk
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE
);

ALTER TABLE public.whatsapp_ai_conversations
  ADD CONSTRAINT whatsapp_ai_conversations_active_handoff_tenant_fk
  FOREIGN KEY (active_handoff_id, clinic_id)
  REFERENCES public.ai_conversation_handoffs(id, clinic_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX ai_conversation_handoffs_one_active
  ON public.ai_conversation_handoffs(conversation_id)
  WHERE status IN ('requested', 'queued', 'assigned', 'accepted');
CREATE INDEX ai_conversation_handoffs_queue
  ON public.ai_conversation_handoffs(clinic_id, status, priority, requested_at)
  WHERE status IN ('requested', 'queued', 'assigned', 'accepted');
CREATE INDEX ai_conversation_handoffs_assignee
  ON public.ai_conversation_handoffs(clinic_id, assigned_user_id, status)
  WHERE assigned_user_id IS NOT NULL;

CREATE TABLE public.ai_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  handoff_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'requested', 'queued', 'assigned', 'accepted', 'transferred', 'unassigned',
    'resolved', 'returned_to_ai', 'closed', 'reopened', 'outbound_failed'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_handoff_events_conversation_tenant_fk
    FOREIGN KEY (conversation_id, clinic_id)
    REFERENCES public.whatsapp_ai_conversations(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT ai_handoff_events_handoff_tenant_fk
    FOREIGN KEY (handoff_id, clinic_id)
    REFERENCES public.ai_conversation_handoffs(id, clinic_id) ON DELETE CASCADE
);
CREATE INDEX ai_handoff_events_clinic_time ON public.ai_handoff_events(clinic_id, occurred_at DESC);
CREATE INDEX ai_handoff_events_handoff_time ON public.ai_handoff_events(handoff_id, occurred_at);

ALTER TABLE public.whatsapp_ai_messages
  ADD COLUMN IF NOT EXISTS message_origin text,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.whatsapp_ai_messages
SET message_origin = CASE
  WHEN direction = 'inbound' THEN 'patient'
  WHEN role = 'assistant' THEN 'ai'
  ELSE 'system'
END
WHERE message_origin IS NULL;
ALTER TABLE public.whatsapp_ai_messages
  ALTER COLUMN message_origin SET DEFAULT 'patient',
  ALTER COLUMN message_origin SET NOT NULL,
  DROP CONSTRAINT IF EXISTS whatsapp_ai_messages_origin_valid;
ALTER TABLE public.whatsapp_ai_messages
  ADD CONSTRAINT whatsapp_ai_messages_origin_valid CHECK (message_origin IN ('patient', 'ai', 'human', 'system'));

DROP TRIGGER IF EXISTS update_ai_conversation_handoffs_updated_at ON public.ai_conversation_handoffs;
CREATE TRIGGER update_ai_conversation_handoffs_updated_at
  BEFORE UPDATE ON public.ai_conversation_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_conversation_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_handoff_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views clinic handoffs" ON public.ai_conversation_handoffs
  FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));
CREATE POLICY "Staff views clinic handoff events" ON public.ai_handoff_events
  FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()), clinic_id));

REVOKE INSERT, UPDATE, DELETE ON public.ai_conversation_handoffs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_handoff_events FROM anon, authenticated;
GRANT SELECT ON public.ai_conversation_handoffs, public.ai_handoff_events TO authenticated;
GRANT ALL ON public.ai_conversation_handoffs, public.ai_handoff_events TO service_role;

-- Lifecycle columns are RPC-only for authenticated staff.
REVOKE UPDATE ON public.whatsapp_ai_conversations FROM authenticated;
GRANT UPDATE (
  lead_id, contact_name, last_inbound_at, last_outbound_at,
  last_message_at, metadata, updated_at
) ON public.whatsapp_ai_conversations TO authenticated;

CREATE OR REPLACE FUNCTION public.request_ai_conversation_handoff(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_reason text,
  p_priority text,
  p_source text,
  p_correlation_id uuid,
  p_summary jsonb DEFAULT '{}'::jsonb,
  p_description text DEFAULT NULL
) RETURNS public.ai_conversation_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_conversation public.whatsapp_ai_conversations%ROWTYPE;
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
  SELECT * INTO v_conversation FROM public.whatsapp_ai_conversations
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id = p_conversation_id AND status IN ('requested', 'queued', 'assigned', 'accepted')
  ORDER BY requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_handoff; END IF;

  INSERT INTO public.ai_conversation_handoffs (
    clinic_id, conversation_id, reason, priority, status, source, correlation_id,
    sanitized_description, summary, requested_by
  ) VALUES (
    p_clinic_id, p_conversation_id, p_reason, p_priority, 'queued', p_source, p_correlation_id,
    left(p_description, 240), COALESCE(p_summary, '{}'::jsonb), CASE WHEN v_service THEN NULL ELSE v_actor END
  ) RETURNING * INTO v_handoff;

  UPDATE public.whatsapp_ai_conversations SET
    control_mode = 'handoff_pending', active_handoff_id = v_handoff.id,
    ai_enabled = false, status = 'handoff', assigned_user_id = NULL,
    control_revision = control_revision + 1,
    conversation_state = jsonb_set(jsonb_set(conversation_state, '{lastPresentedOptions}', '[]'::jsonb, true), '{activeIntentStatus}', '"collecting"'::jsonb, true)
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id;

  INSERT INTO public.ai_handoff_events(clinic_id, conversation_id, handoff_id, action, actor_user_id, reason)
  VALUES (p_clinic_id, p_conversation_id, v_handoff.id, 'requested', CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason);
  INSERT INTO public.ai_handoff_events(clinic_id, conversation_id, handoff_id, action, actor_user_id, reason)
  VALUES (p_clinic_id, p_conversation_id, v_handoff.id, 'queued', CASE WHEN v_service THEN NULL ELSE v_actor END, p_reason);
  RETURN v_handoff;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_conversation_failure(
  p_clinic_id uuid, p_conversation_id uuid, p_correlation_id uuid,
  p_reason text, p_threshold integer DEFAULT 3
) RETURNS public.ai_conversation_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.reset_ai_conversation_failures(p_clinic_id uuid, p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE((SELECT auth.role()) = 'service_role', false) THEN
    RAISE EXCEPTION 'HANDOFF_BACKEND_ONLY' USING ERRCODE = '42501';
  END IF;
  UPDATE public.whatsapp_ai_conversations SET ai_failure_count = 0
  WHERE id = p_conversation_id AND clinic_id = p_clinic_id AND ai_failure_count <> 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.take_over_ai_conversation(p_clinic_id uuid, p_conversation_id uuid)
RETURNS public.ai_conversation_handoffs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE; v_conversation public.whatsapp_ai_conversations%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_staff(v_actor, p_clinic_id) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_conversation FROM public.whatsapp_ai_conversations WHERE id=p_conversation_id AND clinic_id=p_clinic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_handoff FROM public.ai_conversation_handoffs
  WHERE conversation_id=p_conversation_id AND status IN ('requested','queued','assigned','accepted') ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ai_conversation_handoffs(clinic_id,conversation_id,reason,priority,status,source,summary,requested_by)
    VALUES(p_clinic_id,p_conversation_id,'staff_manual_takeover','normal','queued','staff',jsonb_build_object('reason','staff_manual_takeover','knownAdministrativeContext','[]'::jsonb,'whatAuraAlreadyTried','[]'::jsonb),v_actor)
    RETURNING * INTO v_handoff;
    UPDATE public.whatsapp_ai_conversations SET active_handoff_id=v_handoff.id WHERE id=p_conversation_id;
    INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason)
    VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'requested',v_actor,'staff_manual_takeover');
  END IF;
  IF v_handoff.status='accepted' AND v_handoff.assigned_user_id=v_actor THEN RETURN v_handoff; END IF;
  IF v_handoff.assigned_user_id IS NOT NULL AND v_handoff.assigned_user_id <> v_actor AND v_handoff.status IN ('assigned','accepted') THEN
    RAISE EXCEPTION 'HANDOFF_ALREADY_ASSIGNED' USING ERRCODE='40001';
  END IF;
  UPDATE public.ai_conversation_handoffs SET status='accepted',assigned_user_id=v_actor,
    assigned_at=COALESCE(assigned_at,now()),accepted_at=COALESCE(accepted_at,now()) WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET control_mode='human_active',active_handoff_id=v_handoff.id,
    assigned_user_id=v_actor,ai_enabled=false,status='handoff',control_revision=control_revision+1 WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason)
  VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'assigned',v_actor,v_handoff.reason);
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason)
  VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'accepted',v_actor,v_handoff.reason);
  RETURN v_handoff;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_ai_conversation(p_clinic_id uuid, p_conversation_id uuid, p_target_user_id uuid)
RETURNS public.ai_conversation_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
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

CREATE OR REPLACE FUNCTION public.unassign_ai_conversation(p_clinic_id uuid, p_conversation_id uuid)
RETURNS public.ai_conversation_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
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

CREATE OR REPLACE FUNCTION public.resolve_ai_conversation_handoff(p_clinic_id uuid,p_conversation_id uuid,p_resolution text)
RETURNS public.ai_conversation_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
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

CREATE OR REPLACE FUNCTION public.authorize_human_conversation_outbound(p_clinic_id uuid,p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.whatsapp_ai_conversations c
    WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id AND c.control_mode='human_active'
      AND c.assigned_user_id=(SELECT auth.uid())
      AND public.is_clinic_staff((SELECT auth.uid()),p_clinic_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.list_ai_handoff_staff(p_clinic_id uuid)
RETURNS TABLE(user_id uuid, role public.app_role, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT r.user_id, r.role,
    'Membro da equipe ' || row_number() OVER (ORDER BY r.created_at, r.user_id)::text
  FROM public.user_roles r
  WHERE r.clinic_id=p_clinic_id AND r.is_active=true
    AND r.role IN ('admin','receptionist','professional')
    AND public.is_clinic_staff((SELECT auth.uid()),p_clinic_id)
$$;

REVOKE ALL ON FUNCTION public.request_ai_conversation_handoff(uuid,uuid,text,text,text,uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_conversation_failure(uuid,uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_ai_conversation_failures(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_ai_conversation_handoff(uuid,uuid,text,text,text,uuid,jsonb,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_conversation_failure(uuid,uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_ai_conversation_failures(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.take_over_ai_conversation(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ai_conversation(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_ai_conversation(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ai_conversation_handoff(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_human_conversation_outbound(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ai_handoff_staff(uuid) TO authenticated;

COMMENT ON COLUMN public.whatsapp_ai_conversations.control_mode IS 'Per-conversation control plane; independent from clinic ai_engine_mode.';
COMMENT ON TABLE public.ai_conversation_handoffs IS 'Operational, tenant-scoped human queue; summary contains administrative context only.';
COMMENT ON TABLE public.ai_handoff_events IS 'Content-free operational audit for handoff lifecycle and future aggregate metrics.';
