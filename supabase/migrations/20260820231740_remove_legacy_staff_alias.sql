-- Remove the final legacy role alias from the canonical clinic-staff helper.
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
      AND role IN ('admin', 'receptionist', 'professional')
      AND is_active
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_clinic_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_staff(uuid, uuid) TO authenticated, service_role;
