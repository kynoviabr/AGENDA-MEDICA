CREATE TABLE public.professional_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE CASCADE,
 allow_ai_booking boolean NOT NULL DEFAULT false, allow_ai_cancellation boolean NOT NULL DEFAULT false,
 allow_ai_rescheduling boolean NOT NULL DEFAULT false, allow_waitlist boolean NOT NULL DEFAULT true,
 accept_new_patients boolean NOT NULL DEFAULT true, minimum_booking_notice_hours integer NOT NULL DEFAULT 2 CHECK(minimum_booking_notice_hours>=0),
 maximum_booking_days integer NOT NULL DEFAULT 90 CHECK(maximum_booking_days>0), cancellation_notice_hours integer NOT NULL DEFAULT 24 CHECK(cancellation_notice_hours>=0),
 default_appointment_duration_minutes integer NOT NULL DEFAULT 30 CHECK(default_appointment_duration_minutes BETWEEN 5 AND 480),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professional_settings_clinic ON public.professional_settings(clinic_id,professional_id);
ALTER TABLE public.professional_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views professional settings" ON public.professional_settings FOR SELECT TO authenticated USING(public.is_clinic_staff((select auth.uid()),clinic_id));
CREATE POLICY "Admin manages professional settings" ON public.professional_settings FOR ALL TO authenticated USING(public.has_clinic_role((select auth.uid()),clinic_id,'admin')) WITH CHECK(public.has_clinic_role((select auth.uid()),clinic_id,'admin'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.professional_settings TO authenticated; GRANT ALL ON public.professional_settings TO service_role;
CREATE TRIGGER update_professional_settings_updated_at BEFORE UPDATE ON public.professional_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER enforce_professional_settings_clinic BEFORE INSERT OR UPDATE OF clinic_id,professional_id ON public.professional_settings FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');
INSERT INTO public.professional_settings(clinic_id,professional_id) SELECT clinic_id,id FROM public.professionals ON CONFLICT(professional_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.create_settings_for_professional() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.professional_settings(clinic_id,professional_id) VALUES(NEW.clinic_id,NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.create_settings_for_professional() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER create_settings_after_professional AFTER INSERT ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.create_settings_for_professional();

ALTER TABLE public.treatments
 ADD COLUMN can_be_scheduled_online boolean NOT NULL DEFAULT true,
 ADD COLUMN can_be_scheduled_by_ai boolean NOT NULL DEFAULT false,
 ADD COLUMN requires_evaluation boolean NOT NULL DEFAULT false,
 ADD COLUMN show_price_to_patient boolean NOT NULL DEFAULT false,
 ADD COLUMN show_price_to_ai boolean NOT NULL DEFAULT false;

ALTER TABLE public.professional_treatments
 ADD COLUMN clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
 ADD COLUMN duration_minutes integer CHECK(duration_minutes BETWEEN 5 AND 480),
 ADD COLUMN private_price numeric(10,2) CHECK(private_price>=0),
 ADD COLUMN show_price boolean,
 ADD COLUMN can_ai_schedule boolean,
 ADD COLUMN requires_previous_evaluation boolean;
UPDATE public.professional_treatments pt SET clinic_id=p.clinic_id FROM public.professionals p WHERE p.id=pt.professional_id;
ALTER TABLE public.professional_treatments ALTER COLUMN clinic_id SET NOT NULL;
CREATE INDEX professional_treatments_clinic_professional ON public.professional_treatments(clinic_id,professional_id,status);
CREATE TRIGGER enforce_professional_treatments_clinic BEFORE INSERT OR UPDATE OF clinic_id,professional_id ON public.professional_treatments FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

ALTER TABLE public.professional_health_insurances
 ADD COLUMN accepts_new_patients boolean NOT NULL DEFAULT true,
 ADD COLUMN authorization_required boolean NOT NULL DEFAULT false,
 ADD COLUMN notes text,
 ADD COLUMN ai_instructions text;

CREATE OR REPLACE FUNCTION public.enforce_professional_rule_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='professional_treatments' AND NOT EXISTS(SELECT 1 FROM public.treatments t WHERE t.id=NEW.treatment_id AND t.clinic_id=NEW.clinic_id) THEN RAISE EXCEPTION 'Treatment belongs to another clinic' USING ERRCODE='23503'; END IF;
 IF TG_TABLE_NAME='professional_health_insurances' AND NOT EXISTS(SELECT 1 FROM public.health_insurances h WHERE h.id=NEW.health_insurance_id AND h.clinic_id=NEW.clinic_id) THEN RAISE EXCEPTION 'Insurance belongs to another clinic' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_professional_rule_tenant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_professional_treatment_tenant BEFORE INSERT OR UPDATE OF clinic_id,treatment_id ON public.professional_treatments FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_rule_tenant();
CREATE TRIGGER enforce_professional_insurance_tenant BEFORE INSERT OR UPDATE OF clinic_id,health_insurance_id ON public.professional_health_insurances FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_rule_tenant();
