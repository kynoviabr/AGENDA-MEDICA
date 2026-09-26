-- Agenda Avançada - Orquestrador de Jobs (cron-safe)

CREATE TABLE IF NOT EXISTS public.agenda_job_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_name, run_key, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_agenda_job_executions_job_started
  ON public.agenda_job_executions (job_name, started_at DESC);

ALTER TABLE public.agenda_job_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic staff can view agenda job executions" ON public.agenda_job_executions;
CREATE POLICY "clinic staff can view agenda job executions"
ON public.agenda_job_executions
FOR SELECT
USING (clinic_id IS NULL OR public.is_clinic_staff(auth.uid(), clinic_id));
