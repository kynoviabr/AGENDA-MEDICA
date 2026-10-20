-- Grant invited team roles only after the invited user confirms their email.
--
-- inviteUserByEmail creates the auth user immediately, unconfirmed. The previous
-- AFTER INSERT trigger accepted the invitation and granted the role at that
-- moment, before the person clicked the invite link. Invitations are now
-- accepted only for an auth user with a confirmed email: when the account is
-- created already confirmed, when email_confirmed_at changes from NULL to a
-- value, or when a pending invitation is stored for an already confirmed
-- account (covering an invite saved while the account was being confirmed).

-- 1. Accept the pending invitations of one confirmed user
CREATE OR REPLACE FUNCTION public.accept_pending_team_invitations(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Claim each still-pending invitation atomically, so a concurrent
  -- cancellation either wins (nothing is granted) or loses (role granted).
  FOR inv IN
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE lower(trim(email)) = lower(trim(_email))
      AND status = 'pending'
    RETURNING clinic_id, role
  LOOP
    -- Access groups follow through trg_sync_user_access_group_on_user_roles
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (_user_id, inv.clinic_id, inv.role, true)
    ON CONFLICT (user_id, clinic_id, role) DO UPDATE
      SET is_active = true, updated_at = now();
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pending_team_invitations(uuid, text) FROM PUBLIC, anon, authenticated;


-- 2. auth.users side: account created confirmed, or confirmed later
CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.accept_pending_team_invitations(NEW.id, NEW.email);
  END IF;
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


-- 3. team_invitations side: pending invitation stored for a confirmed account
CREATE OR REPLACE FUNCTION public.process_pending_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, email INTO v_user
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_user.id IS NOT NULL THEN
    PERFORM public.accept_pending_team_invitations(v_user.id, v_user.email);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.process_pending_team_invitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_process_pending_team_invitation ON public.team_invitations;
CREATE TRIGGER trg_process_pending_team_invitation
  AFTER INSERT OR UPDATE OF status, email ON public.team_invitations
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.process_pending_team_invitation();


-- 4. Undo grants the previous trigger made to accounts that never confirmed
UPDATE public.user_roles ur
SET is_active = false, updated_at = now()
FROM public.team_invitations ti
JOIN auth.users u ON lower(trim(u.email)) = lower(trim(ti.email))
WHERE ti.status = 'accepted'
  AND u.email_confirmed_at IS NULL
  AND ur.user_id = u.id
  AND ur.clinic_id = ti.clinic_id
  AND ur.role = ti.role
  AND ur.is_active;

UPDATE public.team_invitations ti
SET status = 'pending', accepted_at = NULL, updated_at = now()
FROM auth.users u
WHERE lower(trim(u.email)) = lower(trim(ti.email))
  AND ti.status = 'accepted'
  AND u.email_confirmed_at IS NULL;
