
-- Team invitations table
CREATE TABLE public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL,
  invited_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages invitations"
ON public.team_invitations
FOR ALL
TO authenticated
USING (has_clinic_role(auth.uid(), clinic_id, 'admin'::app_role))
WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_team_invitations_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to process pending invitations on user creation
CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Check for pending invitations matching the new user's email
  FOR inv IN
    SELECT id, clinic_id, role
    FROM public.team_invitations
    WHERE email = NEW.email
      AND status = 'pending'
  LOOP
    -- Create the user role
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true)
    ON CONFLICT DO NOTHING;

    -- Mark invitation as accepted
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on auth.users to auto-process invitations
CREATE TRIGGER on_auth_user_created_process_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.process_team_invitation();
