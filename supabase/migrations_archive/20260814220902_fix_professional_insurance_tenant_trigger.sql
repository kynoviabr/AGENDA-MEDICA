CREATE OR REPLACE FUNCTION public.enforce_professional_rule_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'professional_treatments' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.treatments t
      WHERE t.id = NEW.treatment_id
        AND t.clinic_id = NEW.clinic_id
    ) THEN
      RAISE EXCEPTION 'Treatment belongs to another clinic' USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'professional_health_insurances' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.health_insurances h
      WHERE h.id = NEW.health_insurance_id
        AND h.clinic_id = NEW.clinic_id
    ) THEN
      RAISE EXCEPTION 'Insurance belongs to another clinic' USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported table for professional tenant enforcement: %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_professional_rule_tenant() FROM PUBLIC, anon, authenticated;
