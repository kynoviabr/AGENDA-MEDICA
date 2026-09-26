-- Canonical waitlist matching automation. Matching creates an expiring offer;
-- only an explicit patient acceptance can invoke the authoritative scheduler.

CREATE TABLE IF NOT EXISTS public.waitlist_matching_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  automation_key text NOT NULL DEFAULT 'waitlist_matching' CHECK (automation_key='waitlist_matching'),
  is_enabled boolean NOT NULL DEFAULT false,
  offer_ttl_minutes integer NOT NULL DEFAULT 30 CHECK (offer_ttl_minutes BETWEEN 5 AND 120),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel='whatsapp'),
  template_name text NOT NULL DEFAULT 'waitlist_slot_offer',
  template_language_code text NOT NULL DEFAULT 'pt_BR',
  template_status text NOT NULL DEFAULT 'unverified' CHECK (template_status IN ('unverified','approved','rejected')),
  template_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_waitlist
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.clinic_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_insurance_id uuid REFERENCES public.health_insurances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_type text,
  ADD COLUMN IF NOT EXISTS appointment_type text;

ALTER TABLE public.appointment_waitlist DROP CONSTRAINT IF EXISTS appointment_waitlist_billing_type_check;
ALTER TABLE public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_billing_type_check
  CHECK (billing_type IS NULL OR billing_type IN ('private','insurance'));
ALTER TABLE public.appointment_waitlist DROP CONSTRAINT IF EXISTS appointment_waitlist_appointment_type_check;
ALTER TABLE public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_appointment_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN ('first_visit','consultation','return_or_post_op','maintenance','procedure'));
ALTER TABLE public.appointment_waitlist DROP CONSTRAINT IF EXISTS appointment_waitlist_insurance_context_check;
ALTER TABLE public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_insurance_context_check
  CHECK (billing_type IS DISTINCT FROM 'insurance' OR health_insurance_id IS NOT NULL);

ALTER TABLE public.waitlist_notifications
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.clinic_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_insurance_id uuid REFERENCES public.health_insurances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_type text,
  ADD COLUMN IF NOT EXISTS appointment_type text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS offer_status text NOT NULL DEFAULT 'offered',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS error_category text;

UPDATE public.waitlist_notifications
SET expires_at=COALESCE(expires_at,notification_sent_at+interval '30 minutes'),
    sent_at=COALESCE(sent_at,notification_sent_at),
    offer_status=CASE action_taken
      WHEN 'accepted' THEN 'completed' WHEN 'declined' THEN 'declined'
      WHEN 'expired' THEN 'expired' ELSE 'invalidated' END
WHERE expires_at IS NULL OR sent_at IS NULL;

ALTER TABLE public.waitlist_notifications ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE public.waitlist_notifications DROP CONSTRAINT IF EXISTS waitlist_notifications_offer_status_check;
ALTER TABLE public.waitlist_notifications ADD CONSTRAINT waitlist_notifications_offer_status_check
  CHECK (offer_status IN ('offered','accepted','declined','expired','invalidated','completed'));
ALTER TABLE public.waitlist_notifications DROP CONSTRAINT IF EXISTS waitlist_notifications_duration_check;
ALTER TABLE public.waitlist_notifications ADD CONSTRAINT waitlist_notifications_duration_check
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 480);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_one_active_offer_per_slot
  ON public.waitlist_notifications(clinic_id,location_id,matched_professional_id,matched_slot_start,matched_slot_end)
  WHERE offer_status IN ('offered','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_one_active_offer_per_entry
  ON public.waitlist_notifications(waitlist_id)
  WHERE offer_status IN ('offered','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_no_retry_duplicate_offer
  ON public.waitlist_notifications(waitlist_id,location_id,matched_professional_id,matched_slot_start,matched_slot_end);
CREATE INDEX IF NOT EXISTS waitlist_offer_expiry_idx
  ON public.waitlist_notifications(expires_at) WHERE offer_status='offered';

CREATE TABLE IF NOT EXISTS public.waitlist_match_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('appointment_cancelled','appointment_rescheduled','block_removed','schedule_changed','periodic_reconciliation')),
  location_id uuid REFERENCES public.clinic_locations(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  slot_start timestamptz,
  slot_end timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_match_events_pending_idx
  ON public.waitlist_match_events(clinic_id,created_at) WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_waitlist_appointment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.status IN ('scheduled','confirmed','in_progress') AND
     (NEW.status NOT IN ('scheduled','confirmed','in_progress') OR NEW.start_time IS DISTINCT FROM OLD.start_time) THEN
    INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id,slot_start,slot_end)
    VALUES(OLD.clinic_id,CASE WHEN NEW.status='rescheduled' OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN 'appointment_rescheduled' ELSE 'appointment_cancelled' END,
      OLD.location_id,OLD.professional_id,OLD.start_time,OLD.end_time);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_waitlist_appointment_event ON public.appointments;
CREATE TRIGGER record_waitlist_appointment_event AFTER UPDATE OF status,start_time ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.record_waitlist_appointment_event();

CREATE OR REPLACE FUNCTION public.record_waitlist_block_removed_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id,professional_id,slot_start,slot_end)
  VALUES(OLD.clinic_id,'block_removed',OLD.location_id,OLD.professional_id,OLD.start_at,OLD.end_at);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS record_waitlist_block_removed_event ON public.appointment_blocks;
CREATE TRIGGER record_waitlist_block_removed_event AFTER DELETE ON public.appointment_blocks
FOR EACH ROW EXECUTE FUNCTION public.record_waitlist_block_removed_event();

CREATE OR REPLACE FUNCTION public.record_waitlist_schedule_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
DROP TRIGGER IF EXISTS record_waitlist_schedule_event ON public.professional_availability;
CREATE TRIGGER record_waitlist_schedule_event AFTER INSERT OR UPDATE OR DELETE ON public.professional_availability
FOR EACH ROW EXECUTE FUNCTION public.record_waitlist_schedule_event();

CREATE OR REPLACE FUNCTION public.record_waitlist_location_schedule_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.waitlist_match_events(clinic_id,event_type,location_id)
  VALUES(NEW.clinic_id,'schedule_changed',NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_waitlist_location_schedule_event ON public.clinic_locations;
CREATE TRIGGER record_waitlist_location_schedule_event AFTER UPDATE OF opening_hours,active ON public.clinic_locations
FOR EACH ROW WHEN (NEW.opening_hours IS DISTINCT FROM OLD.opening_hours OR NEW.active IS DISTINCT FROM OLD.active)
EXECUTE FUNCTION public.record_waitlist_location_schedule_event();

CREATE OR REPLACE FUNCTION public.record_waitlist_exception_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
DROP TRIGGER IF EXISTS record_waitlist_exception_event ON public.scheduling_exceptions;
CREATE TRIGGER record_waitlist_exception_event AFTER INSERT OR UPDATE OR DELETE ON public.scheduling_exceptions
FOR EACH ROW EXECUTE FUNCTION public.record_waitlist_exception_event();

CREATE OR REPLACE FUNCTION public.invalidate_waitlist_active_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status IN ('expired','cancelled_by_patient','cancelled_by_clinic','scheduled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.waitlist_notifications SET offer_status='invalidated',invalidated_at=now(),result_code='waitlist_inactive'
    WHERE waitlist_id=NEW.id AND clinic_id=NEW.clinic_id AND offer_status IN ('offered','accepted');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invalidate_waitlist_active_offer ON public.appointment_waitlist;
CREATE TRIGGER invalidate_waitlist_active_offer AFTER UPDATE OF status ON public.appointment_waitlist
FOR EACH ROW EXECUTE FUNCTION public.invalidate_waitlist_active_offer();

CREATE OR REPLACE FUNCTION public.expire_waitlist_offers(p_clinic_id uuid DEFAULT NULL,p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION public.claim_waitlist_offer(
  p_clinic_id uuid,p_waitlist_id uuid,p_location_id uuid,p_professional_id uuid,
  p_slot_start timestamptz,p_slot_end timestamptz,p_duration_minutes integer,p_now timestamptz DEFAULT now()
) RETURNS SETOF public.waitlist_notifications
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION public.respond_waitlist_offer(
  p_clinic_id uuid,p_phone text,p_response text,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
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

ALTER TABLE public.waitlist_matching_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic staff view waitlist matching settings" ON public.waitlist_matching_settings;
CREATE POLICY "clinic staff view waitlist matching settings" ON public.waitlist_matching_settings FOR SELECT TO authenticated
USING(public.is_clinic_staff(auth.uid(),clinic_id));
DROP POLICY IF EXISTS "clinic admins manage waitlist matching settings" ON public.waitlist_matching_settings;
CREATE POLICY "clinic admins manage waitlist matching settings" ON public.waitlist_matching_settings FOR ALL TO authenticated
USING(public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin')) WITH CHECK(public.has_clinic_role((SELECT auth.uid()),clinic_id,'admin'));
DROP POLICY IF EXISTS "clinic staff view waitlist matching events" ON public.waitlist_match_events;
CREATE POLICY "clinic staff view waitlist matching events" ON public.waitlist_match_events FOR SELECT TO authenticated
USING(public.is_clinic_staff(auth.uid(),clinic_id));

DROP TRIGGER IF EXISTS update_waitlist_matching_settings_updated_at ON public.waitlist_matching_settings;
CREATE TRIGGER update_waitlist_matching_settings_updated_at BEFORE UPDATE ON public.waitlist_matching_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON FUNCTION public.expire_waitlist_offers(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_offer(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.respond_waitlist_offer(uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_offers(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_offer(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_waitlist_offer(uuid,text,text,timestamptz) TO service_role;

COMMENT ON TABLE public.waitlist_notifications IS 'Canonical waitlist offer ledger. A match never creates an appointment; completed requires explicit acceptance and authoritative revalidation.';
COMMENT ON TABLE public.waitlist_match_events IS 'Explicit availability hints. They trigger reconciliation only; SchedulingService remains authoritative.';
