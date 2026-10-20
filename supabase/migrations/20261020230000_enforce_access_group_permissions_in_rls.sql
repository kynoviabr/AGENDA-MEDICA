-- Enforce access-group permissions in RLS for clinical and commercial data.
--
-- Until now these tables only required is_clinic_staff(), so any active team
-- member could read patients, appointments, leads and WhatsApp conversations
-- through the Data API regardless of their access group; groups only hid menu
-- items. Each table now also requires at least one of the menu permissions
-- whose screens need that data. Admins always pass.
--
-- The dashboard is visible to every group, so it reads its appointment and
-- waitlist rows through get_clinic_dashboard_data(), which returns patient and
-- lead names only to members who may see them.

-- 1. Permission helper
CREATE OR REPLACE FUNCTION public.has_any_menu_access(_user_id uuid, _clinic_id uuid, _permission_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_clinic_staff(_user_id, _clinic_id)
    AND (
      public.has_clinic_role(_user_id, _clinic_id, 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.user_access_groups uag
        JOIN public.access_groups ag ON ag.id = uag.group_id AND ag.status = 'active'
        JOIN public.access_group_permissions agp ON agp.group_id = uag.group_id
        WHERE uag.clinic_id = _clinic_id
          AND uag.user_id = _user_id
          AND uag.is_active
          AND agp.clinic_id = _clinic_id
          AND agp.can_view
          AND agp.permission_key = ANY (_permission_keys)
      )
    )
$$;

REVOKE ALL ON FUNCTION public.has_any_menu_access(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_menu_access(uuid, uuid, text[]) TO authenticated, service_role;


-- 2. Patients: patients, agenda and CRM screens show patient data
DROP POLICY IF EXISTS "Staff views clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Staff creates patients" ON public.patients;
DROP POLICY IF EXISTS "Staff updates patients" ON public.patients;

CREATE POLICY "Staff views clinic patients" ON public.patients FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['patients.view', 'appointments.view', 'crm.view']));
CREATE POLICY "Staff creates patients" ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['patients.view', 'appointments.view', 'crm.view']));
CREATE POLICY "Staff updates patients" ON public.patients FOR UPDATE TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['patients.view', 'appointments.view', 'crm.view']));


-- 3. Appointments and related agenda data: agenda, patient history and CRM funnel
DROP POLICY IF EXISTS "Staff views appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff creates appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff updates appointments" ON public.appointments;

CREATE POLICY "Staff views appointments" ON public.appointments FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));
CREATE POLICY "Staff creates appointments" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));
CREATE POLICY "Staff updates appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));

DROP POLICY IF EXISTS "clinic staff can view appointment_reminders" ON public.appointment_reminders;
CREATE POLICY "clinic staff can view appointment_reminders" ON public.appointment_reminders FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));

DROP POLICY IF EXISTS "Staff views appointment blocks" ON public.appointment_blocks;
CREATE POLICY "Staff views appointment blocks" ON public.appointment_blocks FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));

DROP POLICY IF EXISTS "clinic staff can manage appointment_waitlist" ON public.appointment_waitlist;
CREATE POLICY "clinic staff can manage appointment_waitlist" ON public.appointment_waitlist TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']))
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['appointments.view', 'patients.view', 'crm.view']));


-- 4. Leads: CRM, WhatsApp IA and agenda create and read leads
DROP POLICY IF EXISTS "Staff views leads" ON public.leads;
DROP POLICY IF EXISTS "Staff creates leads" ON public.leads;
DROP POLICY IF EXISTS "Staff updates leads" ON public.leads;

CREATE POLICY "Staff views leads" ON public.leads FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));
CREATE POLICY "Staff creates leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));
CREATE POLICY "Staff updates leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));

DROP POLICY IF EXISTS "Staff views lead interactions" ON public.lead_interactions;
DROP POLICY IF EXISTS "Staff creates lead interactions" ON public.lead_interactions;
CREATE POLICY "Staff views lead interactions" ON public.lead_interactions FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));
CREATE POLICY "Staff creates lead interactions" ON public.lead_interactions FOR INSERT TO authenticated
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));

DROP POLICY IF EXISTS "Staff views lead stage history" ON public.lead_stage_history;
DROP POLICY IF EXISTS "Staff creates lead stage history" ON public.lead_stage_history;
CREATE POLICY "Staff views lead stage history" ON public.lead_stage_history FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));
CREATE POLICY "Staff creates lead stage history" ON public.lead_stage_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['crm.view', 'whatsapp_ai.view', 'appointments.view']));


-- 5. WhatsApp IA conversations: only the WhatsApp IA screen
DROP POLICY IF EXISTS "Staff views whatsapp ai conversations" ON public.whatsapp_ai_conversations;
DROP POLICY IF EXISTS "Staff updates whatsapp ai conversations" ON public.whatsapp_ai_conversations;
CREATE POLICY "Staff views whatsapp ai conversations" ON public.whatsapp_ai_conversations FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['whatsapp_ai.view']));
CREATE POLICY "Staff updates whatsapp ai conversations" ON public.whatsapp_ai_conversations FOR UPDATE TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['whatsapp_ai.view']))
  WITH CHECK (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['whatsapp_ai.view']));

DROP POLICY IF EXISTS "Staff views whatsapp ai messages" ON public.whatsapp_ai_messages;
CREATE POLICY "Staff views whatsapp ai messages" ON public.whatsapp_ai_messages FOR SELECT TO authenticated
  USING (public.has_any_menu_access((SELECT auth.uid()), clinic_id, ARRAY['whatsapp_ai.view']));


-- 6. Dashboard data for every group, names only for members allowed to see them
CREATE OR REPLACE FUNCTION public.get_clinic_dashboard_data(p_clinic_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_show_names boolean;
BEGIN
  IF NOT public.has_any_menu_access(v_uid, p_clinic_id, ARRAY['dashboard.view']) THEN
    RAISE EXCEPTION 'DASHBOARD_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_show_names := public.has_any_menu_access(v_uid, p_clinic_id, ARRAY['patients.view', 'appointments.view', 'crm.view']);

  RETURN jsonb_build_object(
    'appointments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'patient_id', a.patient_id,
        'professional_id', a.professional_id,
        'start_time', a.start_time,
        'status', a.status,
        'billing_type', a.billing_type,
        'health_insurance_name', hi.name
      ))
      FROM public.appointments a
      LEFT JOIN public.health_insurances hi ON hi.id = a.health_insurance_id
      WHERE a.clinic_id = p_clinic_id
        AND a.status::text IN ('scheduled', 'confirmed', 'in_progress', 'completed')
        AND a.start_time BETWEEN p_start AND p_end
    ), '[]'::jsonb),
    'waitlist', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id,
        'preferred_professional_id', w.preferred_professional_id,
        'priority', w.priority,
        'status', w.status,
        'created_at', w.created_at,
        'patient_name', CASE WHEN v_show_names THEN p.full_name END,
        'lead_name', CASE WHEN v_show_names THEN l.full_name END,
        'treatment_name', t.name
      ) ORDER BY w.priority DESC, w.created_at ASC)
      FROM public.appointment_waitlist w
      LEFT JOIN public.patients p ON p.id = w.patient_id
      LEFT JOIN public.leads l ON l.id = w.lead_id
      LEFT JOIN public.treatments t ON t.id = w.treatment_id
      WHERE w.clinic_id = p_clinic_id
        AND w.status::text IN ('waiting', 'match_found', 'contact_attempted')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_dashboard_data(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_dashboard_data(uuid, timestamptz, timestamptz) TO authenticated, service_role;


-- 7. WhatsApp IA handoff RPCs bypass RLS (SECURITY DEFINER), so they check the
--    same whatsapp_ai.view permission as the conversation tables. Bodies are
--    unchanged apart from that check.
CREATE OR REPLACE FUNCTION public.authorize_human_conversation_outbound(p_clinic_id uuid, p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.whatsapp_ai_conversations c
    WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id AND c.control_mode='human_active'
      AND c.assigned_user_id=(SELECT auth.uid())
      AND public.has_any_menu_access((SELECT auth.uid()), p_clinic_id, ARRAY['whatsapp_ai.view'])
  )
$function$

;

CREATE OR REPLACE FUNCTION public.request_ai_conversation_handoff(p_clinic_id uuid, p_conversation_id uuid, p_reason text, p_priority text, p_source text, p_correlation_id uuid, p_summary jsonb DEFAULT '{}'::jsonb, p_description text DEFAULT NULL::text)
 RETURNS ai_conversation_handoffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
  v_service boolean := COALESCE((SELECT auth.role()) = 'service_role', false);
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT v_service AND NOT public.has_any_menu_access(v_actor, p_clinic_id, ARRAY['whatsapp_ai.view']) THEN
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
$function$

;

CREATE OR REPLACE FUNCTION public.resolve_ai_conversation_handoff(p_clinic_id uuid, p_conversation_id uuid, p_resolution text)
 RETURNS ai_conversation_handoffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE; v_return boolean:=p_resolution='returned_to_ai';
BEGIN
  IF NOT public.has_any_menu_access(v_actor, p_clinic_id, ARRAY['whatsapp_ai.view']) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
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
END; $function$

;

CREATE OR REPLACE FUNCTION public.take_over_ai_conversation(p_clinic_id uuid, p_conversation_id uuid)
 RETURNS ai_conversation_handoffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.has_any_menu_access(v_actor, p_clinic_id, ARRAY['whatsapp_ai.view']) THEN
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
$function$

;

CREATE OR REPLACE FUNCTION public.transfer_ai_conversation(p_clinic_id uuid, p_conversation_id uuid, p_target_user_id uuid)
 RETURNS ai_conversation_handoffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.has_any_menu_access(v_actor, p_clinic_id, ARRAY['whatsapp_ai.view']) OR NOT public.has_any_menu_access(p_target_user_id, p_clinic_id, ARRAY['whatsapp_ai.view']) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT h.* INTO v_handoff FROM public.ai_conversation_handoffs h JOIN public.whatsapp_ai_conversations c ON c.active_handoff_id=h.id
  WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id AND c.control_mode='human_active' FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_ACTIVE' USING ERRCODE='P0002'; END IF;
  IF v_handoff.assigned_user_id<>v_actor AND NOT public.has_clinic_role(v_actor,p_clinic_id,'admin') THEN RAISE EXCEPTION 'HANDOFF_NOT_OWNER' USING ERRCODE='42501'; END IF;
  UPDATE public.ai_conversation_handoffs SET assigned_user_id=p_target_user_id,status='assigned',assigned_at=now(),accepted_at=NULL WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET control_mode='handoff_pending',assigned_user_id=p_target_user_id,control_revision=control_revision+1 WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason) VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'transferred',v_actor,v_handoff.reason);
  RETURN v_handoff;
END; $function$

;

CREATE OR REPLACE FUNCTION public.unassign_ai_conversation(p_clinic_id uuid, p_conversation_id uuid)
 RETURNS ai_conversation_handoffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_handoff public.ai_conversation_handoffs%ROWTYPE;
BEGIN
  IF NOT public.has_any_menu_access(v_actor, p_clinic_id, ARRAY['whatsapp_ai.view']) THEN RAISE EXCEPTION 'HANDOFF_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT h.* INTO v_handoff FROM public.ai_conversation_handoffs h JOIN public.whatsapp_ai_conversations c ON c.active_handoff_id=h.id
  WHERE c.id=p_conversation_id AND c.clinic_id=p_clinic_id FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'HANDOFF_NOT_ACTIVE' USING ERRCODE='P0002'; END IF;
  IF v_handoff.assigned_user_id<>v_actor AND NOT public.has_clinic_role(v_actor,p_clinic_id,'admin') THEN RAISE EXCEPTION 'HANDOFF_NOT_OWNER' USING ERRCODE='42501'; END IF;
  UPDATE public.ai_conversation_handoffs SET assigned_user_id=NULL,status='queued',assigned_at=NULL,accepted_at=NULL WHERE id=v_handoff.id RETURNING * INTO v_handoff;
  UPDATE public.whatsapp_ai_conversations SET control_mode='handoff_pending',assigned_user_id=NULL,control_revision=control_revision+1 WHERE id=p_conversation_id;
  INSERT INTO public.ai_handoff_events(clinic_id,conversation_id,handoff_id,action,actor_user_id,reason) VALUES(p_clinic_id,p_conversation_id,v_handoff.id,'unassigned',v_actor,v_handoff.reason);
  RETURN v_handoff;
END; $function$

;

