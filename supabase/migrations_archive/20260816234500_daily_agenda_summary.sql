-- Canonical daily_agenda_summary. One tenant-scoped execution per professional/local day.

CREATE TABLE public.daily_agenda_summary_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  automation_key text NOT NULL DEFAULT 'daily_agenda_summary' CHECK (automation_key='daily_agenda_summary'),
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '07:00',
  send_when_empty boolean NOT NULL DEFAULT false,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel='whatsapp'),
  template_name text NOT NULL DEFAULT 'daily_agenda_summary' CHECK (template_name ~ '^[a-z0-9_]{1,512}$'),
  template_language_code text NOT NULL DEFAULT 'pt_BR' CHECK (template_language_code ~ '^[a-z]{2}_[A-Z]{2}$'),
  template_status text NOT NULL DEFAULT 'unverified' CHECK (template_status IN ('unverified','approved','rejected')),
  template_verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_enabled OR template_status='approved')
);

CREATE OR REPLACE FUNCTION public.validate_daily_agenda_summary_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.template_name,NEW.template_language_code) IS DISTINCT FROM (OLD.template_name,OLD.template_language_code) THEN
    NEW.template_status:='unverified'; NEW.template_verified_at:=NULL; NEW.is_enabled:=false;
  END IF;
  IF (SELECT auth.uid()) IS NOT NULL THEN NEW.updated_by:=(SELECT auth.uid()); END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;
CREATE TRIGGER validate_daily_agenda_summary_settings BEFORE INSERT OR UPDATE ON public.daily_agenda_summary_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_daily_agenda_summary_settings();

ALTER TABLE public.daily_agenda_summary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views daily agenda summary settings" ON public.daily_agenda_summary_settings FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()),clinic_id));
CREATE POLICY "Admin manages daily agenda summary settings" ON public.daily_agenda_summary_settings FOR ALL TO authenticated
  USING (public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin'))
  WITH CHECK (public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin'));
REVOKE ALL ON public.daily_agenda_summary_settings FROM anon,authenticated;
GRANT SELECT ON public.daily_agenda_summary_settings TO authenticated;
GRANT INSERT (clinic_id,is_enabled,send_time,send_when_empty,template_name,template_language_code) ON public.daily_agenda_summary_settings TO authenticated;
GRANT UPDATE (is_enabled,send_time,send_when_empty,template_name,template_language_code) ON public.daily_agenda_summary_settings TO authenticated;
GRANT ALL ON public.daily_agenda_summary_settings TO service_role;

CREATE TABLE public.daily_agenda_summary_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  automation_key text NOT NULL DEFAULT 'daily_agenda_summary' CHECK (automation_key='daily_agenda_summary'),
  local_date date NOT NULL,
  timezone text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','skipped','failed')),
  skip_reason text CHECK (skip_reason IS NULL OR skip_reason IN ('automation_disabled','professional_inactive','professional_without_whatsapp','no_appointments_today','template_unavailable','already_sent')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  processing_started_at timestamptz,
  delivery_attempted_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  executed_at timestamptz,
  error_category text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id,professional_id,automation_key,local_date)
);
CREATE INDEX daily_agenda_summary_due ON public.daily_agenda_summary_executions(scheduled_for,created_at)
  WHERE status IN ('pending','processing') AND sent_at IS NULL;
ALTER TABLE public.daily_agenda_summary_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views daily agenda summary executions" ON public.daily_agenda_summary_executions FOR SELECT TO authenticated
  USING (public.is_clinic_staff((SELECT auth.uid()),clinic_id));
REVOKE ALL ON public.daily_agenda_summary_executions FROM anon,authenticated;
GRANT SELECT ON public.daily_agenda_summary_executions TO authenticated;
GRANT ALL ON public.daily_agenda_summary_executions TO service_role;
CREATE TRIGGER update_daily_agenda_summary_executions_updated_at BEFORE UPDATE ON public.daily_agenda_summary_executions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_daily_agenda_summaries(
  p_clinic_id uuid DEFAULT NULL,p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 2000
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.enqueue_daily_agenda_summaries(uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_agenda_summaries(uuid,timestamptz,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_daily_agenda_summaries(
  p_clinic_id uuid DEFAULT NULL,p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 100
) RETURNS SETOF public.daily_agenda_summary_executions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.claim_daily_agenda_summaries(uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_agenda_summaries(uuid,timestamptz,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_daily_agenda_summary_delivery_attempt(
  p_id uuid,p_clinic_id uuid,p_now timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_updated integer;
BEGIN
  IF NOT COALESCE((SELECT auth.role())='service_role',false) THEN RAISE EXCEPTION 'AUTOMATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE public.daily_agenda_summary_executions SET delivery_attempted_at=p_now
  WHERE id=p_id AND clinic_id=p_clinic_id AND status='processing' AND sent_at IS NULL AND delivery_attempted_at IS NULL;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated=1;
END $$;
REVOKE ALL ON FUNCTION public.mark_daily_agenda_summary_delivery_attempt(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_daily_agenda_summary_delivery_attempt(uuid,uuid,timestamptz) TO service_role;

COMMENT ON TABLE public.daily_agenda_summary_executions IS 'Technical audit only; message body and recipient PII are intentionally not stored.';
COMMENT ON FUNCTION public.claim_daily_agenda_summaries(uuid,timestamptz,integer) IS 'Atomic SKIP LOCKED claim with stale recovery only before an external delivery attempt.';
