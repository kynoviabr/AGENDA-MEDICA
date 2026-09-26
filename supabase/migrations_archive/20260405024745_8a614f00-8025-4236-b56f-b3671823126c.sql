
-- Categorias de tratamentos
CREATE TABLE public.treatment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Itens de custo
CREATE TABLE public.cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Composição de custo por tratamento
CREATE TABLE public.treatment_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id UUID REFERENCES public.treatments(id) NOT NULL,
  cost_item_id UUID REFERENCES public.cost_items(id) NOT NULL,
  quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anamneses dos pacientes
CREATE TABLE public.patient_anamneses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) NOT NULL,
  patient_id UUID REFERENCES public.patients(id) NOT NULL,
  file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configurações da clínica (chave-valor)
CREATE TABLE public.clinic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clinic_id, key)
);

-- Alterar tabela treatments
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.treatment_categories(id),
  ADD COLUMN IF NOT EXISTS default_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS min_price NUMERIC(10,2);

-- Habilitar RLS
ALTER TABLE public.treatment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

-- RLS: treatment_categories
CREATE POLICY "Staff views treatment categories" ON public.treatment_categories FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin creates treatment categories" ON public.treatment_categories FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates treatment categories" ON public.treatment_categories FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes treatment categories" ON public.treatment_categories FOR DELETE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- RLS: cost_items
CREATE POLICY "Staff views cost items" ON public.cost_items FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin creates cost items" ON public.cost_items FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates cost items" ON public.cost_items FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes cost items" ON public.cost_items FOR DELETE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- RLS: treatment_cost_items (via treatment's clinic)
CREATE POLICY "Staff views treatment cost items" ON public.treatment_cost_items FOR SELECT TO authenticated USING (treatment_id IN (SELECT id FROM public.treatments WHERE is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Admin creates treatment cost items" ON public.treatment_cost_items FOR INSERT TO authenticated WITH CHECK (treatment_id IN (SELECT id FROM public.treatments WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));
CREATE POLICY "Admin updates treatment cost items" ON public.treatment_cost_items FOR UPDATE TO authenticated USING (treatment_id IN (SELECT id FROM public.treatments WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));
CREATE POLICY "Admin deletes treatment cost items" ON public.treatment_cost_items FOR DELETE TO authenticated USING (treatment_id IN (SELECT id FROM public.treatments WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

-- RLS: patient_anamneses
CREATE POLICY "Staff views anamneses" ON public.patient_anamneses FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff creates anamneses" ON public.patient_anamneses FOR INSERT TO authenticated WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates anamneses" ON public.patient_anamneses FOR UPDATE TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));

-- RLS: clinic_settings
CREATE POLICY "Staff views clinic settings" ON public.clinic_settings FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin manages clinic settings" ON public.clinic_settings FOR INSERT TO authenticated WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates clinic settings" ON public.clinic_settings FOR UPDATE TO authenticated USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Storage bucket for patient files
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-files', 'patient-files', false) ON CONFLICT DO NOTHING;

-- Storage policies for patient-files
CREATE POLICY "Staff uploads patient files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'patient-files' AND (storage.foldername(name))[1] IN (SELECT clinic_id::text FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "Staff views patient files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'patient-files' AND (storage.foldername(name))[1] IN (SELECT clinic_id::text FROM public.user_roles WHERE user_id = auth.uid()));
