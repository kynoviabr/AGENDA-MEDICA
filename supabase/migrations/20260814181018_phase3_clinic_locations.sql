CREATE TABLE public.clinic_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL, address_line text, city text, state text, zip_code text, phone text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo', active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name), UNIQUE (clinic_id, id)
);
CREATE UNIQUE INDEX clinic_locations_one_primary ON public.clinic_locations(clinic_id) WHERE is_primary;
CREATE INDEX clinic_locations_clinic_active ON public.clinic_locations(clinic_id, active, name);
ALTER TABLE public.clinic_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views clinic locations" ON public.clinic_locations FOR SELECT TO authenticated USING (public.is_clinic_staff((select auth.uid()), clinic_id));
CREATE POLICY "Admin manages clinic locations" ON public.clinic_locations FOR ALL TO authenticated USING (public.has_clinic_role((select auth.uid()), clinic_id, 'admin')) WITH CHECK (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_locations TO authenticated;
GRANT ALL ON public.clinic_locations TO service_role;
CREATE TRIGGER update_clinic_locations_updated_at BEFORE UPDATE ON public.clinic_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_primary_location_for_clinic() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.clinic_locations(clinic_id,name,address_line,city,state,zip_code,phone,is_primary)
 VALUES(NEW.id,'Unidade Principal',NEW.address,NEW.city,NEW.state,NEW.zip_code,NEW.phone,true) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.create_primary_location_for_clinic() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER create_primary_location_after_clinic AFTER INSERT ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.create_primary_location_for_clinic();

INSERT INTO public.clinic_locations (clinic_id, name, address_line, city, state, zip_code, phone, is_primary)
SELECT id, 'Unidade Principal', address, city, state, zip_code, phone, true FROM public.clinics ON CONFLICT (clinic_id, name) DO NOTHING;

CREATE TABLE public.professional_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.clinic_locations(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(professional_id, location_id)
);
CREATE INDEX professional_locations_clinic_professional ON public.professional_locations(clinic_id, professional_id, active);
CREATE INDEX professional_locations_clinic_location ON public.professional_locations(clinic_id, location_id, active);
ALTER TABLE public.professional_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff views professional locations" ON public.professional_locations FOR SELECT TO authenticated USING (public.is_clinic_staff((select auth.uid()), clinic_id));
CREATE POLICY "Admin manages professional locations" ON public.professional_locations FOR ALL TO authenticated USING (public.has_clinic_role((select auth.uid()), clinic_id, 'admin')) WITH CHECK (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_locations TO authenticated;
GRANT ALL ON public.professional_locations TO service_role;
CREATE TRIGGER update_professional_locations_updated_at BEFORE UPDATE ON public.professional_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.professional_locations(clinic_id, professional_id, location_id)
SELECT p.clinic_id, p.id, l.id FROM public.professionals p JOIN public.clinic_locations l ON l.clinic_id=p.clinic_id AND l.is_primary ON CONFLICT DO NOTHING;

ALTER TABLE public.appointments ADD COLUMN location_id uuid;
ALTER TABLE public.professional_availability ADD COLUMN location_id uuid;
ALTER TABLE public.appointment_blocks ADD COLUMN location_id uuid;
UPDATE public.appointments a SET location_id=l.id FROM public.clinic_locations l WHERE l.clinic_id=a.clinic_id AND l.is_primary;
UPDATE public.professional_availability a SET location_id=l.id FROM public.clinic_locations l WHERE l.clinic_id=a.clinic_id AND l.is_primary;
UPDATE public.appointment_blocks a SET location_id=l.id FROM public.clinic_locations l WHERE l.clinic_id=a.clinic_id AND l.is_primary;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_location_id_fkey FOREIGN KEY(location_id) REFERENCES public.clinic_locations(id) ON DELETE RESTRICT;
ALTER TABLE public.professional_availability ADD CONSTRAINT professional_availability_location_id_fkey FOREIGN KEY(location_id) REFERENCES public.clinic_locations(id) ON DELETE CASCADE;
ALTER TABLE public.appointment_blocks ADD CONSTRAINT appointment_blocks_location_id_fkey FOREIGN KEY(location_id) REFERENCES public.clinic_locations(id) ON DELETE CASCADE;
CREATE INDEX appointments_clinic_location_start ON public.appointments(clinic_id, location_id, start_time);
CREATE INDEX professional_availability_clinic_location ON public.professional_availability(clinic_id, location_id, professional_id);
CREATE INDEX appointment_blocks_clinic_location_start ON public.appointment_blocks(clinic_id, location_id, start_at);

CREATE OR REPLACE FUNCTION public.enforce_location_clinic() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE loc uuid := NULLIF(to_jsonb(NEW)->>TG_ARGV[0],'')::uuid;
BEGIN
 IF loc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clinic_locations l WHERE l.id=loc AND l.clinic_id=NEW.clinic_id) THEN RAISE EXCEPTION 'Location % does not belong to clinic %',loc,NEW.clinic_id USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_location_clinic() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_appointments_location_clinic BEFORE INSERT OR UPDATE OF clinic_id,location_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_location_clinic('location_id');
CREATE TRIGGER enforce_availability_location_clinic BEFORE INSERT OR UPDATE OF clinic_id,location_id ON public.professional_availability FOR EACH ROW EXECUTE FUNCTION public.enforce_location_clinic('location_id');
CREATE TRIGGER enforce_blocks_location_clinic BEFORE INSERT OR UPDATE OF clinic_id,location_id ON public.appointment_blocks FOR EACH ROW EXECUTE FUNCTION public.enforce_location_clinic('location_id');
CREATE TRIGGER enforce_professional_locations_location_clinic BEFORE INSERT OR UPDATE OF clinic_id,location_id ON public.professional_locations FOR EACH ROW EXECUTE FUNCTION public.enforce_location_clinic('location_id');
CREATE TRIGGER enforce_professional_locations_professional_clinic BEFORE INSERT OR UPDATE OF clinic_id,professional_id ON public.professional_locations FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

CREATE OR REPLACE FUNCTION public.enforce_professional_serves_location() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.professional_id IS NOT NULL AND NEW.location_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.professional_locations pl WHERE pl.clinic_id=NEW.clinic_id AND pl.professional_id=NEW.professional_id AND pl.location_id=NEW.location_id AND pl.active
 ) THEN RAISE EXCEPTION 'Professional % is not active at location %',NEW.professional_id,NEW.location_id USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_professional_serves_location() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_appointment_professional_location BEFORE INSERT OR UPDATE OF clinic_id,professional_id,location_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_serves_location();
CREATE TRIGGER enforce_availability_professional_location BEFORE INSERT OR UPDATE OF clinic_id,professional_id,location_id ON public.professional_availability FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_serves_location();
