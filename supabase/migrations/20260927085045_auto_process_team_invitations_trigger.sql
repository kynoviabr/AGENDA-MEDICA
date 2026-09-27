-- Trigger and automated processing for team invitations on user creation.
-- Ensures that when an invited user creates an account or signs in for the first time,
-- their pending team invitation is automatically processed, creating public.user_roles
-- and syncing public.user_access_groups without requiring manual admin intervention.

-- 1. Upgrade public.process_team_invitation() with case-insensitive email matching and robust sync
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
  v_clean_email text;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_clean_email := lower(trim(NEW.email));

  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE lower(trim(email)) = v_clean_email
      AND status = 'pending'
  LOOP
    -- 1. Create or reactivate the user role
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT (user_id, clinic_id, role) DO UPDATE
      SET is_active = true, updated_at = now();

    -- 2. Explicit direct assignment to user_access_groups for defense-in-depth
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

    -- 3. Mark invitation as accepted
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_team_invitation() IS 'Processa convites pendentes de equipe vinculando o novo usuario aos papeis e grupos de acesso.';

REVOKE ALL ON FUNCTION public.process_team_invitation() FROM PUBLIC, anon;

-- 2. Create the AFTER INSERT trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_process_invitations ON auth.users;
CREATE TRIGGER on_auth_user_created_process_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.process_team_invitation();

-- 3. Idempotent backfill: reconcile any users already present in auth.users that have pending invitations
DO $$
DECLARE
  rec RECORD;
  v_group_code text;
  v_group_id uuid;
BEGIN
  FOR rec IN
    SELECT 
      ti.id AS invitation_id,
      ti.clinic_id,
      ti.role,
      u.id AS user_id
    FROM public.team_invitations ti
    JOIN auth.users u ON lower(trim(u.email)) = lower(trim(ti.email))
    WHERE ti.status = 'pending'
  LOOP
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (rec.user_id, rec.clinic_id, rec.role, true)
    ON CONFLICT (user_id, clinic_id, role) DO UPDATE
      SET is_active = true, updated_at = now();

    v_group_code := CASE rec.role::text
      WHEN 'admin' THEN 'admin'
      WHEN 'sales' THEN 'comercial'
      WHEN 'receptionist' THEN 'recepcao'
      WHEN 'professional' THEN 'profissionais'
      ELSE 'consulta'
    END;

    SELECT id INTO v_group_id
    FROM public.access_groups
    WHERE clinic_id = rec.clinic_id AND code = v_group_code;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
      VALUES (rec.clinic_id, rec.user_id, v_group_id, true)
      ON CONFLICT (clinic_id, user_id, group_id)
      DO UPDATE SET is_active = true;
    END IF;

    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = rec.invitation_id;
  END LOOP;
END $$;
