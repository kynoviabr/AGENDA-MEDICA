-- Split internal claim from external delivery attempt.
-- A crash before provider I/O is recoverable; after provider I/O starts, at-most-once is preserved.

CREATE OR REPLACE FUNCTION public.claim_appointment_reminders(
  p_automation_key text DEFAULT NULL,p_clinic_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 50
) RETURNS SETOF public.appointment_reminders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION public.mark_appointment_reminder_delivery_attempt(
  p_reminder_id uuid,p_clinic_id uuid,p_now timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.mark_appointment_reminder_delivery_attempt(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_reminder_delivery_attempt(uuid,uuid,timestamptz) TO service_role;

COMMENT ON FUNCTION public.mark_appointment_reminder_delivery_attempt(uuid,uuid,timestamptz) IS
  'Atomic boundary immediately before provider I/O; prevents blind retry after an uncertain external outcome.';
