-- Auto-provision access groups for new clinics and sync user access groups on role assignment.
-- Ensures access control relies strictly on access_groups with no hardcoded role fallbacks.

-- 1. Helper function & trigger: seed access groups and permissions for any newly created clinic
CREATE OR REPLACE FUNCTION public.seed_default_access_groups_for_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1.1 Insert standard access groups for the new clinic
  INSERT INTO public.access_groups (clinic_id, name, code, is_system, status)
  VALUES
    (NEW.id, 'Admin', 'admin', true, 'active'),
    (NEW.id, 'Gestor', 'gestor', true, 'active'),
    (NEW.id, 'Comercial', 'comercial', true, 'active'),
    (NEW.id, 'Recepção', 'recepcao', true, 'active'),
    (NEW.id, 'Profissionais', 'profissionais', true, 'active'),
    (NEW.id, 'Financeiro', 'financeiro', true, 'active'),
    (NEW.id, 'Operação', 'operacao', true, 'active'),
    (NEW.id, 'Somente Consulta', 'consulta', true, 'active')
  ON CONFLICT (clinic_id, code) DO NOTHING;

  -- 1.2 Insert active permissions for each group
  WITH active_permissions(permission_key) AS (
    VALUES
      ('dashboard.view'), ('crm.view'), ('whatsapp_ai.view'), ('patients.view'),
      ('treatments.view'), ('appointments.view'), ('settings.view')
  ),
  allowed(code, permission_key) AS (
    SELECT 'admin', permission_key FROM active_permissions
    UNION ALL SELECT 'gestor', permission_key FROM active_permissions
    UNION ALL SELECT 'comercial', permission_key FROM active_permissions
      WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view')
    UNION ALL SELECT 'recepcao', permission_key FROM active_permissions
      WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view', 'appointments.view')
    UNION ALL SELECT 'profissionais', permission_key FROM active_permissions
      WHERE permission_key IN ('dashboard.view', 'patients.view', 'treatments.view', 'appointments.view')
    UNION ALL SELECT 'financeiro', permission_key FROM active_permissions
      WHERE permission_key = 'dashboard.view'
    UNION ALL SELECT 'operacao', permission_key FROM active_permissions
      WHERE permission_key IN ('dashboard.view', 'patients.view', 'appointments.view')
    UNION ALL SELECT 'consulta', permission_key FROM active_permissions
      WHERE permission_key = 'dashboard.view'
  )
  INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
  SELECT NEW.id, ag.id, allowed.permission_key, true
  FROM public.access_groups ag
  JOIN allowed ON allowed.code = ag.code
  WHERE ag.clinic_id = NEW.id AND ag.is_system = true AND ag.status = 'active'
  ON CONFLICT (group_id, permission_key) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_default_access_groups_for_clinic() IS 'Cria os grupos de acesso padrão e permissões ao cadastrar uma nova clínica.';

REVOKE ALL ON FUNCTION public.seed_default_access_groups_for_clinic() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS seed_default_access_groups_after_clinic_insert ON public.clinics;
CREATE TRIGGER seed_default_access_groups_after_clinic_insert
  AFTER INSERT ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_access_groups_for_clinic();


-- 2. Helper function & trigger: sync user_access_groups when user_roles is created or updated
CREATE OR REPLACE FUNCTION public.sync_user_access_group_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_code text;
  v_group_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_active = false THEN
    UPDATE public.user_access_groups
    SET is_active = false
    WHERE clinic_id = NEW.clinic_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  IF NEW.is_active = true THEN
    v_group_code := CASE NEW.role::text
      WHEN 'admin' THEN 'admin'
      WHEN 'sales' THEN 'comercial'
      WHEN 'receptionist' THEN 'recepcao'
      WHEN 'professional' THEN 'profissionais'
      ELSE 'consulta'
    END;

    SELECT id INTO v_group_id
    FROM public.access_groups
    WHERE clinic_id = NEW.clinic_id AND code = v_group_code;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
      VALUES (NEW.clinic_id, NEW.user_id, v_group_id, true)
      ON CONFLICT (clinic_id, user_id, group_id)
      DO UPDATE SET is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_user_access_group_for_role() IS 'Associa automaticamente o usuário ao grupo de acesso correspondente ao seu papel na clínica.';

REVOKE ALL ON FUNCTION public.sync_user_access_group_for_role() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_sync_user_access_group_on_user_roles ON public.user_roles;
CREATE TRIGGER trg_sync_user_access_group_on_user_roles
  AFTER INSERT OR UPDATE OF role, is_active ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_access_group_for_role();


-- 3. Update process_team_invitation() to also ensure user_access_groups sync
CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  v_group_code text;
  v_group_id uuid;
BEGIN
  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE email = NEW.email
      AND status = 'pending'
  LOOP
    -- Create or reactivate the user role (will also trigger trg_sync_user_access_group_on_user_roles)
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT (user_id, clinic_id, role) DO UPDATE
      SET is_active = true, updated_at = now();

    -- Explicit direct assignment to user_access_groups for defense-in-depth
    v_group_code := CASE inv.role::text
      WHEN 'admin' THEN 'admin'
      WHEN 'sales' THEN 'comercial'
      WHEN 'receptionist' THEN 'recepcao'
      WHEN 'professional' THEN 'profissionais'
      ELSE 'consulta'
    END;

    SELECT id INTO v_group_id
    FROM public.access_groups
    WHERE clinic_id = inv.clinic_id AND code = v_group_code;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
      VALUES (inv.clinic_id, NEW.id, v_group_id, true)
      ON CONFLICT (clinic_id, user_id, group_id)
      DO UPDATE SET is_active = true;
    END IF;

    -- Mark invitation as accepted
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.process_team_invitation() FROM PUBLIC, anon;


-- 4. Idempotent backfill: ensure all existing clinics and active roles have groups and mappings
INSERT INTO public.access_groups (clinic_id, name, code, is_system, status)
SELECT c.id, bg.name, bg.code, true, 'active'
FROM public.clinics c
CROSS JOIN (
  VALUES
    ('Admin'::text, 'admin'::text),
    ('Gestor', 'gestor'),
    ('Comercial', 'comercial'),
    ('Recepção', 'recepcao'),
    ('Profissionais', 'profissionais'),
    ('Financeiro', 'financeiro'),
    ('Operação', 'operacao'),
    ('Somente Consulta', 'consulta')
) AS bg(name, code)
ON CONFLICT (clinic_id, code) DO NOTHING;

WITH active_permissions(permission_key) AS (
  VALUES
    ('dashboard.view'), ('crm.view'), ('whatsapp_ai.view'), ('patients.view'),
    ('treatments.view'), ('appointments.view'), ('settings.view')
),
allowed(code, permission_key) AS (
  SELECT 'admin', permission_key FROM active_permissions
  UNION ALL SELECT 'gestor', permission_key FROM active_permissions
  UNION ALL SELECT 'comercial', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view')
  UNION ALL SELECT 'recepcao', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view', 'appointments.view')
  UNION ALL SELECT 'profissionais', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'patients.view', 'treatments.view', 'appointments.view')
  UNION ALL SELECT 'financeiro', permission_key FROM active_permissions
    WHERE permission_key = 'dashboard.view'
  UNION ALL SELECT 'operacao', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'patients.view', 'appointments.view')
  UNION ALL SELECT 'consulta', permission_key FROM active_permissions
    WHERE permission_key = 'dashboard.view'
)
INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT ag.clinic_id, ag.id, allowed.permission_key, true
FROM public.access_groups ag
JOIN allowed ON allowed.code = ag.code
WHERE ag.is_system = true AND ag.status = 'active'
ON CONFLICT (group_id, permission_key) DO NOTHING;

INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
SELECT ur.clinic_id, ur.user_id, ag.id, true
FROM public.user_roles ur
JOIN public.access_groups ag
  ON ag.clinic_id = ur.clinic_id
 AND ag.code = CASE ur.role::text
   WHEN 'admin' THEN 'admin'
   WHEN 'sales' THEN 'comercial'
   WHEN 'receptionist' THEN 'recepcao'
   WHEN 'professional' THEN 'profissionais'
   ELSE 'consulta'
 END
WHERE ur.is_active = true
ON CONFLICT (clinic_id, user_id, group_id) DO UPDATE
SET is_active = EXCLUDED.is_active;
