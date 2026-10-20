-- Active commercial members are clinic staff, so RLS lets them reach CRM and
-- patients. What they see in the app is still limited by the comercial group.
CREATE OR REPLACE FUNCTION public.is_clinic_staff(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND role IN ('admin', 'receptionist', 'professional', 'sales')
      AND is_active
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_clinic_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_staff(uuid, uuid) TO authenticated, service_role;
