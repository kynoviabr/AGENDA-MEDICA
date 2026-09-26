-- Hosted-project bootstrap defaults can grant every table privilege directly
-- to anon/authenticated before the Aura DDL runs. RLS remains enabled, but the
-- object ACL must also be least-privilege (including no TRUNCATE/TRIGGER).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_ai_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.appointments TO authenticated;
GRANT SELECT ON TABLE public.appointment_reminders TO authenticated;
GRANT SELECT ON TABLE public.daily_agenda_summary_executions TO authenticated;
GRANT SELECT ON TABLE public.ai_conversation_handoffs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.administrative_knowledge_entries TO authenticated;
GRANT SELECT ON TABLE public.ai_admin_action_events TO authenticated;
GRANT SELECT ON TABLE public.ai_handoff_events TO authenticated;
GRANT SELECT ON TABLE public.ai_knowledge_answer_events TO authenticated;
GRANT SELECT ON TABLE public.ai_operational_events TO authenticated;
GRANT SELECT ON TABLE public.ai_safety_events TO authenticated;
GRANT SELECT ON TABLE public.ai_tool_execution_events TO authenticated;
GRANT SELECT ON TABLE public.ai_usage_events TO authenticated;
GRANT SELECT ON TABLE public.appointment_blocks TO authenticated;
GRANT SELECT ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (clinic_id) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (is_enabled), UPDATE (is_enabled) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (preferred_send_time), UPDATE (preferred_send_time) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (template_name), UPDATE (template_name) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (template_language_code), UPDATE (template_language_code) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (location_id), UPDATE (location_id) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (professional_id), UPDATE (professional_id) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT INSERT (automation_key) ON TABLE public.appointment_reminder_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinic_administrative_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinic_locations TO authenticated;
GRANT SELECT ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (clinic_id) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (is_enabled), UPDATE (is_enabled) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (send_time), UPDATE (send_time) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (send_when_empty), UPDATE (send_when_empty) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (template_name), UPDATE (template_name) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (template_language_code), UPDATE (template_language_code) ON TABLE public.daily_agenda_summary_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.health_insurances TO authenticated;
GRANT SELECT ON TABLE public.leads TO authenticated;
GRANT SELECT ON TABLE public.patients TO authenticated;
GRANT SELECT ON TABLE public.professional_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.professional_health_insurances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.professional_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.professional_settings TO authenticated;
GRANT SELECT ON TABLE public.professional_treatments TO authenticated;
GRANT SELECT ON TABLE public.professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_connection_professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_insurance_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_location_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_professional_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_provider_connections TO authenticated;
GRANT SELECT ON TABLE public.scheduling_provider_events TO authenticated;
GRANT SELECT ON TABLE public.scheduling_reconciliation_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduling_service_mappings TO authenticated;
GRANT SELECT ON TABLE public.treatments TO authenticated;
GRANT SELECT ON TABLE public.whatsapp_ai_conversations TO authenticated;
GRANT UPDATE (lead_id, contact_name, last_inbound_at, last_outbound_at, last_message_at, metadata, updated_at)
  ON TABLE public.whatsapp_ai_conversations TO authenticated;
GRANT SELECT ON TABLE public.whatsapp_ai_messages TO authenticated;
GRANT SELECT (
  id, clinic_id, waba_id, phone_number_id, display_phone_number,
  business_name, status, token_expires_at, connected_by, connected_at,
  disconnected_at, metadata, created_at, updated_at
) ON TABLE public.whatsapp_connections TO authenticated;

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
