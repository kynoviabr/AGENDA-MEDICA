-- Seed técnico E2E: garante 1 lead e 1 avaliação "scheduled" para a Agenda.
-- Seguro para reexecução (usa upsert com chave natural por nome/telefone).

DO $$
DECLARE
  v_clinic_id uuid;
  v_professional_user_id uuid;
  v_lead_id uuid;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT id INTO v_clinic_id
  FROM public.clinics
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma clínica encontrada para seed E2E.';
  END IF;

  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE clinic_id = v_clinic_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- Se não houver profissional cadastrado, mantém null para não quebrar seed.
  v_start := date_trunc('day', now()) + interval '14 days' + interval '14 hours';
  v_end := v_start + interval '60 minutes';

  INSERT INTO public.leads (
    clinic_id, full_name, phone, kanban_stage, source, priority_level, created_at, updated_at
  ) VALUES (
    v_clinic_id, 'E2E Agenda Seed', '11999990000', 'scheduled', 'Seed E2E', 'medium', now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE clinic_id = v_clinic_id
    AND full_name = 'E2E Agenda Seed'
    AND phone = '11999990000'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível obter lead E2E Agenda Seed.';
  END IF;

  INSERT INTO public.appointments (
    clinic_id, lead_id, patient_id, treatment_id, professional_id,
    appointment_type, start_time, end_time, scheduled_at, duration_minutes,
    status, notes, created_at, updated_at
  ) VALUES (
    v_clinic_id, v_lead_id, NULL, NULL, v_professional_user_id,
    'evaluation', v_start, v_end, v_start, 60,
    'scheduled', 'Seed E2E Agenda', now(), now()
  );

  UPDATE public.leads
  SET appointment_id = (
    SELECT id FROM public.appointments
    WHERE clinic_id = v_clinic_id AND lead_id = v_lead_id
    ORDER BY created_at DESC
    LIMIT 1
  ),
  stage_changed_at = now(),
  updated_at = now()
  WHERE id = v_lead_id;
END $$;
