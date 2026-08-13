
-- 1. user_belongs_to_clinic: require active membership
CREATE OR REPLACE FUNCTION public.user_belongs_to_clinic(_user_id uuid, _clinic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id AND is_active = true) $$;

-- 2. Deterministic auth_clinic_id / auth_user_role (prefer admin, then oldest)
CREATE OR REPLACE FUNCTION public.auth_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT clinic_id FROM public.user_roles
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY (role::text = 'admin') DESC, created_at ASC, clinic_id ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY (role::text = 'admin') DESC, created_at ASC, clinic_id ASC
  LIMIT 1
$$;

-- 3. sales_goals: restrict policies to authenticated role
DROP POLICY IF EXISTS admin_sales_goals ON public.sales_goals;
DROP POLICY IF EXISTS own_sales_goals ON public.sales_goals;
CREATE POLICY admin_sales_goals ON public.sales_goals
  FOR ALL TO authenticated
  USING ((clinic_id = public.auth_clinic_id()) AND (public.auth_user_role() = 'admin'))
  WITH CHECK ((clinic_id = public.auth_clinic_id()) AND (public.auth_user_role() = 'admin'));
CREATE POLICY own_sales_goals ON public.sales_goals
  FOR SELECT TO authenticated
  USING ((clinic_id = public.auth_clinic_id()) AND (user_id = auth.uid()));

-- 4. Storage: tighten contracts bucket
DROP POLICY IF EXISTS "Auth users view contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload contracts storage" ON storage.objects;
CREATE POLICY "Staff views contracts storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Staff uploads contracts storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Staff updates contracts storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'contracts' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid))
  WITH CHECK (bucket_id = 'contracts' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Patient views own contracts storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND ((storage.foldername(name))[2])::uuid IN (SELECT public.get_patient_ids_for_user(auth.uid())));

-- 5. Storage: tighten documents bucket (path convention: <clinic_id>/...)
DROP POLICY IF EXISTS "Auth users view documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload documents storage" ON storage.objects;
CREATE POLICY "Staff views documents storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Staff uploads documents storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 6. Storage: tighten patient-photos bucket; replace patient view to scope by patient_id (path[2])
DROP POLICY IF EXISTS "Auth users upload patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users view patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Patient views own photos" ON storage.objects;
CREATE POLICY "Patient views own photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-photos' AND ((storage.foldername(name))[2])::uuid IN (SELECT public.get_patient_ids_for_user(auth.uid())));

-- 7. Storage: tighten patient-anamneses bucket (path: <patient_id>/<anamnese_id>/...)
DROP POLICY IF EXISTS "Staff views anamnese docs" ON storage.objects;
DROP POLICY IF EXISTS "Staff uploads anamnese docs" ON storage.objects;
CREATE POLICY "Staff views anamnese docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-anamneses'
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = ((storage.foldername(name))[1])::uuid
        AND public.is_clinic_staff(auth.uid(), p.clinic_id)
    )
  );
CREATE POLICY "Staff uploads anamnese docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-anamneses'
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = ((storage.foldername(name))[1])::uuid
        AND public.is_clinic_staff(auth.uid(), p.clinic_id)
    )
  );
