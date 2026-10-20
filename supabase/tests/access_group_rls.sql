-- Access-group permissions enforced by RLS. All fixtures are rolled back.
BEGIN;

CREATE TEMP TABLE rls_expectations (
  label text, user_id uuid, patients int, appointments int, leads int, conversations int
) ON COMMIT DROP;
GRANT ALL ON rls_expectations TO authenticated;

DO $$
DECLARE
  clinic_a constant uuid := '75000000-0000-0000-0000-000000000001';
  clinic_b constant uuid := '75000000-0000-0000-0000-000000000002';
  u_admin constant uuid := '76000000-0000-0000-0000-000000000001';
  u_recep constant uuid := '76000000-0000-0000-0000-000000000002';
  u_prof constant uuid := '76000000-0000-0000-0000-000000000003';
  u_sales constant uuid := '76000000-0000-0000-0000-000000000004';
  u_fin constant uuid := '76000000-0000-0000-0000-000000000005';
  u_other constant uuid := '76000000-0000-0000-0000-000000000006';
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
    (u_admin, 'rls-admin@test.invalid', now()),
    (u_recep, 'rls-recep@test.invalid', now()),
    (u_prof, 'rls-prof@test.invalid', now()),
    (u_sales, 'rls-sales@test.invalid', now()),
    (u_fin, 'rls-fin@test.invalid', now()),
    (u_other, 'rls-other@test.invalid', now());
  INSERT INTO public.clinics(id, name, slug) VALUES
    (clinic_a, 'RLS Clinic A', 'rls-clinic-a'),
    (clinic_b, 'RLS Clinic B', 'rls-clinic-b');

  INSERT INTO public.user_roles(user_id, clinic_id, role, is_active) VALUES
    (u_admin, clinic_a, 'admin', true),
    (u_recep, clinic_a, 'receptionist', true),
    (u_prof, clinic_a, 'professional', true),
    (u_sales, clinic_a, 'sales', true),
    (u_fin, clinic_a, 'receptionist', true),
    (u_other, clinic_b, 'admin', true);

  -- Financeiro member: swap the role group for the dashboard-only financeiro group
  UPDATE public.user_access_groups SET is_active = false WHERE user_id = u_fin AND clinic_id = clinic_a;
  INSERT INTO public.user_access_groups(clinic_id, user_id, group_id, is_active)
  SELECT clinic_a, u_fin, id, true FROM public.access_groups WHERE clinic_id = clinic_a AND code = 'financeiro';

  INSERT INTO public.patients(clinic_id, full_name) VALUES (clinic_a, 'RLS Patient A');
  INSERT INTO public.leads(clinic_id, full_name) VALUES (clinic_a, 'RLS Lead A');
  INSERT INTO public.appointments(clinic_id, start_time, end_time, duration_minutes, appointment_type)
  VALUES (clinic_a, now(), now() + interval '30 minutes', 30, 'consultation');
  INSERT INTO public.whatsapp_ai_conversations(clinic_id, phone) VALUES (clinic_a, '+5500000000000');

  INSERT INTO rls_expectations VALUES
    ('admin', u_admin, 1, 1, 1, 1),
    ('recepcao', u_recep, 1, 1, 1, 1),
    ('profissionais', u_prof, 1, 1, 1, 0),
    ('comercial', u_sales, 1, 1, 1, 1),
    ('financeiro', u_fin, 0, 0, 0, 0),
    ('other clinic admin', u_other, 0, 0, 0, 0);
END $$;

DO $$
DECLARE
  e RECORD;
  got_patients int;
  got_appointments int;
  got_leads int;
  got_conversations int;
  dashboard jsonb;
BEGIN
  FOR e IN SELECT * FROM rls_expectations LOOP
    PERFORM set_config('request.jwt.claim.sub', e.user_id::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO got_patients FROM public.patients WHERE full_name = 'RLS Patient A';
    SELECT count(*) INTO got_appointments FROM public.appointments WHERE clinic_id = '75000000-0000-0000-0000-000000000001';
    SELECT count(*) INTO got_leads FROM public.leads WHERE full_name = 'RLS Lead A';
    SELECT count(*) INTO got_conversations FROM public.whatsapp_ai_conversations WHERE phone = '+5500000000000';
    RESET ROLE;

    IF (got_patients, got_appointments, got_leads, got_conversations)
       IS DISTINCT FROM (e.patients, e.appointments, e.leads, e.conversations) THEN
      RAISE EXCEPTION '% expected patients/appointments/leads/conversations %/%/%/%, got %/%/%/%',
        e.label, e.patients, e.appointments, e.leads, e.conversations,
        got_patients, got_appointments, got_leads, got_conversations;
    END IF;
  END LOOP;

  -- Dashboard still counts appointments for financeiro, without names
  PERFORM set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000005', true);
  SET LOCAL ROLE authenticated;
  dashboard := public.get_clinic_dashboard_data('75000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
  RESET ROLE;
  IF jsonb_array_length(dashboard->'appointments') <> 1 THEN
    RAISE EXCEPTION 'financeiro dashboard should count 1 appointment, got %', dashboard->'appointments';
  END IF;

  -- Another clinic cannot read the dashboard
  PERFORM set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000006', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.get_clinic_dashboard_data('75000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
    RESET ROLE;
    RAISE EXCEPTION 'other clinic should not read the dashboard';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- Handoff RPCs bypass RLS, so they must check WhatsApp IA access themselves
  PERFORM set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000003', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.take_over_ai_conversation('75000000-0000-0000-0000-000000000001',
      (SELECT id FROM public.whatsapp_ai_conversations WHERE phone = '+5500000000000'));
    RESET ROLE;
    RAISE EXCEPTION 'profissionais should not take over WhatsApp conversations';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  RAISE NOTICE 'access group RLS tests passed';
END $$;

ROLLBACK;
