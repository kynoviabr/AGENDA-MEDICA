-- Release closeout hardening (idempotent)
-- Objetivo: garantir estrutura mínima para teste formal em ambientes parcialmente migrados.

-- ------------------------------------------------------------
-- 1) Colunas já usadas no frontend/backend
-- ------------------------------------------------------------
ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.class_entities
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS linked_professionals text;

ALTER TABLE public.treatment_categories
ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.team_invitations
ADD COLUMN IF NOT EXISTS cargo_name text;

-- Backfill seguro de approved_at para contratos já fechados/ativos
UPDATE public.contracts
SET approved_at = COALESCE(approved_at, signed_at, confirmed_at, created_at)
WHERE approved_at IS NULL
  AND (
    status IN ('active', 'completed')
    OR process_status IN ('confirmed', 'pending_confirmation', 'overdue')
  );

CREATE INDEX IF NOT EXISTS idx_contracts_clinic_approved_at
  ON public.contracts (clinic_id, approved_at);

-- ------------------------------------------------------------
-- 2) Segurança paciente (APP)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_users_clinic_id ON public.patient_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_patient_id ON public.patient_users(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_auth_user_id ON public.patient_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_patient_users_status ON public.patient_users(status);

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

-- ------------------------------------------------------------
-- 3) Grupos de acesso internos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, code)
);

CREATE TABLE IF NOT EXISTS public.access_group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_access_groups_clinic_id ON public.access_groups(clinic_id);
CREATE INDEX IF NOT EXISTS idx_access_group_permissions_group_id ON public.access_group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_access_group_permissions_clinic_id ON public.access_group_permissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_access_groups_clinic_user ON public.user_access_groups(clinic_id, user_id);

ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read access groups" ON public.access_groups;
CREATE POLICY "Staff read access groups"
  ON public.access_groups FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin manage access groups" ON public.access_groups;
CREATE POLICY "Admin manage access groups"
  ON public.access_groups FOR ALL TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff read access group permissions" ON public.access_group_permissions;
CREATE POLICY "Staff read access group permissions"
  ON public.access_group_permissions FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin manage access group permissions" ON public.access_group_permissions;
CREATE POLICY "Admin manage access group permissions"
  ON public.access_group_permissions FOR ALL TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

DROP POLICY IF EXISTS "Staff read user access groups" ON public.user_access_groups;
CREATE POLICY "Staff read user access groups"
  ON public.user_access_groups FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Admin manage user access groups" ON public.user_access_groups;
CREATE POLICY "Admin manage user access groups"
  ON public.user_access_groups FOR ALL TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE OR REPLACE FUNCTION public.has_menu_access(
  _user_id uuid,
  _clinic_id uuid,
  _permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  SELECT public.has_clinic_role(_user_id, _clinic_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_access_groups uag
    JOIN public.access_group_permissions agp ON agp.group_id = uag.group_id
    WHERE uag.clinic_id = _clinic_id
      AND uag.user_id = _user_id
      AND uag.is_active = true
      AND agp.clinic_id = _clinic_id
      AND agp.permission_key = _permission_key
      AND agp.can_view = true
  );
END;
$$;

-- Grupos padrão por clínica (somente internos)
WITH clinics AS (
  SELECT id AS clinic_id FROM public.clinics
),
base_groups AS (
  SELECT clinic_id, 'Admin'::text AS name, 'admin'::text AS code, true AS is_system FROM clinics
  UNION ALL SELECT clinic_id, 'Gestor', 'gestor', true FROM clinics
  UNION ALL SELECT clinic_id, 'Comercial', 'comercial', true FROM clinics
  UNION ALL SELECT clinic_id, 'Recepção', 'recepcao', true FROM clinics
  UNION ALL SELECT clinic_id, 'Profissionais', 'profissionais', true FROM clinics
  UNION ALL SELECT clinic_id, 'Financeiro', 'financeiro', true FROM clinics
  UNION ALL SELECT clinic_id, 'Operação', 'operacao', true FROM clinics
  UNION ALL SELECT clinic_id, 'Somente Consulta', 'consulta', true FROM clinics
)
INSERT INTO public.access_groups (clinic_id, name, code, is_system, status)
SELECT clinic_id, name, code, is_system, 'active'
FROM base_groups
ON CONFLICT (clinic_id, code) DO NOTHING;

