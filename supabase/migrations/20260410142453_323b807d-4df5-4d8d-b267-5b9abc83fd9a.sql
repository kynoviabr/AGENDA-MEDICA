
-- Create payers table
CREATE TABLE public.payers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views payers" ON public.payers FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates payers" ON public.payers FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff updates payers" ON public.payers FOR UPDATE TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Admin deletes payers" ON public.payers FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Add new columns to patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS is_self_payer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dissatisfaction_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dissatisfaction_level TEXT,
  ADD COLUMN IF NOT EXISTS dissatisfaction_reason TEXT;

-- Add cost column to treatments
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;

-- Trigger for updated_at on payers
CREATE TRIGGER update_payers_updated_at
  BEFORE UPDATE ON public.payers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
