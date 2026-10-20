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
