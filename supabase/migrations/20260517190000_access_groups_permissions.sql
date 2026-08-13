-- Security and access groups (internal staff only)

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

DROP TRIGGER IF EXISTS update_access_groups_updated_at ON public.access_groups;
CREATE TRIGGER update_access_groups_updated_at
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_access_group_permissions_updated_at ON public.access_group_permissions;
CREATE TRIGGER update_access_group_permissions_updated_at
  BEFORE UPDATE ON public.access_group_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_access_groups_updated_at ON public.user_access_groups;
CREATE TRIGGER update_user_access_groups_updated_at
  BEFORE UPDATE ON public.user_access_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- Seed default groups for existing clinics
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

-- Seed default assignments using current user_roles (non-patient)
INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
SELECT
  ur.clinic_id,
  ur.user_id,
  ag.id,
  true
FROM public.user_roles ur
JOIN public.access_groups ag
  ON ag.clinic_id = ur.clinic_id
 AND ag.code = CASE
   WHEN ur.role::text = 'admin' THEN 'admin'
   WHEN ur.role::text = 'sales' THEN 'comercial'
   WHEN ur.role::text = 'receptionist' THEN 'recepcao'
   WHEN ur.role::text = 'professional' THEN 'profissionais'
   ELSE 'consulta'
 END
WHERE ur.is_active = true
ON CONFLICT (clinic_id, user_id, group_id) DO NOTHING;

-- Seed default menu permissions per system group
WITH all_permissions AS (
  SELECT
    ag.clinic_id,
    ag.id AS group_id,
    ag.code,
    p.permission_key
  FROM public.access_groups ag
  CROSS JOIN (
    VALUES
      ('dashboard.view'),
      ('crm.view'),
      ('patients.view'),
      ('treatments.view'),
      ('proposals.view'),
      ('contracts.view'),
      ('payments.view'),
      ('finance_contracts.view'),
      ('goals.view'),
      ('appointments.view'),
      ('sessions.view'),
      ('evolution.view'),
      ('photos.view'),
      ('feedback.view'),
      ('nps.view'),
      ('satisfaction.view'),
      ('reports.view'),
      ('settings.view')
  ) AS p(permission_key)
  WHERE ag.is_system = true
),
allowed AS (
  SELECT clinic_id, group_id, permission_key
  FROM all_permissions
  WHERE
    code = 'admin'
    OR (code = 'gestor' AND permission_key IN (
      'dashboard.view','crm.view','patients.view','treatments.view','proposals.view','contracts.view',
      'payments.view','finance_contracts.view','goals.view','appointments.view','sessions.view','evolution.view',
      'photos.view','feedback.view','nps.view','reports.view'
    ))
    OR (code = 'comercial' AND permission_key IN (
      'dashboard.view','crm.view','patients.view','treatments.view','proposals.view','contracts.view',
      'finance_contracts.view','goals.view','reports.view'
    ))
    OR (code = 'recepcao' AND permission_key IN (
      'dashboard.view','crm.view','patients.view','treatments.view','proposals.view','contracts.view',
      'payments.view','appointments.view','feedback.view','nps.view'
    ))
    OR (code = 'profissionais' AND permission_key IN (
      'dashboard.view','patients.view','treatments.view','appointments.view','sessions.view','evolution.view',
      'photos.view','feedback.view','nps.view','goals.view'
    ))
    OR (code = 'financeiro' AND permission_key IN (
      'dashboard.view','contracts.view','payments.view','finance_contracts.view','reports.view'
    ))
    OR (code = 'operacao' AND permission_key IN (
      'dashboard.view','patients.view','appointments.view','sessions.view','evolution.view','photos.view'
    ))
    OR (code = 'consulta' AND permission_key IN ('dashboard.view'))
)
INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT clinic_id, group_id, permission_key, true
FROM allowed
ON CONFLICT (group_id, permission_key) DO NOTHING;
