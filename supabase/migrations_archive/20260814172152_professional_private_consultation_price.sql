ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS private_consultation_price numeric(12,2);

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_private_consultation_price_nonnegative
  CHECK (private_consultation_price IS NULL OR private_consultation_price >= 0);

COMMENT ON COLUMN public.professionals.private_consultation_price IS
  'Valor padrão da consulta particular deste profissional, em reais.';
