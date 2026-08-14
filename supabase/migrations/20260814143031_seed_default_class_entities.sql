-- Entidades de classe essenciais do produto.
-- Backfill para clínicas existentes e criação automática para clínicas futuras.

INSERT INTO public.class_entities (
  clinic_id,
  name,
  abbreviation,
  description,
  linked_professionals,
  status
)
SELECT
  clinic.id,
  entity.name,
  entity.abbreviation,
  entity.description,
  entity.linked_professionals,
  'active'
FROM public.clinics AS clinic
CROSS JOIN (
  VALUES
    ('Conselho Regional de Medicina', 'CRM', 'Registro regional para médicos.', 'Médicos'),
    ('Conselho Federal de Medicina', 'CFM', 'Entidade federal de fiscalização da medicina.', 'Médicos'),
    ('Conselho Regional de Odontologia', 'CRO', 'Registro profissional para cirurgiões-dentistas.', 'Dentistas'),
    ('Conselho Regional de Biomedicina', 'CRBM', 'Registro profissional para biomédicos.', 'Biomédicos'),
    ('Conselho Regional de Enfermagem', 'COREN', 'Registro profissional para enfermeiros e técnicos de enfermagem.', 'Enfermeiros; Técnicos de enfermagem')
) AS entity(name, abbreviation, description, linked_professionals)
ON CONFLICT (clinic_id, abbreviation) DO UPDATE
SET
  name = EXCLUDED.name,
  description = COALESCE(public.class_entities.description, EXCLUDED.description),
  linked_professionals = COALESCE(public.class_entities.linked_professionals, EXCLUDED.linked_professionals),
  status = 'active';

CREATE OR REPLACE FUNCTION public.seed_default_class_entities_for_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.class_entities (
    clinic_id,
    name,
    abbreviation,
    description,
    linked_professionals,
    status
  )
  VALUES
    (NEW.id, 'Conselho Regional de Medicina', 'CRM', 'Registro regional para médicos.', 'Médicos', 'active'),
    (NEW.id, 'Conselho Federal de Medicina', 'CFM', 'Entidade federal de fiscalização da medicina.', 'Médicos', 'active'),
    (NEW.id, 'Conselho Regional de Odontologia', 'CRO', 'Registro profissional para cirurgiões-dentistas.', 'Dentistas', 'active'),
    (NEW.id, 'Conselho Regional de Biomedicina', 'CRBM', 'Registro profissional para biomédicos.', 'Biomédicos', 'active'),
    (NEW.id, 'Conselho Regional de Enfermagem', 'COREN', 'Registro profissional para enfermeiros e técnicos de enfermagem.', 'Enfermeiros; Técnicos de enfermagem', 'active')
  ON CONFLICT (clinic_id, abbreviation) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_class_entities_for_clinic() FROM PUBLIC;

DROP TRIGGER IF EXISTS seed_default_class_entities_after_clinic_insert ON public.clinics;
CREATE TRIGGER seed_default_class_entities_after_clinic_insert
  AFTER INSERT ON public.clinics
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_class_entities_for_clinic();

COMMENT ON FUNCTION public.seed_default_class_entities_for_clinic() IS
  'Cria as entidades profissionais padrão após o cadastro de uma clínica.';
