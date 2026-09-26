-- Phase 1: Split internal staff access from patient app access
-- Keeps backward compatibility with patient_portal_access.

CREATE TABLE IF NOT EXISTS public.patient_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'invited', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_users_clinic_id ON public.patient_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_patient_id ON public.patient_users(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_auth_user_id ON public.patient_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_status ON public.patient_users(status);

CREATE TRIGGER update_patient_users_updated_at
  BEFORE UPDATE ON public.patient_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.patient_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manages patient users in clinic" ON public.patient_users;
CREATE POLICY "Staff manages patient users in clinic"
  ON public.patient_users FOR ALL TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Patient reads own user link" ON public.patient_users;
CREATE POLICY "Patient reads own user link"
  ON public.patient_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Backfill from existing portal access table if present
INSERT INTO public.patient_users (clinic_id, patient_id, auth_user_id, status, created_at, updated_at)
SELECT
  ppa.clinic_id,
  ppa.patient_id,
  ppa.auth_user_id,
  CASE
    WHEN ppa.access_status = 'active' THEN 'active'
    WHEN ppa.access_status = 'invited' THEN 'invited'
    WHEN ppa.access_status = 'inactive' THEN 'inactive'
    ELSE 'blocked'
  END AS status,
  COALESCE(ppa.created_at, now()) AS created_at,
  COALESCE(ppa.updated_at, now()) AS updated_at
FROM public.patient_portal_access ppa
ON CONFLICT (clinic_id, patient_id, auth_user_id) DO UPDATE
SET
  status = EXCLUDED.status,
  updated_at = now();

-- Keep helper functions aligned with patient_users first, then legacy fallback.
CREATE OR REPLACE FUNCTION public.get_patient_ids_for_user(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pu.patient_id
  FROM public.patient_users pu
  WHERE pu.auth_user_id = _user_id
    AND pu.status = 'active'
  UNION
  SELECT ppa.patient_id
  FROM public.patient_portal_access ppa
  WHERE ppa.auth_user_id = _user_id
    AND ppa.access_status = 'active'
  UNION
  SELECT p.id
  FROM public.patients p
  WHERE p.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.auth_patient_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pu.patient_id
  FROM public.patient_users pu
  WHERE pu.auth_user_id = auth.uid()
    AND pu.status = 'active'
  LIMIT 1
$$;
