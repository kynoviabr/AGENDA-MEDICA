-- CRM follow-up / next action support

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_action_at
  ON public.leads(clinic_id, next_action_at);
