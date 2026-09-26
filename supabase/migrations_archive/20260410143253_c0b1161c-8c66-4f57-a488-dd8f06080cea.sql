
-- Add compliance columns to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS upload_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'pending_upload',
  ADD COLUMN IF NOT EXISTS template_html TEXT;
