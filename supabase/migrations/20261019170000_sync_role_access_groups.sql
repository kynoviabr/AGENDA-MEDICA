-- Keep role-managed access groups in sync with the user's active roles.
--
-- sync_user_access_group_for_role() now recomputes the role-managed groups from
-- the user's active roles in the clinic, so a role change revokes the previous
-- group, deleting a role revokes its group, and deactivating one role keeps the
-- groups of the others. Groups that are not derived from roles (gestor,
-- financeiro, operacao) are left untouched.

-- 1. Role -> access group mapping in one place
CREATE OR REPLACE FUNCTION public.access_group_code_for_role(_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _role
    WHEN 'admin' THEN 'admin'
    WHEN 'sales' THEN 'comercial'
    WHEN 'receptionist' THEN 'recepcao'
    WHEN 'professional' THEN 'profissionais'
    ELSE 'consulta'
  END
$$;

REVOKE ALL ON FUNCTION public.access_group_code_for_role(text) FROM PUBLIC, anon, authenticated;


-- 2. Recompute the role-managed groups of one user in one clinic
CREATE OR REPLACE FUNCTION public.reconcile_role_access_groups(_clinic_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_managed_codes constant text[] := ARRAY['admin', 'comercial', 'recepcao', 'profissionais', 'consulta'];
  v_desired_codes text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT public.access_group_code_for_role(ur.role::text)), ARRAY[]::text[])
  INTO v_desired_codes
  FROM public.user_roles ur
  WHERE ur.clinic_id = _clinic_id
    AND ur.user_id = _user_id
    AND ur.is_active;

  -- Revoke role-managed groups the user no longer holds a role for
  UPDATE public.user_access_groups uag
  SET is_active = false
  FROM public.access_groups ag
  WHERE ag.id = uag.group_id
    AND uag.clinic_id = _clinic_id
    AND uag.user_id = _user_id
    AND uag.is_active
    AND ag.code = ANY (v_managed_codes)
    AND NOT (ag.code = ANY (v_desired_codes));

  -- Grant (or reactivate) the groups of every active role
  INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
  SELECT _clinic_id, _user_id, ag.id, true
  FROM public.access_groups ag
  WHERE ag.clinic_id = _clinic_id
    AND ag.code = ANY (v_desired_codes)
  ON CONFLICT (clinic_id, user_id, group_id)
  DO UPDATE SET is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_role_access_groups(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- 3. Trigger function delegates to the reconciliation
CREATE OR REPLACE FUNCTION public.sync_user_access_group_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND (TG_OP = 'DELETE' OR OLD.clinic_id IS DISTINCT FROM NEW.clinic_id OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    PERFORM public.reconcile_role_access_groups(OLD.clinic_id, OLD.user_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.reconcile_role_access_groups(NEW.clinic_id, NEW.user_id);
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_access_group_for_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_user_access_group_on_user_roles ON public.user_roles;
CREATE TRIGGER trg_sync_user_access_group_on_user_roles
  AFTER INSERT OR DELETE OR UPDATE OF role, is_active, clinic_id, user_id ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_access_group_for_role();


-- 4. One-time reconciliation of existing users
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT clinic_id, user_id FROM public.user_roles
    UNION
    SELECT DISTINCT clinic_id, user_id FROM public.user_access_groups
  LOOP
    PERFORM public.reconcile_role_access_groups(rec.clinic_id, rec.user_id);
  END LOOP;
END $$;
