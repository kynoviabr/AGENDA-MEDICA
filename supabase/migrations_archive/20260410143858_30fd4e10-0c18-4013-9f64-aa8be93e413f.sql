
-- Add intelligence columns to session_feedback
ALTER TABLE public.session_feedback
  ADD COLUMN IF NOT EXISTS service_attention INTEGER CHECK (service_attention >= 1 AND service_attention <= 5),
  ADD COLUMN IF NOT EXISTS waiting_time INTEGER CHECK (waiting_time >= 1 AND waiting_time <= 5),
  ADD COLUMN IF NOT EXISTS treatment_id UUID REFERENCES public.treatments(id),
  ADD COLUMN IF NOT EXISTS professional_id UUID,
  ADD COLUMN IF NOT EXISTS is_negative BOOLEAN NOT NULL DEFAULT false;

-- Add professional_id and treatment_id to nps_responses if not exists  
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS classification TEXT;
