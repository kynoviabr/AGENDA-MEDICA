-- Role-to-access-group sync tests (and deactivated staff regression).
-- All fixtures are rolled back.
BEGIN;

DO $$
DECLARE
  clinic_a constant uuid := '73000000-0000-0000-0000-000000000001';
  user_a constant uuid := '74000000-0000-0000-0000-000000000001';
  user_b constant uuid := '74000000-0000-0000-0000-000000000002';
  user_c constant uuid := '74000000-0000-0000-0000-000000000003';
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

  -- Accepted invitation still lands the user in the role's group
  INSERT INTO public.team_invitations(clinic_id, email, role) VALUES (clinic_a, 'Access-C@test.invalid', 'professional');
  INSERT INTO auth.users(id, email) VALUES (user_c, 'access-c@test.invalid');
  SELECT array_agg(ag.code ORDER BY ag.code) INTO active_codes
  FROM public.user_access_groups uag JOIN public.access_groups ag ON ag.id = uag.group_id
  WHERE uag.user_id = user_c AND uag.clinic_id = clinic_a AND uag.is_active;
  IF active_codes IS DISTINCT FROM ARRAY['profissionais'] THEN
    RAISE EXCEPTION 'invited professional should get profissionais, got %', active_codes;
  END IF;

  RAISE NOTICE 'access control hardening tests passed';
END $$;

ROLLBACK;
