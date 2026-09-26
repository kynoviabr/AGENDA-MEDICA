ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS additional_phones text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_additional_phones_limit
  CHECK (cardinality(additional_phones) <= 10);

COMMENT ON COLUMN public.professionals.additional_phones IS
  'Telefones adicionais do profissional. O contato principal permanece na coluna phone.';
