-- Role-to-access-group sync tests (and deactivated staff regression).
-- All fixtures are rolled back.
BEGIN;

DO $$
DECLARE
  clinic_a constant uuid := '73000000-0000-0000-0000-000000000001';
  user_a constant uuid := '74000000-0000-0000-0000-000000000001';
  user_b constant uuid := '74000000-0000-0000-0000-000000000002';
  user_c constant uuid := '74000000-0000-0000-0000-000000000003';
  user_e constant uuid := '74000000-0000-0000-0000-000000000005';
  user_d constant uuid := '74000000-0000-0000-0000-000000000004';
  role_sales_id uuid;
  comercial_perms text[];
  active_codes text[];
  role_admin_id uuid;
  role_rec_id uuid;
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (user_a, 'access-a@test.invalid'),
    (user_b, 'access-b@test.invalid');
  INSERT INTO public.clinics(id, name, slug) VALUES (clinic_a, 'Access Clinic A', 'access-clinic-a');

  -- Deactivated staff loses is_clinic_staff
  INSERT INTO public.user_roles(user_id, clinic_id, role, is_active)
  VALUES (user_a, clinic_a, 'receptionist', true) RETURNING id INTO role_rec_id;
  IF NOT public.is_clinic_staff(user_a, clinic_a) THEN
    RAISE EXCEPTION 'active receptionist should be staff';
  END IF;
  UPDATE public.user_roles SET is_active = false WHERE id = role_rec_id;
  IF public.is_clinic_staff(user_a, clinic_a) THEN
    RAISE EXCEPTION 'deactivated receptionist must not be staff';
  END IF;
  SELECT coalesce(array_agg(ag.code ORDER BY ag.code), '{}') INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_a AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes <> '{}'::text[] THEN
    RAISE EXCEPTION 'deactivated user should have no active groups, got %', active_codes;
  END IF;

  -- Role change revokes the previous group
  INSERT INTO public.user_roles(user_id, clinic_id, role, is_active)
  VALUES (user_b, clinic_a, 'admin', true) RETURNING id INTO role_admin_id;
  UPDATE public.user_roles SET role = 'receptionist' WHERE id = role_admin_id;
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_b AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['recepcao'] THEN
    RAISE EXCEPTION 'demoted admin should only keep recepcao, got %', active_codes;
  END IF;

  -- Deactivating one role keeps the groups of the other active role
  INSERT INTO public.user_roles(user_id, clinic_id, role, is_active)
  VALUES (user_b, clinic_a, 'professional', true);
  UPDATE public.user_roles SET is_active = false WHERE id = role_admin_id;
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_b AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['profissionais'] THEN
    RAISE EXCEPTION 'remaining professional role should keep profissionais, got %', active_codes;
  END IF;

  -- Manually assigned non-role groups are preserved
  INSERT INTO public.user_access_groups(clinic_id, user_id, group_id, is_active)
  SELECT clinic_a, user_b, id, true FROM public.access_groups WHERE clinic_id = clinic_a AND code = 'financeiro';
  UPDATE public.user_roles SET is_active = true WHERE id = role_admin_id;
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_b AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['financeiro', 'profissionais', 'recepcao'] THEN
    RAISE EXCEPTION 'financeiro should survive role sync, got %', active_codes;
  END IF;

  -- Deleting a role revokes its group
  DELETE FROM public.user_roles WHERE user_id = user_b AND clinic_id = clinic_a AND role = 'professional';
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_b AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['financeiro', 'recepcao'] THEN
    RAISE EXCEPTION 'deleted professional role should revoke profissionais, got %', active_codes;
  END IF;

  -- An invited account gets nothing until its email is confirmed
  INSERT INTO public.team_invitations(clinic_id, email, role) VALUES (clinic_a, 'Access-C@test.invalid', 'professional');
  INSERT INTO auth.users(id, email) VALUES (user_c, 'access-c@test.invalid');
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = user_c) THEN
    RAISE EXCEPTION 'unconfirmed invited user must not get a role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_invitations WHERE clinic_id = clinic_a AND email = 'Access-C@test.invalid' AND status = 'pending') THEN
    RAISE EXCEPTION 'invitation must stay pending until the email is confirmed';
  END IF;

  -- Confirming the email accepts the invitation and lands the user in the role's group
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = user_c;
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_c AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['profissionais'] THEN
    RAISE EXCEPTION 'confirmed invited professional should get profissionais, got %', active_codes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_invitations WHERE clinic_id = clinic_a AND email = 'Access-C@test.invalid' AND status = 'accepted') THEN
    RAISE EXCEPTION 'invitation should be accepted after email confirmation';
  END IF;

  -- A cancelled invitation grants nothing on confirmation
  INSERT INTO auth.users(id, email) VALUES (user_e, 'access-e@test.invalid');
  INSERT INTO public.team_invitations(clinic_id, email, role, status) VALUES (clinic_a, 'access-e@test.invalid', 'professional', 'cancelled');
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = user_e;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = user_e) THEN
    RAISE EXCEPTION 'cancelled invitation must not grant a role';
  END IF;

  -- A pending invitation stored for an already confirmed account is accepted at once
  INSERT INTO public.team_invitations(clinic_id, email, role) VALUES (clinic_a, 'access-e@test.invalid', 'receptionist')
  ON CONFLICT (clinic_id, email) DO UPDATE SET role = EXCLUDED.role, status = 'pending';
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = user_e AND role = 'receptionist' AND is_active) THEN
    RAISE EXCEPTION 'pending invitation for a confirmed account should grant the role';
  END IF;

  -- Commercial (sales) role is staff and only gets the comercial group
  INSERT INTO auth.users(id, email) VALUES (user_d, 'access-d@test.invalid');
  INSERT INTO public.user_roles(user_id, clinic_id, role, is_active)
  VALUES (user_d, clinic_a, 'sales', true) RETURNING id INTO role_sales_id;
  IF NOT public.is_clinic_staff(user_d, clinic_a) THEN
    RAISE EXCEPTION 'active commercial member should be staff';
  END IF;
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_d AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['comercial'] THEN
    RAISE EXCEPTION 'commercial member should only get comercial, got %', active_codes;
  END IF;
  SELECT array_agg(agp.permission_key ORDER BY agp.permission_key) INTO comercial_perms
  FROM public.access_group_permissions agp JOIN public.access_groups ag ON ag.id = agp.group_id
  WHERE ag.clinic_id = clinic_a AND ag.code = 'comercial' AND agp.can_view;
  IF 'appointments.view' = ANY (comercial_perms) THEN
    RAISE EXCEPTION 'comercial group must not see appointments, got %', comercial_perms;
  END IF;
  UPDATE public.user_roles SET is_active = false WHERE id = role_sales_id;
  IF public.is_clinic_staff(user_d, clinic_a) THEN
    RAISE EXCEPTION 'deactivated commercial member must not be staff';
  END IF;
  SELECT coalesce(array_agg(ag.code ORDER BY ag.code), '{}') INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_d AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes <> '{}'::text[] THEN
    RAISE EXCEPTION 'deactivated commercial member should have no active groups, got %', active_codes;
  END IF;

  RAISE NOTICE 'access control hardening tests passed';
END $$;

ROLLBACK;
