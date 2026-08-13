-- Bootstrap schema gerado a partir das migrations do projeto

-- ==== 20260405000550_dbb13d91-c58f-48b8-8e9e-29ee3f9b1f7a.sql ====

-- ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('admin', 'receptionist', 'professional', 'patient');
CREATE TYPE public.proposal_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
CREATE TYPE public.contract_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE public.payment_method AS ENUM ('credit_card', 'debit_card', 'pix', 'bank_transfer', 'cash', 'boleto');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled', 'refunded');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.patient_status AS ENUM ('active', 'inactive', 'completed', 'pending');
CREATE TYPE public.photo_type AS ENUM ('before', 'during', 'after', 'progress');

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- TABLES
CREATE TABLE public.clinics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1a7a6d',
  secondary_color TEXT DEFAULT '#f5f0e8',
  accent_color TEXT DEFAULT '#c8912e',
  phone TEXT, email TEXT, address TEXT, city TEXT, state TEXT, zip_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, clinic_id, role)
);

CREATE TABLE public.patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL, email TEXT, phone TEXT, cpf TEXT,
  date_of_birth DATE, gender TEXT, address TEXT, city TEXT, state TEXT, zip_code TEXT,
  notes TEXT, status patient_status NOT NULL DEFAULT 'active', avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.treatments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  num_sessions INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  category TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  proposal_number TEXT NOT NULL,
  status proposal_status NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  final_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  valid_until DATE, notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.proposal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES public.treatments(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id),
  contract_number TEXT NOT NULL,
  status contract_status NOT NULL DEFAULT 'draft',
  start_date DATE, end_date DATE,
  signed_pdf_url TEXT, patient_signature_url TEXT, notes TEXT, signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'credit_card',
  num_installments INTEGER NOT NULL DEFAULT 1,
  status payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_plan_id UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL, paid_date DATE,
  status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES auth.users(id),
  treatment_id UUID REFERENCES public.treatments(id),
  start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT, created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.session_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  treatment_id UUID REFERENCES public.treatments(id),
  professional_id UUID REFERENCES auth.users(id),
  session_number INTEGER NOT NULL DEFAULT 1,
  total_sessions INTEGER NOT NULL DEFAULT 1,
  notes TEXT, products_used TEXT, observations TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.patient_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL, value DECIMAL(10,2) NOT NULL, unit TEXT NOT NULL DEFAULT 'cm',
  notes TEXT, recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.patient_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  treatment_id UUID REFERENCES public.treatments(id),
  session_record_id UUID REFERENCES public.session_records(id),
  photo_type photo_type NOT NULL DEFAULT 'progress',
  photo_url TEXT NOT NULL, thumbnail_url TEXT, description TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.session_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  session_record_id UUID NOT NULL REFERENCES public.session_records(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT, is_responded BOOLEAN NOT NULL DEFAULT false,
  response TEXT, responded_by UUID REFERENCES auth.users(id), responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, title TEXT NOT NULL, file_url TEXT NOT NULL,
  file_size INTEGER, mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, table_name TEXT NOT NULL, record_id UUID,
  old_data JSONB, new_data JSONB, ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_clinic ON public.user_roles(clinic_id);
CREATE INDEX idx_user_roles_user_clinic ON public.user_roles(user_id, clinic_id);
CREATE INDEX idx_patients_clinic ON public.patients(clinic_id);
CREATE INDEX idx_patients_user ON public.patients(user_id);
CREATE INDEX idx_patients_cpf ON public.patients(clinic_id, cpf);
CREATE INDEX idx_treatments_clinic ON public.treatments(clinic_id);
CREATE INDEX idx_proposals_clinic ON public.proposals(clinic_id);
CREATE INDEX idx_proposals_patient ON public.proposals(patient_id);
CREATE INDEX idx_contracts_clinic ON public.contracts(clinic_id);
CREATE INDEX idx_contracts_patient ON public.contracts(patient_id);
CREATE INDEX idx_payment_plans_clinic ON public.payment_plans(clinic_id);
CREATE INDEX idx_payment_installments_plan ON public.payment_installments(payment_plan_id);
CREATE INDEX idx_appointments_clinic ON public.appointments(clinic_id);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_professional ON public.appointments(professional_id);
CREATE INDEX idx_appointments_time ON public.appointments(clinic_id, start_time);
CREATE INDEX idx_session_records_clinic ON public.session_records(clinic_id);
CREATE INDEX idx_session_records_patient ON public.session_records(patient_id);
CREATE INDEX idx_patient_metrics_patient ON public.patient_metrics(patient_id);
CREATE INDEX idx_patient_photos_patient ON public.patient_photos(patient_id);
CREATE INDEX idx_session_feedback_session ON public.session_feedback(session_record_id);
CREATE INDEX idx_session_feedback_patient ON public.session_feedback(patient_id);
CREATE INDEX idx_documents_clinic ON public.documents(clinic_id);
CREATE INDEX idx_documents_patient ON public.documents(patient_id);
CREATE INDEX idx_audit_logs_clinic ON public.audit_logs(clinic_id);

-- TRIGGERS
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_treatments_updated_at BEFORE UPDATE ON public.treatments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payment_plans_updated_at BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payment_installments_updated_at BEFORE UPDATE ON public.payment_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_session_records_updated_at BEFORE UPDATE ON public.session_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ENABLE RLS ON ALL TABLES
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('clinic-logos', 'clinic-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-photos', 'patient-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- ==== 20260405000639_5751b8cb-dcfa-4115-8d70-b7e20e437619.sql ====

-- SECURITY DEFINER FUNCTIONS (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_clinic_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT clinic_id FROM public.user_roles WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_clinic(_user_id uuid, _clinic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id) $$;

CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id uuid, _clinic_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_clinic_staff(_user_id uuid, _clinic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id AND role IN ('admin', 'receptionist', 'professional')) $$;

-- Get patient's clinic_id securely
CREATE OR REPLACE FUNCTION public.get_patient_clinic_id(_patient_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT clinic_id FROM public.patients WHERE user_id = _patient_user_id $$;

CREATE OR REPLACE FUNCTION public.get_patient_ids_for_user(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.patients WHERE user_id = _user_id $$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- CLINICS
CREATE POLICY "Staff can view their clinic" ON public.clinics FOR SELECT TO authenticated
  USING (public.user_belongs_to_clinic(auth.uid(), id));
CREATE POLICY "Patient can view their clinic" ON public.clinics FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_patient_clinic_id(auth.uid())));
CREATE POLICY "Admin can update their clinic" ON public.clinics FOR UPDATE TO authenticated
  USING (public.has_clinic_role(auth.uid(), id, 'admin'));

-- USER_ROLES
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Admin sees clinic roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin creates roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin deletes roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- PATIENTS
CREATE POLICY "Staff views clinic patients" ON public.patients FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own record" ON public.patients FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Staff creates patients" ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates patients" ON public.patients FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin deletes patients" ON public.patients FOR DELETE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- TREATMENTS
CREATE POLICY "Staff views treatments" ON public.treatments FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views clinic treatments" ON public.treatments FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_patient_clinic_id(auth.uid())));
CREATE POLICY "Admin creates treatments" ON public.treatments FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Admin updates treatments" ON public.treatments FOR UPDATE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- PROPOSALS
CREATE POLICY "Staff views proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own proposals" ON public.proposals FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates proposals" ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates proposals" ON public.proposals FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- PROPOSAL_ITEMS
CREATE POLICY "Staff views proposal items" ON public.proposal_items FOR SELECT TO authenticated
  USING (proposal_id IN (SELECT id FROM public.proposals WHERE public.is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Patient views own proposal items" ON public.proposal_items FOR SELECT TO authenticated
  USING (proposal_id IN (SELECT id FROM public.proposals WHERE patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid()))));
CREATE POLICY "Staff manages proposal items" ON public.proposal_items FOR INSERT TO authenticated
  WITH CHECK (proposal_id IN (SELECT id FROM public.proposals WHERE public.is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Staff updates proposal items" ON public.proposal_items FOR UPDATE TO authenticated
  USING (proposal_id IN (SELECT id FROM public.proposals WHERE public.is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Staff deletes proposal items" ON public.proposal_items FOR DELETE TO authenticated
  USING (proposal_id IN (SELECT id FROM public.proposals WHERE public.is_clinic_staff(auth.uid(), clinic_id)));

-- CONTRACTS
CREATE POLICY "Staff views contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own contracts" ON public.contracts FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- PAYMENT_PLANS
CREATE POLICY "Staff views payment plans" ON public.payment_plans FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own payment plans" ON public.payment_plans FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates payment plans" ON public.payment_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates payment plans" ON public.payment_plans FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- PAYMENT_INSTALLMENTS
CREATE POLICY "Staff views installments" ON public.payment_installments FOR SELECT TO authenticated
  USING (payment_plan_id IN (SELECT id FROM public.payment_plans WHERE public.is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Patient views own installments" ON public.payment_installments FOR SELECT TO authenticated
  USING (payment_plan_id IN (SELECT id FROM public.payment_plans WHERE patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid()))));
CREATE POLICY "Staff creates installments" ON public.payment_installments FOR INSERT TO authenticated
  WITH CHECK (payment_plan_id IN (SELECT id FROM public.payment_plans WHERE public.is_clinic_staff(auth.uid(), clinic_id)));
CREATE POLICY "Staff updates installments" ON public.payment_installments FOR UPDATE TO authenticated
  USING (payment_plan_id IN (SELECT id FROM public.payment_plans WHERE public.is_clinic_staff(auth.uid(), clinic_id)));

-- APPOINTMENTS
CREATE POLICY "Staff views appointments" ON public.appointments FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates appointments" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- SESSION_RECORDS
CREATE POLICY "Staff views session records" ON public.session_records FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own sessions" ON public.session_records FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates session records" ON public.session_records FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff updates session records" ON public.session_records FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- PATIENT_METRICS
CREATE POLICY "Staff views metrics" ON public.patient_metrics FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own metrics" ON public.patient_metrics FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff creates metrics" ON public.patient_metrics FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

-- PATIENT_PHOTOS
CREATE POLICY "Staff views photos" ON public.patient_photos FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own photos" ON public.patient_photos FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff uploads photos" ON public.patient_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

-- SESSION_FEEDBACK
CREATE POLICY "Staff views feedback" ON public.session_feedback FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own feedback" ON public.session_feedback FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Patient creates feedback" ON public.session_feedback FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff responds to feedback" ON public.session_feedback FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- DOCUMENTS
CREATE POLICY "Staff views documents" ON public.documents FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Patient views own documents" ON public.documents FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
CREATE POLICY "Staff uploads documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Staff deletes documents" ON public.documents FOR DELETE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- AUDIT_LOGS
CREATE POLICY "Admin views audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
CREATE POLICY "Staff inserts audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

-- STORAGE POLICIES
CREATE POLICY "Public can view clinic logos" ON storage.objects FOR SELECT USING (bucket_id = 'clinic-logos');
CREATE POLICY "Admin uploads clinic logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'clinic-logos');
CREATE POLICY "Admin updates clinic logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'clinic-logos');
CREATE POLICY "Auth users view patient photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'patient-photos');
CREATE POLICY "Auth users upload patient photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'patient-photos');
CREATE POLICY "Auth users view contracts storage" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contracts');
CREATE POLICY "Auth users upload contracts storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contracts');
CREATE POLICY "Auth users view documents storage" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Auth users upload documents storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

-- ==== 20260405002454_39a4435f-5eb5-4c28-b186-f5558aed2c3b.sql ====

-- 1. Add missing columns to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS support_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. Create patient_portal_access table
CREATE TABLE public.patient_portal_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, auth_user_id)
);

ALTER TABLE public.patient_portal_access ENABLE ROW LEVEL SECURITY;

-- Staff can manage portal access for their clinic
CREATE POLICY "Staff manages portal access"
  ON public.patient_portal_access FOR ALL
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient can view own portal access
CREATE POLICY "Patient views own portal access"
  ON public.patient_portal_access FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- 3. Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id UUID,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Staff can manage notifications for their clinic
CREATE POLICY "Staff manages notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient views own notifications
CREATE POLICY "Patient views own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- Patient can mark own notifications as read
CREATE POLICY "Patient updates own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- Indexes
CREATE INDEX idx_patient_portal_access_clinic ON public.patient_portal_access(clinic_id);
CREATE INDEX idx_patient_portal_access_patient ON public.patient_portal_access(patient_id);
CREATE INDEX idx_patient_portal_access_auth_user ON public.patient_portal_access(auth_user_id);
CREATE INDEX idx_notifications_clinic ON public.notifications(clinic_id);
CREATE INDEX idx_notifications_patient ON public.notifications(patient_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);

-- Updated_at triggers
CREATE TRIGGER update_patient_portal_access_updated_at
  BEFORE UPDATE ON public.patient_portal_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==== 20260405002519_acfa95ea-580b-47f3-90cd-75a528777ca6.sql ====

-- Helper functions for auth context
CREATE OR REPLACE FUNCTION public.auth_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_patient_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT patient_id FROM public.patient_portal_access
  WHERE auth_user_id = auth.uid() AND access_status = 'active' LIMIT 1
$$;

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic_id UUID;
  _action TEXT;
BEGIN
  _action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    _clinic_id := OLD.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data)
    VALUES (_clinic_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (_clinic_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, new_data)
    VALUES (_clinic_id, auth.uid(), 'insert', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers
CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_payment_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_payment_installments
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_patient_photos
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_photos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ==== 20260405004629_73f51046-802e-4313-9525-1793d3747a44.sql ====

-- Allow authenticated users to insert clinics (for onboarding)
CREATE POLICY "Authenticated users can create clinics"
ON public.clinics
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ==== 20260405004638_3f64b3b8-da21-4a4a-abe7-9a81698ad769.sql ====

DROP POLICY IF EXISTS "Authenticated users can create clinics" ON public.clinics;

-- ==== 20260405005031_cdb5e1de-2bdf-4044-8bb0-d66ea78f0f81.sql ====

-- Team invitations table
CREATE TABLE public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL,
  invited_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages invitations"
ON public.team_invitations
FOR ALL
TO authenticated
USING (has_clinic_role(auth.uid(), clinic_id, 'admin'::app_role))
WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_team_invitations_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to process pending invitations on user creation
CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Check for pending invitations matching the new user's email
  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE email = NEW.email
      AND status = 'pending'
  LOOP
    -- Create the user role
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT DO NOTHING;

    -- Mark invitation as accepted
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on auth.users to auto-process invitations
CREATE TRIGGER on_auth_user_created_process_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.process_team_invitation();

-- ==== 20260405005312_1708300f-16cf-4caf-adb7-8c550f1a59f3.sql ====
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ==== 20260405005457_128fc783-bba6-46e9-8ab4-2127ab666966.sql ====

CREATE POLICY "Staff uploads patient photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Staff views patient photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Staff deletes patient photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Patient views own photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT public.get_patient_clinic_id(auth.uid())
  )
);

-- ==== 20260405005545_964fcc7d-d07c-457a-b582-a08ecd7ac91d.sql ====

CREATE POLICY "Staff deletes photo records"
ON public.patient_photos FOR DELETE TO authenticated
USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- ==== 20260405024745_8a614f00-8025-4236-b56f-b3671823126c.sql ====

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

-- ==== 20260405025721_04abe7fa-452c-4c94-8fb6-a99d10ea25c7.sql ====

-- Combos comerciais
CREATE TABLE treatment_combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics NOT NULL,
  name TEXT NOT NULL,
  promotional_price NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Itens do combo
CREATE TABLE treatment_combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES treatment_combos NOT NULL,
  treatment_id UUID REFERENCES treatments NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE treatment_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_combo_items ENABLE ROW LEVEL SECURITY;

-- Policies for treatment_combos
CREATE POLICY "Staff views combos" ON treatment_combos FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Admin creates combos" ON treatment_combos FOR INSERT TO authenticated
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Admin updates combos" ON treatment_combos FOR UPDATE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Admin deletes combos" ON treatment_combos FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Policies for treatment_combo_items
CREATE POLICY "Staff views combo items" ON treatment_combo_items FOR SELECT TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE is_clinic_staff(auth.uid(), clinic_id)));

CREATE POLICY "Admin creates combo items" ON treatment_combo_items FOR INSERT TO authenticated
  WITH CHECK (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

CREATE POLICY "Admin updates combo items" ON treatment_combo_items FOR UPDATE TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

CREATE POLICY "Admin deletes combo items" ON treatment_combo_items FOR DELETE TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

-- ==== 20260405030357_e2c2e4c3-0c8e-4b58-b61b-2333850d3ca2.sql ====

-- NPS responses table
CREATE TABLE nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics NOT NULL,
  patient_id UUID REFERENCES patients NOT NULL,
  professional_user_id UUID,
  treatment_id UUID REFERENCES treatments,
  appointment_id UUID REFERENCES appointments,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "Admin manages NPS" ON nps_responses FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Staff (receptionist/professional): SELECT + INSERT
CREATE POLICY "Staff views NPS" ON nps_responses FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates NPS" ON nps_responses FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient: INSERT + SELECT own
CREATE POLICY "Patient creates own NPS" ON nps_responses FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

CREATE POLICY "Patient views own NPS" ON nps_responses FOR SELECT TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- ==== 20260405031037_418f5dbe-3d56-45f1-ad82-21ea031e0c69.sql ====

CREATE OR REPLACE FUNCTION public.is_clinic_staff(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND clinic_id = _clinic_id 
    AND role::text IN ('admin', 'receptionist', 'professional', 'sales')
  ) 
$$;

-- ==== 20260405032229_27a68c28-96c7-4820-ad97-b5425a48a842.sql ====

CREATE TABLE sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) NOT NULL,
  user_id UUID NOT NULL,
  period_type TEXT NOT NULL,
  period_reference TEXT NOT NULL,
  goal_amount NUMERIC(12,2) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clinic_id, user_id, period_type, period_reference)
);

ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_sales_goals" ON sales_goals
  FOR ALL USING (
    clinic_id = auth_clinic_id()
    AND auth_user_role() IN ('admin')
  );

CREATE POLICY "own_sales_goals" ON sales_goals
  FOR SELECT USING (
    clinic_id = auth_clinic_id()
    AND user_id = auth.uid()
  );

-- ==== 20260410142453_323b807d-4df5-4d8d-b267-5b9abc83fd9a.sql ====

-- Create payers table
CREATE TABLE public.payers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views payers" ON public.payers FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates payers" ON public.payers FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff updates payers" ON public.payers FOR UPDATE TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Admin deletes payers" ON public.payers FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Add new columns to patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS is_self_payer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dissatisfaction_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dissatisfaction_level TEXT,
  ADD COLUMN IF NOT EXISTS dissatisfaction_reason TEXT;

-- Add cost column to treatments
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;

-- Trigger for updated_at on payers
CREATE TRIGGER update_payers_updated_at
  BEFORE UPDATE ON public.payers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ==== 20260410142840_bf2a96cd-aaa0-413a-8d30-a21289010730.sql ====

-- Add form data and validity fields to patient_anamneses
ALTER TABLE public.patient_anamneses
  ADD COLUMN IF NOT EXISTS form_data JSONB,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'valid';

-- ==== 20260410143253_c0b1161c-8c66-4f57-a488-dd8f06080cea.sql ====

-- Add compliance columns to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS upload_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'pending_upload',
  ADD COLUMN IF NOT EXISTS template_html TEXT;

-- ==== 20260410143858_30fd4e10-0c18-4013-9f64-aa8be93e413f.sql ====

-- Add intelligence columns to session_feedback
ALTER TABLE public.session_feedback
  ADD COLUMN IF NOT EXISTS service_attention INTEGER CHECK (service_attention >= 1 AND service_attention <= 5),
  ADD COLUMN IF NOT EXISTS waiting_time INTEGER CHECK (waiting_time >= 1 AND waiting_time <= 5),
  ADD COLUMN IF NOT EXISTS treatment_id UUID REFERENCES public.treatments(id),
  ADD COLUMN IF NOT EXISTS professional_id UUID,
  ADD COLUMN IF NOT EXISTS is_negative BOOLEAN NOT NULL DEFAULT false;

-- Add professional_id and treatment_id to nps_responses if not exists  
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS classification TEXT;

-- ==== 20260410145810_a912afd6-05c2-4e51-9e73-cdc4e5f9c3df.sql ====

CREATE OR REPLACE FUNCTION public.flag_patient_dissatisfaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_negative = true THEN
    UPDATE public.patients
    SET dissatisfaction_flag = true,
        dissatisfaction_level = CASE WHEN NEW.rating <= 2 THEN 'high' ELSE 'medium' END,
        dissatisfaction_reason = 'Feedback negativo: nota ' || NEW.rating || '/5, atenção ' || COALESCE(NEW.service_attention::text, 'N/A') || '/5, espera ' || COALESCE(NEW.waiting_time::text, 'N/A') || '/5'
    WHERE id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_dissatisfaction
AFTER INSERT ON public.session_feedback
FOR EACH ROW
EXECUTE FUNCTION public.flag_patient_dissatisfaction();

-- ==== 20260410155706_2eaa02cf-2a6e-47fa-8b80-e55672c93f5b.sql ====

CREATE OR REPLACE FUNCTION public.notify_admin_negative_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _patient_name TEXT;
  _admin RECORD;
BEGIN
  IF NEW.is_negative = true THEN
    SELECT full_name INTO _patient_name FROM public.patients WHERE id = NEW.patient_id;

    FOR _admin IN
      SELECT user_id FROM public.user_roles
      WHERE clinic_id = NEW.clinic_id AND role = 'admin' AND is_active = true
    LOOP
      INSERT INTO public.notifications (clinic_id, user_id, title, message, channel, status)
      VALUES (
        NEW.clinic_id,
        _admin.user_id,
        '⚠️ Feedback negativo recebido',
        'O paciente ' || COALESCE(_patient_name, 'Desconhecido') || ' enviou uma avaliação negativa (nota ' || NEW.rating || '/5). Verifique o módulo de feedbacks.',
        'in_app',
        'pending'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admin_negative_feedback
AFTER INSERT ON public.session_feedback
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_negative_feedback();

-- ==== 20260410165459_4f4110cc-6d00-4d97-b7ce-0b3a83a704cb.sql ====

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

-- ==== 20260410165827_5f9e1e6f-a47e-47a4-b4f5-6f11506c5c8b.sql ====

ALTER TABLE public.professionals ADD COLUMN cpf TEXT;
CREATE UNIQUE INDEX idx_professionals_clinic_cpf ON public.professionals (clinic_id, cpf) WHERE cpf IS NOT NULL;

-- ==== 20260411230015_e40c6b51-7489-4a13-8929-afc342ad4078.sql ====

-- =============================================
-- 1. ALTER patient_anamneses: add new columns
-- =============================================

ALTER TABLE public.patient_anamneses
  ADD COLUMN IF NOT EXISTS anamnese_number text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'digital',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS document_name text,
  ADD COLUMN IF NOT EXISTS document_mime_type text,
  ADD COLUMN IF NOT EXISTS document_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill anamnese_number for existing rows
UPDATE public.patient_anamneses
SET anamnese_number = 'ANM-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || lpad(
  row_number::text, 6, '0'
)
FROM (
  SELECT id AS rid, row_number() OVER (ORDER BY created_at) AS row_number
  FROM public.patient_anamneses
) sub
WHERE patient_anamneses.id = sub.rid
  AND patient_anamneses.anamnese_number IS NULL;

-- Now add constraints
ALTER TABLE public.patient_anamneses
  ALTER COLUMN anamnese_number SET NOT NULL;

ALTER TABLE public.patient_anamneses
  ADD CONSTRAINT patient_anamneses_anamnese_number_key UNIQUE (anamnese_number);

-- Migrate existing data: file_url -> document_url, uploaded_at -> document_uploaded_at, valid_until -> expires_at
UPDATE public.patient_anamneses
SET document_url = file_url,
    document_uploaded_at = uploaded_at,
    expires_at = (valid_until::timestamptz)
WHERE document_url IS NULL AND file_url IS NOT NULL;

-- =============================================
-- 2. ALTER patients: add derived columns
-- =============================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS current_anamnese_id uuid,
  ADD COLUMN IF NOT EXISTS current_anamnese_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS current_anamnese_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_valid_anamnese boolean NOT NULL DEFAULT false;

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_patient_anamneses_patient_id ON public.patient_anamneses(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_status ON public.patient_anamneses(status);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_is_current ON public.patient_anamneses(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_expires_at ON public.patient_anamneses(expires_at);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_clinic_patient ON public.patient_anamneses(clinic_id, patient_id);

-- =============================================
-- 4. FUNCTION: Generate anamnese_number
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_anamnese_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year text;
  _seq int;
BEGIN
  _year := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(
    NULLIF(split_part(anamnese_number, '-', 3), '')::int
  ), 0) + 1
  INTO _seq
  FROM public.patient_anamneses
  WHERE anamnese_number LIKE 'ANM-' || _year || '-%';

  NEW.anamnese_number := 'ANM-' || _year || '-' || lpad(_seq::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_anamnese_number
  BEFORE INSERT ON public.patient_anamneses
  FOR EACH ROW
  WHEN (NEW.anamnese_number IS NULL OR NEW.anamnese_number = '')
  EXECUTE FUNCTION public.generate_anamnese_number();

-- =============================================
-- 5. TRIGGER: updated_at
-- =============================================

CREATE TRIGGER trg_anamneses_updated_at
  BEFORE UPDATE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 6. FUNCTION: Calculate expires_at & enforce single current
-- =============================================

CREATE OR REPLACE FUNCTION public.anamnese_before_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-calculate expires_at when filled_at is set
  IF NEW.filled_at IS NOT NULL AND (
    TG_OP = 'INSERT' OR 
    OLD.filled_at IS DISTINCT FROM NEW.filled_at OR 
    OLD.validity_days IS DISTINCT FROM NEW.validity_days
  ) THEN
    NEW.expires_at := NEW.filled_at + (NEW.validity_days || ' days')::interval;
  END IF;

  -- Auto-expire if expires_at is in the past and status is filled/validated
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() AND NEW.status IN ('filled', 'validated') THEN
    NEW.status := 'expired';
  END IF;

  -- Enforce single is_current per patient
  IF NEW.is_current = true THEN
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = NEW.patient_id
      AND id IS DISTINCT FROM NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_anamnese_before_upsert
  BEFORE INSERT OR UPDATE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.anamnese_before_upsert();

-- =============================================
-- 7. FUNCTION: Sync derived fields to patients
-- =============================================

CREATE OR REPLACE FUNCTION public.sync_patient_anamnese_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _patient_id uuid;
  _best RECORD;
BEGIN
  _patient_id := COALESCE(NEW.patient_id, OLD.patient_id);

  -- Find best anamnese: not archived/cancelled, prefer validated > filled > in_progress > pending, most recent
  SELECT id, status, expires_at
  INTO _best
  FROM public.patient_anamneses
  WHERE patient_id = _patient_id
    AND status NOT IN ('cancelled', 'archived')
  ORDER BY
    CASE status
      WHEN 'validated' THEN 1
      WHEN 'filled' THEN 2
      WHEN 'in_progress' THEN 3
      WHEN 'pending' THEN 4
      WHEN 'expired' THEN 5
      ELSE 6
    END,
    COALESCE(filled_at, created_at) DESC
  LIMIT 1;

  IF _best IS NULL THEN
    UPDATE public.patients
    SET current_anamnese_id = NULL,
        current_anamnese_status = 'none',
        current_anamnese_expires_at = NULL,
        has_valid_anamnese = false
    WHERE id = _patient_id;
  ELSE
    -- Mark this one as current
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = _patient_id AND id != _best.id AND is_current = true;

    UPDATE public.patient_anamneses
    SET is_current = true
    WHERE id = _best.id AND is_current = false;

    UPDATE public.patients
    SET current_anamnese_id = _best.id,
        current_anamnese_expires_at = _best.expires_at,
        current_anamnese_status = CASE
          WHEN _best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()) THEN 'valid'
          WHEN _best.status = 'expired' OR (_best.expires_at IS NOT NULL AND _best.expires_at <= now()) THEN 'expired'
          WHEN _best.status IN ('pending', 'in_progress') THEN 'pending'
          ELSE 'none'
        END,
        has_valid_anamnese = CASE
          WHEN _best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()) THEN true
          ELSE false
        END
    WHERE id = _patient_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_patient_anamnese
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_patient_anamnese_status();

-- =============================================
-- 8. RLS POLICIES (drop old ones first, recreate)
-- =============================================

DROP POLICY IF EXISTS "Staff creates anamneses" ON public.patient_anamneses;
DROP POLICY IF EXISTS "Staff updates anamneses" ON public.patient_anamneses;
DROP POLICY IF EXISTS "Staff views anamneses" ON public.patient_anamneses;

CREATE POLICY "Staff views anamneses"
  ON public.patient_anamneses FOR SELECT
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates anamneses"
  ON public.patient_anamneses FOR INSERT
  TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff updates anamneses"
  ON public.patient_anamneses FOR UPDATE
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Patient views own anamneses"
  ON public.patient_anamneses FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- =============================================
-- 9. STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-anamneses', 'patient-anamneses', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff uploads anamnese docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'patient-anamneses');

CREATE POLICY "Staff views anamnese docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-anamneses');

CREATE POLICY "Patient views own anamnese docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-anamneses'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT get_patient_ids_for_user(auth.uid())
    )
  );
