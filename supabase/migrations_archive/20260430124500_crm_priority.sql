-- CRM priority support

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS priority_level text NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_leads_priority_level
  ON public.leads(clinic_id, priority_level);
