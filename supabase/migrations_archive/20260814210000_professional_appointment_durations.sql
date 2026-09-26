ALTER TABLE public.professional_settings
  ADD COLUMN private_appointment_duration_minutes integer NOT NULL DEFAULT 60
  CHECK (private_appointment_duration_minutes BETWEEN 5 AND 480);

ALTER TABLE public.professional_health_insurances
  ADD COLUMN appointment_duration_minutes integer NOT NULL DEFAULT 20
  CHECK (appointment_duration_minutes BETWEEN 5 AND 480);

ALTER TABLE public.appointments
  ADD COLUMN billing_type text NOT NULL DEFAULT 'private'
    CHECK (billing_type IN ('private', 'insurance')),
  ADD COLUMN health_insurance_id uuid,
  ADD CONSTRAINT appointments_health_insurance_clinic_fkey
    FOREIGN KEY (health_insurance_id, clinic_id)
    REFERENCES public.health_insurances(id, clinic_id);

CREATE INDEX appointments_health_insurance_idx
  ON public.appointments (clinic_id, health_insurance_id)
  WHERE health_insurance_id IS NOT NULL;

COMMENT ON COLUMN public.professional_settings.private_appointment_duration_minutes IS
  'Duração padrão, em minutos, da consulta particular deste profissional.';
COMMENT ON COLUMN public.professional_health_insurances.appointment_duration_minutes IS
  'Duração padrão, em minutos, da consulta deste profissional por este convênio.';

CREATE OR REPLACE FUNCTION public.create_appointment_secure(
  p_clinic_id uuid, p_location_id uuid, p_professional_id uuid,
  p_patient_id uuid, p_lead_id uuid, p_treatment_id uuid,
  p_start_time timestamptz, p_appointment_type text DEFAULT 'treatment_session',
  p_notes text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL,
  p_contract_id uuid DEFAULT NULL, p_contract_item_id uuid DEFAULT NULL,
  p_billing_type text DEFAULT 'private', p_health_insurance_id uuid DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_duration integer; v_end timestamptz; v_result public.appointments;
BEGIN
  IF p_billing_type NOT IN ('private', 'insurance') THEN
    RAISE EXCEPTION 'AGENDA_INVALID_BILLING_TYPE' USING ERRCODE='22023';
  END IF;
  IF p_billing_type = 'insurance' AND NOT EXISTS (
    SELECT 1 FROM public.professional_health_insurances phi
    WHERE phi.clinic_id = p_clinic_id
      AND phi.professional_id = p_professional_id
      AND phi.health_insurance_id = p_health_insurance_id
      AND phi.status = 'active'
  ) THEN
    RAISE EXCEPTION 'AGENDA_INVALID_PROFESSIONAL_INSURANCE' USING ERRCODE='22023';
  END IF;

  v_duration := COALESCE(
    p_duration_minutes,
    CASE WHEN p_billing_type = 'insurance' THEN (
      SELECT phi.appointment_duration_minutes
      FROM public.professional_health_insurances phi
      WHERE phi.clinic_id = p_clinic_id
        AND phi.professional_id = p_professional_id
        AND phi.health_insurance_id = p_health_insurance_id
        AND phi.status = 'active'
    ) ELSE (
      SELECT ps.private_appointment_duration_minutes
      FROM public.professional_settings ps
      WHERE ps.clinic_id = p_clinic_id AND ps.professional_id = p_professional_id
    ) END,
    public.resolve_appointment_duration(p_clinic_id,p_professional_id,p_treatment_id)
  );
  IF v_duration < 5 OR v_duration > 480 THEN RAISE EXCEPTION 'AGENDA_INVALID_DURATION' USING ERRCODE='22023'; END IF;
  v_end:=p_start_time+make_interval(mins=>v_duration);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  PERFORM public.assert_appointment_slot(p_clinic_id,p_location_id,p_professional_id,p_treatment_id,p_start_time,v_end,NULL);
  INSERT INTO public.appointments(clinic_id,location_id,professional_id,patient_id,lead_id,treatment_id,
    contract_id,contract_item_id,start_time,end_time,scheduled_at,duration_minutes,appointment_type,notes,created_by,billing_type,health_insurance_id)
  VALUES(p_clinic_id,p_location_id,p_professional_id,p_patient_id,p_lead_id,p_treatment_id,
    p_contract_id,p_contract_item_id,p_start_time,v_end,p_start_time,v_duration,p_appointment_type,p_notes,(SELECT auth.uid()),p_billing_type,
    CASE WHEN p_billing_type = 'insurance' THEN p_health_insurance_id ELSE NULL END)
  RETURNING * INTO v_result;
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AGENDA_SLOT_CONFLICT' USING ERRCODE='23P01';
END $$;

REVOKE ALL ON FUNCTION public.create_appointment_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_appointment_secure(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text,text,integer,uuid,uuid,text,uuid) TO authenticated,service_role;
