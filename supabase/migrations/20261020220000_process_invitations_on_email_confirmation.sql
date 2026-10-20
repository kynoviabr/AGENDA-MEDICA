-- Grant invited team roles only after the invited user confirms their email.
--
-- inviteUserByEmail creates the auth user immediately, unconfirmed. The previous
-- AFTER INSERT trigger accepted the invitation and granted the role at that
-- moment, before the person clicked the invite link. Invitations are now
-- processed when the auth user exists with a confirmed email: on INSERT when
-- the account is created already confirmed, or on UPDATE when email_confirmed_at
-- changes from NULL to a value.

CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
BEGIN
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE lower(trim(email)) = lower(trim(NEW.email))
      AND status = 'pending'
  LOOP
    -- Access groups follow through trg_sync_user_access_group_on_user_roles
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT (user_id, clinic_id, role) DO UPDATE
      SET is_active = true, updated_at = now();

    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_team_invitation() IS 'Processa convites pendentes de equipe quando o usuario convidado tem o e-mail confirmado.';

REVOKE ALL ON FUNCTION public.process_team_invitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_process_invitations ON auth.users;
CREATE TRIGGER on_auth_user_created_process_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.process_team_invitation();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_process_invitations ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_process_invitations
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.process_team_invitation();
