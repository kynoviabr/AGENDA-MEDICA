-- Canonical appointment_reminder_7d automation.
-- Extends the existing reminder queue; no parallel delivery log is created.

CREATE TABLE public.appointment_reminder_7d_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  preferred_send_time time NOT NULL DEFAULT '10:00',
  template_name text NOT NULL DEFAULT 'appointment_reminder_7d'
    CHECK (template_name ~ '^[a-z0-9_]{1,512}$'),
  template_language_code text NOT NULL DEFAULT 'pt_BR'
    CHECK (template_language_code ~ '^[a-z]{2}_[A-Z]{2}$'),
  template_status text NOT NULL DEFAULT 'unverified'
    CHECK (template_status IN ('unverified','approved','rejected')),
  template_verified_at timestamptz,
  location_id uuid REFERENCES public.clinic_locations(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_enabled OR template_status = 'approved')
);

CREATE INDEX appointment_reminder_7d_settings_enabled
  ON public.appointment_reminder_7d_settings (clinic_id)
  WHERE is_enabled;

CREATE OR REPLACE FUNCTION public.validate_appointment_reminder_7d_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
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

CREATE TRIGGER validate_appointment_reminder_7d_settings
  BEFORE INSERT OR UPDATE ON public.appointment_reminder_7d_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_reminder_7d_settings();

ALTER TABLE public.appointment_reminder_7d_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views 7d reminder settings" ON public.appointment_reminder_7d_settings
  FOR SELECT TO authenticated USING (public.is_clinic_staff((SELECT auth.uid()),clinic_id));
CREATE POLICY "Admin manages 7d reminder settings" ON public.appointment_reminder_7d_settings
  FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin'));
REVOKE ALL ON public.appointment_reminder_7d_settings FROM anon,authenticated;
GRANT SELECT ON public.appointment_reminder_7d_settings TO authenticated;
GRANT INSERT (clinic_id,is_enabled,preferred_send_time,template_name,template_language_code,location_id,professional_id)
  ON public.appointment_reminder_7d_settings TO authenticated;
GRANT UPDATE (is_enabled,preferred_send_time,template_name,template_language_code,location_id,professional_id)
  ON public.appointment_reminder_7d_settings TO authenticated;
GRANT ALL ON public.appointment_reminder_7d_settings TO service_role;

ALTER TABLE public.appointment_reminders
  ADD COLUMN automation_key text,
  ADD COLUMN appointment_start_time timestamptz,
  ADD COLUMN executed_at timestamptz,
  ADD COLUMN skip_reason text,
  ADD COLUMN error_category text,
  ADD COLUMN processing_started_at timestamptz,
  ADD COLUMN delivery_attempted_at timestamptz,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN provider_message_id text,
  ADD COLUMN template_name text;

ALTER TABLE public.appointment_reminders
  ADD CONSTRAINT appointment_reminders_automation_key_check
  CHECK (automation_key IS NULL OR automation_key IN ('appointment_reminder_7d')),
  ADD CONSTRAINT appointment_reminders_skip_reason_check
  CHECK (skip_reason IS NULL OR skip_reason IN (
    'appointment_cancelled','appointment_rescheduled','automation_disabled','already_sent',
    'patient_without_whatsapp','template_unavailable','outside_scope','appointment_ineligible'
  ));

CREATE UNIQUE INDEX appointment_reminders_automation_version_unique
  ON public.appointment_reminders (clinic_id,automation_key,appointment_id,appointment_start_time,channel)
  WHERE automation_key IS NOT NULL;
CREATE INDEX appointment_reminders_7d_due
  ON public.appointment_reminders (scheduled_for,created_at)
  WHERE automation_key='appointment_reminder_7d' AND status='pending';

-- Execution rows are backend-owned. Staff keep read-only audit access.
DROP POLICY IF EXISTS "clinic staff can manage appointment_reminders" ON public.appointment_reminders;
CREATE POLICY "clinic staff can view appointment_reminders" ON public.appointment_reminders
  FOR SELECT TO authenticated USING (public.is_clinic_staff((SELECT auth.uid()),clinic_id));
REVOKE INSERT,UPDATE,DELETE ON public.appointment_reminders FROM authenticated,anon;
GRANT SELECT ON public.appointment_reminders TO authenticated;
GRANT ALL ON public.appointment_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_stale_appointment_reminder_7d()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('cancelled','no_show') OR NEW.is_tombstone THEN
    UPDATE public.appointment_reminders SET status='cancelled',executed_at=now(),
      skip_reason='appointment_cancelled',processing_started_at=NULL
    WHERE appointment_id=NEW.id AND clinic_id=NEW.clinic_id
      AND automation_key='appointment_reminder_7d' AND status IN ('pending','failed') AND sent_at IS NULL;
  ELSIF NEW.status='rescheduled' OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    UPDATE public.appointment_reminders SET status='cancelled',executed_at=now(),
      skip_reason='appointment_rescheduled',processing_started_at=NULL
    WHERE appointment_id=NEW.id AND clinic_id=NEW.clinic_id
      AND automation_key='appointment_reminder_7d' AND status IN ('pending','failed') AND sent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cancel_stale_appointment_reminder_7d() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cancel_stale_appointment_reminder_7d
  AFTER UPDATE OF start_time,status,is_tombstone ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.cancel_stale_appointment_reminder_7d();

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminder_7d(
  p_clinic_id uuid DEFAULT NULL, p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 500
) RETURNS TABLE(queued integer,cancelled integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_queued integer:=0; v_cancelled integer:=0;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_limit<1 OR p_limit>2000 THEN RAISE EXCEPTION 'AUTOMATION_LIMIT_INVALID' USING ERRCODE='22023'; END IF;

  UPDATE public.appointment_reminders r SET status='cancelled',executed_at=p_now,
    skip_reason=CASE WHEN a.status='rescheduled' OR a.start_time IS DISTINCT FROM r.appointment_start_time
      THEN 'appointment_rescheduled' ELSE 'appointment_cancelled' END, processing_started_at=NULL
  FROM public.appointments a
  WHERE r.appointment_id=a.id AND r.clinic_id=a.clinic_id
    AND r.automation_key='appointment_reminder_7d' AND r.status IN ('pending','failed') AND r.sent_at IS NULL
    AND (p_clinic_id IS NULL OR r.clinic_id=p_clinic_id)
    AND (a.status NOT IN ('scheduled','confirmed') OR a.is_tombstone OR a.start_time IS DISTINCT FROM r.appointment_start_time);
  GET DIAGNOSTICS v_cancelled=ROW_COUNT;

  WITH candidates AS (
    SELECT a.*,s.preferred_send_time,s.template_name,
      (((a.start_time AT TIME ZONE l.timezone)::date-7 + s.preferred_send_time) AT TIME ZONE l.timezone) due_at,
      CASE
        WHEN s.location_id IS NOT NULL AND s.location_id<>a.location_id THEN 'outside_scope'
        WHEN s.professional_id IS NOT NULL AND s.professional_id<>a.professional_id THEN 'outside_scope'
        WHEN COALESCE(p.phone,lead.phone,'')='' THEN 'patient_without_whatsapp'
        WHEN wc.id IS NULL OR s.template_status<>'approved' THEN 'template_unavailable'
        ELSE NULL END initial_skip_reason
    FROM public.appointments a
    JOIN public.appointment_reminder_7d_settings s ON s.clinic_id=a.clinic_id AND s.is_enabled
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
      'appointment_reminder_7d',start_time,initial_skip_reason,
      CASE WHEN initial_skip_reason IS NULL THEN NULL ELSE p_now END,template_name,
      jsonb_build_object('automation_key','appointment_reminder_7d')
    FROM due ON CONFLICT DO NOTHING RETURNING 1
  ) SELECT count(*)::integer INTO v_queued FROM inserted;
  RETURN QUERY SELECT v_queued,v_cancelled;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_appointment_reminder_7d(uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminder_7d(uuid,timestamptz,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_appointment_reminder_7d(
  p_clinic_id uuid DEFAULT NULL, p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 50
) RETURNS SETOF public.appointment_reminders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY WITH claimable AS (
    SELECT r.id FROM public.appointment_reminders r
    WHERE r.automation_key='appointment_reminder_7d' AND r.status='pending'
      AND r.scheduled_for<=p_now AND r.sent_at IS NULL AND r.delivery_attempted_at IS NULL
      AND (r.processing_started_at IS NULL OR r.processing_started_at<p_now-interval '15 minutes')
      AND (p_clinic_id IS NULL OR r.clinic_id=p_clinic_id)
    ORDER BY r.scheduled_for,r.created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,200))
  ) UPDATE public.appointment_reminders r SET processing_started_at=p_now,
      delivery_attempted_at=p_now,attempt_count=r.attempt_count+1
    FROM claimable c WHERE r.id=c.id RETURNING r.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_appointment_reminder_7d(uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_appointment_reminder_7d(uuid,timestamptz,integer) TO service_role;

COMMENT ON TABLE public.appointment_reminder_7d_settings IS 'Tenant-scoped configuration for the canonical 7-day appointment reminder.';
COMMENT ON FUNCTION public.claim_appointment_reminder_7d(uuid,timestamptz,integer) IS 'Atomic at-most-once claim. delivery_attempted_at prevents blind resend after an uncertain provider outcome.';
