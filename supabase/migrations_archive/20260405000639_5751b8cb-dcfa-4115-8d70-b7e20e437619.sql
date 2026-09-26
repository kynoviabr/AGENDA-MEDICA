
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
