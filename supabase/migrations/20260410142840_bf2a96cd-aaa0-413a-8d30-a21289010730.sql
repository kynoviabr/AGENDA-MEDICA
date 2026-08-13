
-- Add form data and validity fields to patient_anamneses
ALTER TABLE public.patient_anamneses
  ADD COLUMN IF NOT EXISTS form_data JSONB,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'valid';
