-- New hosted projects can grant EXECUTE directly to anon/authenticated through
-- platform default privileges. Rebuild the function ACL from the reviewed
-- local contract so service-only routines are not exposed through Data API.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.administrative_text_array_is_valid(text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_appointment_slot(uuid, uuid, uuid, uuid, timestamp with time zone, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_human_conversation_outbound(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_secure(uuid, uuid, text, public.appointment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_secure(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_type_secure(uuid, uuid, uuid, uuid, uuid, uuid, timestamp with time zone, text, text, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.determine_patient_appointment_type(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_aura_operational_metrics(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_aura_pilot_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots_for_appointment_type(uuid, uuid, uuid, uuid, date, date, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_working_periods(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_operating_periods(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_working_periods(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_restriction_reason(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_clinic_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_clinic_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_menu_access(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinic_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.location_opening_hours_are_valid(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_appointment_professional_secure(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_ai_conversation_handoff(uuid, uuid, text, text, text, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_secure(uuid, uuid, timestamp with time zone, uuid, uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ai_conversation_handoff(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_duration(uuid, uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_appointment_type_terms(uuid, uuid, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_crm_stage_settings(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_periods_are_valid(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_over_ai_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ai_conversation(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_appointment_status_secure(uuid, uuid, public.appointment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_ai_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_clinic(uuid, uuid) TO authenticated;
