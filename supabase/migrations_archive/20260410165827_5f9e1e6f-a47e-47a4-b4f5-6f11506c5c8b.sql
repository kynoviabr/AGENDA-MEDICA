
ALTER TABLE public.professionals ADD COLUMN cpf TEXT;
CREATE UNIQUE INDEX idx_professionals_clinic_cpf ON public.professionals (clinic_id, cpf) WHERE cpf IS NOT NULL;
