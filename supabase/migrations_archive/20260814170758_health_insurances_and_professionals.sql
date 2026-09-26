CREATE TABLE public.health_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  ans_code text,
  phone text,
  email text,
  authorization_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_insurances_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT health_insurances_id_clinic_unique UNIQUE (id, clinic_id)
);

CREATE UNIQUE INDEX health_insurances_clinic_name_unique
  ON public.health_insurances (clinic_id, lower(btrim(name)));
CREATE INDEX health_insurances_clinic_status_idx
  ON public.health_insurances (clinic_id, status, name);

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_id_clinic_unique UNIQUE (id, clinic_id);

CREATE TABLE public.professional_health_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  health_insurance_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_health_insurances_insurance_clinic_fkey
    FOREIGN KEY (health_insurance_id, clinic_id)
    REFERENCES public.health_insurances(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT professional_health_insurances_professional_clinic_fkey
    FOREIGN KEY (professional_id, clinic_id)
    REFERENCES public.professionals(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT professional_health_insurances_unique
    UNIQUE (health_insurance_id, professional_id)
);

CREATE INDEX professional_health_insurances_clinic_idx
  ON public.professional_health_insurances (clinic_id);
CREATE INDEX professional_health_insurances_professional_idx
  ON public.professional_health_insurances (professional_id, status);
CREATE INDEX professional_health_insurances_insurance_idx
  ON public.professional_health_insurances (health_insurance_id, status);

CREATE TRIGGER update_health_insurances_updated_at
  BEFORE UPDATE ON public.health_insurances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_professional_health_insurances_updated_at
  BEFORE UPDATE ON public.professional_health_insurances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.health_insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_health_insurances ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_insurances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_health_insurances TO authenticated;

CREATE POLICY "Staff reads clinic health insurances"
  ON public.health_insurances FOR SELECT TO authenticated
  USING (public.is_clinic_staff((select auth.uid()), clinic_id));

CREATE POLICY "Admin manages clinic health insurances"
  ON public.health_insurances FOR ALL TO authenticated
  USING (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'));

CREATE POLICY "Staff reads professional health insurances"
  ON public.professional_health_insurances FOR SELECT TO authenticated
  USING (public.is_clinic_staff((select auth.uid()), clinic_id));

CREATE POLICY "Admin manages professional health insurances"
  ON public.professional_health_insurances FOR ALL TO authenticated
  USING (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'));

COMMENT ON TABLE public.health_insurances IS
  'Convênios disponíveis por clínica, incluindo dados usados no atendimento e autorização.';
COMMENT ON TABLE public.professional_health_insurances IS
  'Relação entre profissionais e os convênios que atendem, preparada para consulta da IA.';
