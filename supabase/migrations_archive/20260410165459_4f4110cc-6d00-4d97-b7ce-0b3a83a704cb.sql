
-- 1. class_entities (professional councils like CRM, COREN, CRO)
CREATE TABLE public.class_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, abbreviation)
);

ALTER TABLE public.class_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views class entities" ON public.class_entities FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin creates class entities" ON public.class_entities FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates class entities" ON public.class_entities FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes class entities" ON public.class_entities FOR DELETE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE TRIGGER update_class_entities_updated_at BEFORE UPDATE ON public.class_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. roles (descriptive roles/specialties)
CREATE TABLE public.roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, name)
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views roles" ON public.roles FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin creates roles" ON public.roles FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates roles" ON public.roles FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes roles" ON public.roles FOR DELETE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. professionals
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  class_entity_id UUID REFERENCES public.class_entities(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  registration_number TEXT,
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, user_id)
);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views professionals" ON public.professionals FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin creates professionals" ON public.professionals FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates professionals" ON public.professionals FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes professionals" ON public.professionals FOR DELETE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE TRIGGER update_professionals_updated_at BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. professional_treatments
CREATE TABLE public.professional_treatments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(professional_id, treatment_id)
);

ALTER TABLE public.professional_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views professional treatments" ON public.professional_treatments FOR SELECT TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Admin creates professional treatments" ON public.professional_treatments FOR INSERT TO authenticated
  WITH CHECK (professional_id IN (SELECT id FROM public.professionals WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));
CREATE POLICY "Admin updates professional treatments" ON public.professional_treatments FOR UPDATE TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));
CREATE POLICY "Admin deletes professional treatments" ON public.professional_treatments FOR DELETE TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

CREATE TRIGGER update_professional_treatments_updated_at BEFORE UPDATE ON public.professional_treatments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
