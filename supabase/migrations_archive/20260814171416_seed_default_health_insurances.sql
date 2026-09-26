-- Base inicial editável de marcas de convênios amplamente utilizadas no Brasil.
-- O registro ANS fica vazio porque uma mesma marca pode representar operadoras
-- regionais distintas; a clínica deve preenchê-lo conforme seu contrato.

INSERT INTO public.health_insurances (clinic_id, name, status)
SELECT clinic.id, insurance.name, 'active'
FROM public.clinics AS clinic
CROSS JOIN (
  VALUES
    ('Unimed'),
    ('Bradesco Saúde'),
    ('SulAmérica Saúde'),
    ('Amil'),
    ('Hapvida'),
    ('NotreDame Intermédica'),
    ('Porto Saúde'),
    ('Prevent Senior'),
    ('Care Plus'),
    ('CASSI')
) AS insurance(name)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_health_insurances_for_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.health_insurances (clinic_id, name, status)
  VALUES
    (NEW.id, 'Unimed', 'active'),
    (NEW.id, 'Bradesco Saúde', 'active'),
    (NEW.id, 'SulAmérica Saúde', 'active'),
    (NEW.id, 'Amil', 'active'),
    (NEW.id, 'Hapvida', 'active'),
    (NEW.id, 'NotreDame Intermédica', 'active'),
    (NEW.id, 'Porto Saúde', 'active'),
    (NEW.id, 'Prevent Senior', 'active'),
    (NEW.id, 'Care Plus', 'active'),
    (NEW.id, 'CASSI', 'active')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_health_insurances_for_clinic() FROM PUBLIC;

DROP TRIGGER IF EXISTS seed_default_health_insurances_after_clinic_insert ON public.clinics;
CREATE TRIGGER seed_default_health_insurances_after_clinic_insert
  AFTER INSERT ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_health_insurances_for_clinic();

COMMENT ON FUNCTION public.seed_default_health_insurances_for_clinic() IS
  'Cria uma base editável de convênios após o cadastro de uma clínica.';
